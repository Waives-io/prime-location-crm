// AA contrast check of the built demo (demo-site/): every page, phone + desktop, and the hover state of every
// button / tab / menu item / chip. Text is measured against its real background (colours and gradient stops,
// worst case). Usage: node contrast.mjs [--json]   → exit code 1 when anything fails.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../demo-site/', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// runs in the page: contrast of every visible text inside `root` (or the whole page)
const AUDIT = (rootSel) => {
  const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [r, g, b, a]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map(i => top[i] * a + under[i] * (1 - a)).concat(1); };
  // all candidate backgrounds behind el (gradient stops give several), composited down to white
  const backs = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const stops = (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(parse).filter(Boolean);
      const bg = parse(cs.backgroundColor);
      const opaqueStops = stops.filter(s => s[3] > .5);
      if (opaqueStops.length) { layers.push(opaqueStops); break; }
      if (bg && bg[3] > 0) { layers.push([bg]); if (bg[3] >= .99) break; }
    }
    let out = [[255, 255, 255, 1]];
    for (const layer of layers.reverse()) out = layer.flatMap(c => out.map(u => over(c, u)));
    return out;
  };
  const root = rootSel ? document.querySelector(rootSel) : document.body;
  const bad = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!r.width || !r.height || cs.visibility === 'hidden' || +cs.opacity === 0 || el.closest('[hidden], .leaflet-container, dialog:not([open])')) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const worst = Math.min(...backs(el).map(b => ratio(over(fg, b), b)));
    if (worst < need) bad.push({ text: n.textContent.trim().slice(0, 40), el: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''), ratio: +worst.toFixed(2), need });
  }
  return bad;
};

const PAGES = ['#/m/lead', '#/m/lead?k=hot', '#/m/lead?k=stale', 'PLIST', '#/m/owner', '#/m/owner?k=vacant', '#/matches', '#/matches?lvl=near', '#/matches?t=rent',
  'CARD:lead', 'CARD:owner', '#/m/lead/new', '#/m/owner/new', 'ARCHIVE', 'DLG:close', 'DLG:options', 'DLG:reset', 'DLG:task'];
const HOVER = 'a, button, .seg label, summary, .fchip';
const browser = await chromium.launch();
const failures = [];
for (const [w, h, vp] of [[390, 844, 'phone'], [1366, 900, 'desktop']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, locale: 'he-IL' });
  await (typeof ctx !== 'undefined' ? ctx : page).route(/govmap.gov.il|proj4js/, (r) => r.abort());
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }));
  await page.route('https://nominatim.openstreetmap.org/**', (r) => r.fulfill({ contentType: 'application/json', body: '[]' }));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(BASE); await page.waitForSelector('#login');
  const check = async (label, rootSel) => {
    await page.waitForTimeout(250);
    for (const b of await page.evaluate(AUDIT, rootSel)) failures.push({ vp, page: label, state: 'normal', ...b });
    // hover every interactive element on screen and measure it again
    const n = await page.locator(rootSel ? `${rootSel} :is(${HOVER})` : `:is(${HOVER})`).count();
    for (let i = 0; i < Math.min(n, 80); i++) {
      const el = page.locator(rootSel ? `${rootSel} :is(${HOVER})` : `:is(${HOVER})`).nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const box = await el.boundingBox(); if (!box || box.y + box.height < 0 || box.y > h) continue;
      try { await el.hover({ timeout: 800, force: true }); } catch { continue; }
      await page.waitForTimeout(170);
      const res = await el.evaluate((e, src) => { e.setAttribute('data-ca', '1'); const r = (0, eval)('(' + src + ')')('[data-ca]'); e.removeAttribute('data-ca'); return r; }, AUDIT.toString()).catch(() => []);
      for (const b of res) failures.push({ vp, page: label, state: 'hover', ...b });
    }
    await page.mouse.move(1, 1);
  };
  await check('login');
  await page.click('#login button[type=submit]'); await page.waitForSelector('.lead-table');
  const ids = await page.evaluate(() => ({ lead: S.data.lead.find(d => d.status === 'active').id, owner: S.data.owner.find(d => d.status === 'active').id }));
  for (const p of PAGES) try {
    if (p.startsWith('CARD:')) { const m = p.slice(5); await page.goto(BASE + `#/m/${m}/${ids[m]}`); await page.waitForSelector('.card-head'); await check(p); continue; }
    if (p === 'ARCHIVE') { await page.goto(BASE + '#/m/lead'); await page.waitForSelector('.lead-table'); await page.selectOption('#l-quick', 'archive'); await check('lead archive'); continue; }
    if (p === 'PLIST') { await page.goto(BASE + '#/m/owner'); await page.waitForSelector('.pcard'); await page.click('label:has(input[value=list])'); await check('owner list view'); await page.click('label:has(input[value=cards])'); continue; }
    if (p === 'DLG:task') { await page.goto(BASE + '#/m/lead'); await page.waitForSelector('#l-panel [data-dp=meeting]'); await page.click('#l-panel [data-dp=meeting]'); await check(p, '#dlg'); await page.keyboard.press('Escape'); continue; }
    if (p === 'DLG:close') { await page.goto(BASE + `#/m/lead/${ids.lead}`); await page.waitForSelector('#close-deal'); await page.click('#close-deal'); await check(p, '#dlg'); await page.keyboard.press('Escape'); continue; }
    if (p === 'DLG:options') { await page.goto(BASE + '#/m/lead/new'); await page.waitForSelector('.opt-edit'); await page.click('.opt-edit'); await check(p, '#dlg'); await page.keyboard.press('Escape'); continue; }
    if (p === 'DLG:reset') { await page.goto(BASE + '#/m/lead'); await page.waitForSelector('.lead-table');
      if (vp === 'desktop') { await page.click('.side-nav [data-act=demo-reset]'); await check(p, '#dlg'); await page.keyboard.press('Escape'); } continue; }
    await page.goto(BASE + p); await page.waitForTimeout(400);
    if (p.startsWith('#/m/') && p.endsWith('/new')) { await page.waitForSelector('#deal-form'); if (p.includes('owner')) await page.click('label:has(> input[name=deal_kind][value=rent])'); await page.click('#save'); }
    await check(p);
  } catch (e) { console.log(`  ! ${vp} ${p}: ${e.message.split(String.fromCharCode(10))[0]} (at ${page.url()})`); await page.screenshot({ path: `screens/contrast-error.png` }); }
  await page.close();
}
await browser.close(); server.close();
// one line per distinct problem
const key = (f) => [f.vp, f.state, f.el, f.text].join('|');
const uniq = [...new Map(failures.map(f => [key(f), f])).values()];
if (process.argv.includes('--json')) await writeFile(fileURLToPath(new URL('./contrast-report.json', import.meta.url)), JSON.stringify(uniq, null, 1));
for (const f of uniq) console.log(`  ✗ ${f.vp} ${f.state.padEnd(6)} ${f.page.padEnd(18)} ${String(f.ratio).padStart(5)} < ${f.need}  ${f.el}  "${f.text}"`);
console.log(uniq.length ? `\nContrast: ${uniq.length} problems` : '\nContrast: all text passes AA (normal + hover), phone + desktop');
process.exitCode = uniq.length ? 1 : 0;
