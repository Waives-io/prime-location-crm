// Quick smoke run of the demo screens (no assertions beyond "no JS errors"); screenshots → qa/screens/v3-*.png
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../demo-site/', import.meta.url));
const SHOTS = fileURLToPath(new URL('./screens/', import.meta.url));
const T = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (q, r) => {
  const p = normalize(decodeURIComponent(new URL(q.url, 'http://x').pathname)).replace(/^[\\/]+/, '') || 'index.html';
  try { const b = await readFile(join(ROOT, p)); r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const errors = [];
for (const [w, h, tag] of [[1440, 900, 'desk'], [390, 844, 'phone']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, locale: 'he-IL' });
  page.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
  await (typeof ctx !== 'undefined' ? ctx : page).route(/govmap.gov.il|proj4js/, (r) => r.abort());
  await page.route('https://tile.openstreetmap.org/**', r => r.fulfill({ status: 204 }));
  await page.goto(BASE); await page.waitForSelector('#login');
  await page.screenshot({ path: SHOTS + `v3-${tag}-login.png` });
  await page.click('#login button[type=submit]');
  await page.waitForSelector('.lead-table'); await page.waitForTimeout(400);
  await page.screenshot({ path: SHOTS + `v3-${tag}-leads.png`, fullPage: tag === 'phone' });
  await page.locator('#l-rows tr[data-id]').nth(2).click(); await page.waitForTimeout(200);
  await page.selectOption('#l-quick', 'all'); await page.click('.pg[data-pg="2"]').catch(() => {});
  await page.goto(BASE + '#/m/owner'); await page.waitForSelector('.pcard'); await page.waitForTimeout(500);
  await page.screenshot({ path: SHOTS + `v3-${tag}-props.png`, fullPage: tag === 'phone' });
  await page.click('label:has(input[value=list])'); await page.waitForTimeout(200);
  await page.click('label:has(input[value=cards])');
  await page.locator('.pcard').nth(1).click();
  await page.click('[data-dp=task]'); await page.fill('#act-text', 'בדיקה'); await page.click('#act-form button[type=submit]'); await page.waitForTimeout(400);
  await page.goto(BASE + '#/m/lead?k=hot'); await page.waitForSelector('.lead-table');
  await page.goto(BASE + '#/matches'); await page.waitForTimeout(300);
  await page.goto(BASE + '#/m/lead/new'); await page.waitForSelector('#deal-form');
  await page.screenshot({ path: SHOTS + `v3-${tag}-form.png` });
  await page.close();
}
await browser.close(); server.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'smoke ok, no JS errors');
