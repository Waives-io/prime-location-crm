// Headless QA of the built demo (demo-site/, run `node tools/build-demo.mjs` first).
// Usage: node demo.e2e.mjs [--shots]   (screenshots → qa/screens/demo-*.png, 390px)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('../demo-site/', import.meta.url));
const SHOTS = fileURLToPath(new URL('./screens/', import.meta.url));
const shots = process.argv.includes('--shots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'he-IL' });
await ctx.route(/supabase/, (r) => { throw new Error('demo must never call Supabase: ' + r.request().url()); });
await ctx.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }));
await ctx.route('https://nominatim.openstreetmap.org/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ display_name: 'אזור התעשייה, קריית גת', address: { industrial: 'אזור התעשייה', city: 'קריית גת' } }) }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Invalid login credentials/.test(m.text())) errors.push(m.text()); });

let pass = 0;
const ok = (n) => { pass++; console.log('  ✓', n); };
const shot = async (name, full = false) => { if (shots) { await mkdir(SHOTS, { recursive: true }); await page.waitForTimeout(400); await page.screenshot({ path: SHOTS + 'demo-' + name + '.png', fullPage: full }); } };
const text = (sel) => page.locator(sel).innerText();
const keys = () => page.evaluate(() => Object.keys(localStorage).sort());

try {
  /* ── login ── */
  await page.goto(BASE);
  // a live-app session on the same origin must survive everything the demo does
  await page.evaluate(() => localStorage.setItem('sb-tbuhhxcgkxuovbdtebqv-auth-token', 'LIVE'));
  await page.reload();
  assert.equal(await page.inputValue('#email'), 'broker@nadlan-demo.co.il');
  assert.ok((await page.inputValue('#password')).length >= 8);
  assert.match(await text('#login button[type=submit]'), /כניסה לדמו/);
  assert.match(await text('.credit'), /WAIVES/);
  assert.equal(await page.title(), 'נדל״ן בע״מ · דמו CRM');
  await shot('01-login');
  ok('login: demo brand, credentials prefilled, "נבנה ע״י WAIVES"');
  await page.fill('#password', 'wrong'); await page.click('#login button[type=submit]');
  await page.waitForSelector('#login-err:has-text("שגויים")');
  ok('login is real: wrong password → error');
  await page.reload(); await page.click('#login button[type=submit]');
  await page.waitForSelector('#dash-urgent');
  ok('login → dashboard is the home screen');

  /* ── dashboard ── */
  const order = await page.$$eval('.dash-sec h2', hs => hs.map(h => h.textContent));
  assert.deepEqual(order, ['לטיפול היום', 'התאמות חמות', 'היצע מול ביקוש', 'קצב וסגירות']);
  assert.match(await text('.demo-banner'), /סביבת הדגמה/);
  const navs = await page.$$eval('.bottom-nav > *', a => a.map(x => x.textContent.trim()));
  assert.deepEqual(navs, ['לוח עבודה', 'מתעניינים', '+ חדש', 'נכסים']);
  ok('dashboard: 4 sections in order, demo banner, bottom bar לוח · מתעניינים · + חדש · נכסים');
  const soon = await page.$$eval('#dash-urgent .urgent.red, #dash-urgent .urgent.yellow', l => l.length);
  assert.ok(soon >= 3, 'needed-soon rows'); assert.ok(await page.locator('#dash-urgent .urgent.red').count() >= 1);
  assert.ok(await page.locator('#dash-urgent .urgent.stale').count() >= 3);
  ok('לטיפול היום: needed soon (red ≤ 2 days, yellow ≤ 7) and "לא עודכן 30+ יום"');
  const hot = await page.locator('#dash-matches .match').count();
  assert.ok(hot >= 3 && hot <= 5);
  assert.ok(await page.locator('#dash-matches .mchip').count() >= hot * 3);
  ok('התאמות חמות: 3–5 cards, each explained with chips');
  const kpis = await page.$$eval('.kpi strong', k => k.map(x => x.textContent));
  assert.equal(kpis.length, 4); assert.ok(+kpis[0] > 0 && +kpis[1] > 0);
  ok(`קצב וסגירות: ${kpis.join(' / ')} (new / closed / not relevant / avg days)`);
  await shot('02-dashboard'); await shot('02-dashboard-full', true);

  /* ── supply / demand → filtered list, survives refresh, chip clears ── */
  const sdLink = page.locator('#dash-supply .sd-n').first();
  const sdHref = await sdLink.getAttribute('href');
  await sdLink.click(); await page.waitForSelector('.filter-chip');
  const filtered = await page.locator('#rows .deal-row').count();
  assert.ok(filtered >= 1);
  await page.reload(); await page.waitForSelector('.filter-chip');
  assert.equal(await page.locator('#rows .deal-row').count(), filtered);
  assert.ok(page.url().endsWith(sdHref));
  await shot('03-filtered-list');
  await page.click('.filter-chip a'); await page.waitForSelector('.tabs:not([hidden])');
  assert.ok(await page.locator('#rows .deal-row').count() > filtered);
  ok('היצע מול ביקוש: tap → filtered list with "✕" chip, refresh keeps it, ✕ clears');
  await page.goBack(); await page.waitForSelector('.filter-chip');
  ok('back returns to the filtered list');

  /* ── matches screen + card matches in both directions ── */
  await page.goto(BASE + '#/matches'); await page.waitForSelector('.ml-group');
  assert.match(await text('.topbar .back'), /חזרה ללוח/);
  await shot('04-matches');
  await page.goto(BASE + '#/'); await page.waitForSelector('#dash-matches .match a');
  await page.locator('#dash-matches .match a').first().click();
  await page.waitForSelector('.card-matches');
  assert.match(await text('.card-matches h3'), /נכסים מתאימים/);
  await shot('05-lead-card', true);
  await page.locator('.card-matches .match a').first().click();
  await page.waitForSelector('.card-matches h3:has-text("מתעניינים מתאימים")');
  assert.ok(await page.locator('.card-matches .match').count() >= 1);
  ok('matches: dashboard card → lead card "נכסים מתאימים" → property card "מתעניינים מתאימים"');

  /* ── demo: calling / WhatsApp only explain ── */
  await page.click('.actions a.btn.primary'); // חיוג
  await page.waitForSelector('#toast.show:has-text("המספרים בדויים")');
  assert.ok(page.url().startsWith(BASE));
  ok('demo: חיוג / WhatsApp do not dial, a toast explains');

  /* ── property with asking rent: saves and changes matching ── */
  await page.goto(BASE + '#/m/owner'); await page.waitForSelector('#rows .deal-row');
  const coolRow = page.locator('#rows .deal-row', { hasText: 'ורד שושן' });
  await coolRow.locator('a').click(); await page.waitForSelector('.card-head');
  assert.ok(!(await page.locator('.dl').innerText()).includes('שכירות מבוקשת'));
  await page.click('a:has-text("עריכה")'); await page.waitForSelector('#asking_rent');
  await page.fill('#asking_rent', '10800'); await page.click('#save');
  await page.waitForSelector('.card-head');
  assert.match(await page.locator('.dl').innerText(), /שכירות מבוקשת לחודש[\s\S]*10,800/);
  assert.ok(await page.locator('.card-matches .match:not(.is-near)').count() >= 1);
  ok('נכס להשכרה: "שכירות מבוקשת לחודש" saved, shown on the card, and the renter now matches');

  /* ── purpose group inside "עריכת הרשימה" ── */
  await page.goto(BASE + '#/m/lead/new'); await page.waitForSelector('#purpose_id');
  await page.click('[data-field=purpose_id] .opt-edit'); await page.waitForSelector('#dlg[open] select[data-a=group]');
  const groupCount = await page.locator('#dlg select[data-a=group]').count();
  assert.equal(groupCount, await page.locator('#dlg li[data-id]').count());
  await page.locator('#dlg select[data-a=group]').first().selectOption('industry');
  await page.waitForSelector('#toast.show:has-text("קבוצת ההתאמה עודכנה")');
  await shot('06-groups');
  await page.locator('#dlg select[data-a=group]').first().selectOption('storage');
  await page.click('#dlg [data-a=close]');
  ok('עריכת הרשימה: every value has a "קבוצת התאמה" picker that saves on change');

  /* ── "+ חדש" on the dashboard asks which kind ── */
  await page.goto(BASE + '#/'); await page.waitForSelector('#dash-urgent');
  await page.click('.bottom-nav [data-act=new-choice]');
  await page.click('#dlg a:has-text("נכס חדש")');
  await page.waitForSelector('#deal-form');
  assert.ok(page.url().endsWith('#/m/owner/new'));
  ok('"+ חדש" on the dashboard → choice → new property form');

  /* ── persistence, reset, storage isolation ── */
  await page.goto(BASE + '#/'); await page.reload(); await page.waitForSelector('#dash-urgent');
  await page.goto(BASE + '#/m/owner/' + (await page.evaluate(() => S.data.owner.find(o => o.contact.name === 'ורד שושן').id)));
  await page.waitForSelector('.dl');
  assert.match(await page.locator('.dl').innerText(), /10,800/);
  ok('changes survive a reload (stored in this browser)');
  assert.ok(!(await page.locator('[data-act=password]').count()), 'no password change in the demo');
  await page.goto(BASE + '#/'); await page.waitForSelector('#dash-urgent');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('.side-nav [data-act=demo-reset]');
  await page.click('#dlg [data-yes]'); await page.waitForSelector('#toast.show:has-text("הדמו אופס")');
  const shu = await page.evaluate(() => S.data.owner.find(o => o.contact.name === 'ורד שושן'));
  assert.equal(shu.asking_rent, null);
  await page.setViewportSize({ width: 390, height: 844 });
  ok('"איפוס הדמו" (menu, confirm) → seed data back; no "שינוי סיסמה" in the demo');
  const ks = await keys();
  assert.deepEqual(ks.filter(k => !k.startsWith('nadlan-demo:v1:')), ['sb-tbuhhxcgkxuovbdtebqv-auth-token']);
  assert.equal(await page.evaluate(() => localStorage.getItem('sb-tbuhhxcgkxuovbdtebqv-auth-token')), 'LIVE');
  ok('storage: demo keys all "nadlan-demo:v1:*"; the live app\'s key on the same origin is untouched');

  /* ── month change: untouched → fresh seed; changed → dates move forward ── */
  const rebase = await page.evaluate(async (dirty) => {
    const k = 'nadlan-demo:v1:data', db = JSON.parse(localStorage.getItem(k));
    const before = db.lead[0].needed_by;
    const d = new Date(db.anchor); d.setDate(d.getDate() - 40); db.anchor = d.toISOString().slice(0, 10);
    db.dirty = true; db.lead[0].notes = 'נערך';
    localStorage.setItem(k, JSON.stringify(db));
    return before;
  });
  await page.reload(); await page.waitForSelector('#dash-urgent');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('nadlan-demo:v1:data')));
  assert.equal(after.lead[0].notes, 'נערך');
  const shift = (new Date(after.lead[0].needed_by) - new Date(rebase)) / 86400000;
  assert.equal(Math.round(shift), 40);
  ok('new month with visitor changes: changes kept, all dates move forward');
  await page.evaluate(() => { const k = 'nadlan-demo:v1:data', db = JSON.parse(localStorage.getItem(k)); db.anchor = '2020-01-01'; db.dirty = false; db.lead[0].notes = 'X'; localStorage.setItem(k, JSON.stringify(db)); });
  await page.reload(); await page.waitForSelector('#dash-urgent');
  assert.notEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('nadlan-demo:v1:data')).lead[0].notes), 'X');
  ok('new month, untouched demo: fresh seed');

  /* ── logout / login again ── */
  await page.click('.hero-user [data-act=logout], .side-nav [data-act=logout]').catch(async () => { await page.setViewportSize({ width: 1280, height: 900 }); await page.click('.side-nav [data-act=logout]'); });
  await page.waitForSelector('#login'); await page.setViewportSize({ width: 390, height: 844 });
  ok('logout → login screen');

  /* desktop */
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('#login button[type=submit]'); await page.waitForSelector('#dash-urgent');
  assert.equal(await page.locator('.side-nav .nav-board[aria-current=page]').count(), 1);
  if (shots) { await page.waitForTimeout(400); await page.screenshot({ path: SHOTS + 'demo-07-desktop.png' }); }
  ok('desktop: side menu with "לוח עבודה" active');

  assert.deepEqual(errors, []);
  ok('no JS errors in the console');
  console.log(`\nDemo E2E passed: ${pass}`);
} catch (e) {
  console.error('\nFAILED:', e.message);
  try { await page.screenshot({ path: SHOTS + 'demo-failure.png', fullPage: true }); } catch {}
  if (errors.length) console.error('console errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close(); server.close();
}
