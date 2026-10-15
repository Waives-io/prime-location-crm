// Lists the elements that stick out of a 390px phone screen (outside .table-wrap). Usage: node wide-check.mjs [hash]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../demo-site/', import.meta.url));
const T = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };
const s = createServer(async (q, r) => {
  const p = normalize(decodeURIComponent(new URL(q.url, 'http://x').pathname)).replace(/^[\\/]+/, '') || 'index.html';
  try { const b = await readFile(join(ROOT, p)); r.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => s.once('listening', r));
const BASE = `http://127.0.0.1:${s.address().port}/`;
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
await pg.goto(BASE); await pg.waitForSelector('#login'); await pg.click('#login button[type=submit]'); await pg.waitForSelector('.lead-table');
if (process.argv[2]) { await pg.goto(BASE + process.argv[2]); await pg.waitForTimeout(800); }
console.log(await pg.evaluate(() => {
  const W = innerWidth, out = ['scrollWidth=' + document.documentElement.scrollWidth];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (!r.width || el.closest('.table-wrap')) continue;
    const off = r.left < -1 || r.right > W + 1, p = el.parentElement?.getBoundingClientRect();
    if (off && !(p && (p.left < -1 || p.right > W + 1))) out.push(`${el.tagName}.${String(el.className)} L${Math.round(r.left)} R${Math.round(r.right)} W${Math.round(r.width)}`);
  }
  for (let e = document.querySelector('.lead-table'); e; e = e.parentElement) {
    const cs = getComputedStyle(e);
    out.push(`${e.tagName}.${String(e.className).slice(0, 40)} w=${Math.round(e.getBoundingClientRect().width)} disp=${cs.display} ovx=${cs.overflowX} minw=${cs.minWidth} cols=${cs.gridTemplateColumns.slice(0, 40)}`);
  }
  window.scrollTo(-2000, 0); out.push('scrollX after scrollTo(-2000)=' + scrollX); window.scrollTo(2000, 0); out.push('scrollX after scrollTo(2000)=' + scrollX);
  for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width > 400 && !el.closest('.table-wrap')) out.push(`wide: ${el.tagName}.${String(el.className).slice(0, 40)} L${Math.round(r.left)} W${Math.round(r.width)} pos=${getComputedStyle(el).position}`); }
  return out.slice(0, 40).join('\n');
}));
await b.close(); s.close();
