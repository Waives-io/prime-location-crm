// GovMap address search (behind window.PL_APP.govmapToken): ITM → WGS84, exact house numbers first, OSM as fallback.
// GovMap's script is stubbed (its key works only on the approved domain); proj4 is served from qa/node_modules.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const T = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const srv = createServer(async (q, s) => { const p = normalize(decodeURIComponent(new URL(q.url, 'http://x').pathname)).replace(/^[\\/]+/, '') || 'index.html';
  try { const b = await readFile(join(ROOT, p)); s.writeHead(200, { 'content-type': T[extname(p)] || 'application/octet-stream' }); s.end(b); } catch { s.writeHead(404); s.end(); } }).listen(0, '127.0.0.1');
await new Promise(r => srv.once('listening', r));

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => { window.PL_APP = { govmapToken: 'test-token' }; });
await ctx.addInitScript({ path: fileURLToPath(new URL('./local-db.js', import.meta.url)) });
const calls = [];
await ctx.route('https://www.govmap.gov.il/govmap/api/govmap.api.js', r => r.fulfill({ contentType: 'text/javascript', body: `
  window.govmap = { search: async (p) => { window.__gm = p;
    return p.searchText.includes('מצדה 6') ? { resultsCount: 1, results: [{ text: 'דרך מצדה 6 באר שבע', centroid: 'POINT (180553.55 574243.05)' }] }
                                         : { resultsCount: 0, results: [] }; } };` }));
await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.9.0/proj4.js', async r => r.fulfill({ contentType: 'text/javascript',
  body: await readFile(fileURLToPath(new URL('./node_modules/proj4/dist/proj4.js', import.meta.url)), 'utf8') }));
await ctx.route('https://nominatim.openstreetmap.org/**', r => { calls.push('nominatim'); r.fulfill({ contentType: 'application/json', body: '[]' }); });
await ctx.route('https://photon.komoot.io/**', r => { calls.push('photon'); r.fulfill({ contentType: 'application/json', body: '{"features":[]}' }); });

const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
let pass = 0; const ok = (n) => { pass++; console.log('  ✓', n); };
try {
  await page.goto(`http://127.0.0.1:${srv.address().port}/`);
  await page.fill('#email', 'qa@prime.test'); await page.fill('#password', 'qa-pass-1234'); await page.click('button[type=submit]');
  await page.waitForSelector('.home-btn'); await page.click('.home-btn >> nth=1'); await page.waitForSelector('#rows');
  await page.click('.bottom-nav .nav-new'); await page.waitForSelector('#deal-form');
  await page.fill('#address', 'דרך מצדה 6 באר שבע'); await page.click('#geo-go');
  await page.waitForSelector('#geo-results button:has-text("דרך מצדה 6")'); await page.click('#geo-results button');
  assert.equal(await page.inputValue('#address'), 'דרך מצדה 6 באר שבע');
  assert.equal(await page.isHidden('#geo-note'), true);
  assert.deepEqual(await page.evaluate(() => window.__gm), { searchText: 'דרך מצדה 6 באר שבע', language: 'he', maxResults: 5, isAccurate: false, apiKey: 'test-token' });
  const pin = await page.evaluate(() => { const l = document.querySelector('.leaflet-marker-icon'); return !!l; });
  assert.ok(pin);
  assert.deepEqual(calls, []); // exact GovMap hit: the OSM services are not asked
  ok('GovMap: exact house number found, pin placed, no "approximate" note, key sent, OSM not called');
  const ll = await page.evaluate(async () => (await Geo.govmap('דרך מצדה 6 באר שבע'))[0]);
  assert.ok(Math.abs(ll.lat - 31.2591) < 0.001 && Math.abs(ll.lng - 34.7960) < 0.001, JSON.stringify(ll));
  ok('ITM (180553, 574243) → 31.2591, 34.7960 (Beer Sheva)');
  await page.fill('#address', 'רחוב לא קיים 99'); await page.click('#geo-go');
  await page.waitForSelector('#geo-results li');
  assert.ok(calls.includes('nominatim') && calls.includes('photon'));
  ok('no GovMap result → falls back to the free services');
  assert.deepEqual(errors, []);
  console.log(`\nGovMap tests passed: ${pass}`);
} catch (e) { console.error('\n✗ FAILED:', e.message); process.exitCode = 1; }
finally { await b.close(); srv.close(); }
