// Renders each design proposal (design-proposals/<dir>/<prefix>-N.css) on the built demo dashboard,
// then puts them side by side: design-proposals/<dir>/overview.png.
// Usage: node palettes.mjs [dir=palettes] [prefix=palette] [title]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../demo-site/', import.meta.url));
const [DIR = 'palettes', PREFIX = 'palette', TITLE = '5 פלטות לדשבורד – נדל״ן בע״מ'] = process.argv.slice(2);
const OUT = fileURLToPath(new URL(`../design-proposals/${DIR}/`, import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const files = (await readdir(OUT)).filter(f => new RegExp(`^${PREFIX}-\\d\\.css$`).test(f)).sort();
const browser = await chromium.launch();
const cards = [];
for (const f of files) {
  const css = await readFile(join(OUT, f), 'utf8');
  const name = (css.match(/\/\*\s*([^*]+?)\s*\*\//) || [, f])[1].replace(/\s+/g, ' ');
  for (const [w, h, tag] of [[390, 1500, 'phone'], [1366, 900, 'desktop']]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, locale: 'he-IL' });
    await (typeof ctx !== 'undefined' ? ctx : page).route(/govmap.gov.il|proj4js/, (r) => r.abort());
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }));
    await page.goto(BASE);
    await page.click('#login button[type=submit]'); await page.waitForSelector('#dash-kpis');
    await page.addStyleTag({ content: css });
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, f.replace('.css', `-${tag}.png`)) });
    await page.close();
  }
  cards.push({ n: f.match(/\d/)[0], name, img: f.replace('.css', '-phone.png') });
}
await writeFile(join(OUT, 'overview.html'), `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@500;800&display=swap" rel="stylesheet">
<style>body{margin:0;padding:28px;font-family:Heebo;background:#f3f3f1}h1{margin:0 0 20px;font-size:28px}
.row{display:grid;grid-template-columns:repeat(${cards.length},1fr);gap:18px}.c{background:#fff;border-radius:14px;padding:12px}
.c h2{margin:0 0 4px;font-size:22px}.c p{margin:0 0 10px;font-size:14px;color:#444;min-height:40px}.c img{width:100%;border-radius:8px;display:block}</style>
<h1>${TITLE}</h1><div class="row">${cards.map(c => `<div class="c"><h2>${c.n}</h2><p>${c.name}</p><img src="${c.img}"></div>`).join('')}</div></html>`);
const page = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
await page.goto(pathToFileURL(join(OUT, 'overview.html')).href);
await page.waitForTimeout(800);
await page.screenshot({ path: join(OUT, 'overview.png'), fullPage: true });
await browser.close(); server.close();
console.log('rendered', files.join(', '));
