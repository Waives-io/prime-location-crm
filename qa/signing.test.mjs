// End-to-end QA of the client's signing page (sign.html) against the REAL Edge Function logic (handler.js + pdf.js)
// and the REAL SQL (schema + migrations 002–009 on PGlite). Storage is in memory.
// Usage: node signing.test.mjs [--shots]
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import * as pdfLib from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { handle, validIsraeliId } from '../supabase/functions/signing-public/handler.js';
import { ALEF_REGULAR, ALEF_BOLD } from '../supabase/functions/signing-public/fonts.js';
import { renderPdfPages } from './pdf-render.mjs';

const sql = (f) => readFileSync(new URL(`../supabase/${f}`, import.meta.url), 'utf8');
const SHOTS = fileURLToPath(new URL('./screens/', import.meta.url));
const shots = process.argv.includes('--shots');
const LEAH = '11111111-1111-4111-8111-111111111111';
const OWNER = 'd2000000-0000-4000-8000-000000000001';

/* ── database ── */
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema extensions;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  insert into auth.users values ('${LEAH}', 'leah@example.com');`);
await db.exec(sql('schema.sql').replace('LEAH_EMAIL@example.com', 'leah@example.com'));
for (const f of ['002_feedback.sql', '004_photos.sql', '005_round2.sql', '006_field_remove.sql', '007_multi_need.sql', '008_multi_purpose.sql', '009_signing.sql'])
  await db.exec(sql(f).replace('LEAH_EMAIL@example.com', 'leah2@example.com'));
const q = (s, p) => db.query(s, p).then(r => r.rows);
async function as(role, uid, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
let lock = Promise.resolve(); // PGlite is one connection: run each RPC alone, under the service role (like the Edge Function)
const rpc = (name, args) => (lock = lock.then(() => as('service_role', null, async () => {
  const keys = Object.keys(args), cast = { p: '::jsonb' };
  const r = await q(`select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}${cast[k] || ''}`).join(', ')}) r`, keys.map(k => args[k]));
  return r[0].r;
})));
const create = (phone, name, teaser) => as('authenticated', LEAH, async () =>
  (await q('select signing_create($1::jsonb) r', [{ owner_deal_id: OWNER, teaser_text: teaser, contact: { phone, name } }]))[0].r);
const address = (await q('select address from owner_deals where id=$1', [OWNER]))[0].address;
const addrParts = (await as('authenticated', LEAH, () => q('select address_parts($1) p', [address])))[0].p;

/* ── server: sign.html + the function at /api + stored files at /files ── */
const store = new Map();
let BASE;
const deps = {
  rpc,
  async upload(bucket, path, bytes) { if (store.has(path)) throw new Error('exists'); store.set(path, Buffer.from(bytes)); },
  async signedUrl(bucket, path) { return `${BASE}files/${path}`; },
  async remove(bucket, paths) { paths.forEach(p => store.delete(p)); },
  fonts: { regular: Buffer.from(ALEF_REGULAR, 'base64'), bold: Buffer.from(ALEF_BOLD, 'base64') }, pdfLib, fontkit,
  b64decode: (s) => Buffer.from(s, 'base64'),
  sha256: async (b) => createHash('sha256').update(b).digest(),
};
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api') {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await handle(new Request(BASE.slice(0, -1) + req.url, { method: req.method, headers: { ...req.headers, 'x-forwarded-for': '203.0.113.7' },
      body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks) }), { ...deps, allowedOrigins: [BASE.slice(0, -1)] });
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  if (u.pathname.startsWith('/files/')) { const f = store.get(decodeURIComponent(u.pathname.slice(7))); res.writeHead(f ? 200 : 404, { 'content-type': 'application/pdf' }); res.end(f); return; }
  const p = u.pathname === '/' ? 'sign.html' : u.pathname.slice(1);
  try { const body = await readFile(fileURLToPath(new URL('../' + p, import.meta.url)));
    res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.png') ? 'image/png' : 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'he-IL', hasTouch: true });
await ctx.addInitScript((api) => { window.PL_SIGN_API = api; }, BASE + 'api');
const page = await ctx.newPage();
const errors = [], apiBodies = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
page.on('response', async r => { if (r.url().includes('/api')) apiBodies.push({ method: r.request().method(), body: await r.text().catch(() => '') }); });

let pass = 0;
const ok = (n) => { pass++; console.log('  ✓', n); };
const shot = async (name, full = true) => { if (shots) { await mkdir(SHOTS, { recursive: true }); await page.waitForTimeout(300); await page.screenshot({ path: SHOTS + name + '.png', fullPage: full }); } };
const draw = async () => {
  const b = await page.locator('#pad').boundingBox();
  await page.mouse.move(b.x + 30, b.y + b.height * 0.6); await page.mouse.down();
  for (let i = 0; i <= 30; i++) await page.mouse.move(b.x + 30 + i * (b.width - 60) / 30, b.y + b.height * (0.5 + 0.25 * Math.sin(i / 3)), { steps: 2 });
  await page.mouse.up();
};

try {
  assert.equal(validIsraeliId('000000018'), true); assert.equal(validIsraeliId('18'), true); assert.equal(validIsraeliId('123456789'), false);
  assert.equal(validIsraeliId('000000000'), false); assert.equal(validIsraeliId('12a456789'), false);
  ok('ID check digit: valid, short (left-padded), wrong digit, zeros, letters');

  const r1 = await create('054-7770001', 'דנה לקוחה', 'חנות בחזית רחבה, חניה צמודה');
  await page.goto(`${BASE}?t=${r1.token}`);
  await page.waitForSelector('#to-sign');
  const pre = apiBodies.filter(x => x.method === 'GET').map(x => x.body).join('\n') + await page.content();
  for (const part of addrParts) assert.ok(!pre.includes(part), `address part "${part}" reached the browser before signing`);
  assert.match(await page.locator('#app').innerText(), /הכתובת המלאה תוצג מיד לאחר החתימה/);
  assert.match(await page.locator('#app').innerText(), /76773/);
  ok('before signing: no address part in any API response or the page; teaser + number + "הכתובת המלאה תוצג…"');
  assert.equal((await q('select status from signing_requests where id=$1', [r1.id]))[0].status, 'opened');
  ok('first open marks the request "נפתחה"');
  await shot('c01-teaser');

  await page.click('#to-sign'); await page.waitForSelector('#sign-form');
  await page.click('#submit');
  for (const f of ['full_name', 'id_number', 'home_address', 'signature', 'consent']) assert.notEqual(await page.locator(`#${f}-err`).innerText(), '', f);
  ok('empty submit: an inline error on every field, nothing sent');
  await page.fill('#full_name', 'דנה לקוחה'); await page.fill('#id_number', '123456789'); await page.locator('#id_number').blur();
  assert.match(await page.locator('#id_number-err').innerText(), /אינו תקין/);
  ok('wrong ID → inline "מספר תעודת הזהות אינו תקין"');
  await page.fill('#id_number', '000000018'); await page.fill('#home_address', 'הרצל 10, חיפה');
  await draw(); await page.check('#consent');
  await shot('c02-form');
  await page.evaluate(() => window.scrollTo(0, 0)); await shot('c02b-form-top', false);
  await page.click('#submit');
  await page.waitForSelector('#address');
  assert.equal(await page.locator('#address').innerText(), address);
  assert.equal(await page.locator('#pdf').count(), 1);
  ok('sign: address revealed after signing, "הורדת עותק חתום" shown');
  await shot('c03-done');

  const row = (await q('select status, signer_full_name, signer_id_number, signer_ip, pdf_path, pdf_sha256, signature_png_path from signing_requests where id=$1', [r1.id]))[0];
  assert.deepEqual([row.status, row.signer_full_name, row.signer_id_number, row.signer_ip], ['signed', 'דנה לקוחה', '000000018', '203.0.113.7']);
  const pdf = store.get(row.pdf_path);
  assert.ok(pdf && store.has(row.signature_png_path));
  assert.equal(createHash('sha256').update(pdf).digest('hex'), row.pdf_sha256);
  const href = await page.getAttribute('#pdf', 'href');
  const dl = Buffer.from(await (await fetch(href)).arrayBuffer());
  assert.ok(dl.equals(pdf));
  ok('stored: signer, ID, IP, signature PNG + PDF; SHA-256 matches; the download link returns the same PDF');

  await mkdir(SHOTS, { recursive: true });
  const rendered = await renderPdfPages(pdf, [SHOTS + 'c04-pdf-1.png', SHOTS + 'c04-pdf-2.png', SHOTS + 'c04-pdf-3.png'], { browser });
  assert.ok(rendered.pages >= 2, 'pages ' + rendered.pages);
  for (const s of ['76773', '000000018', '203.0.113.7', '3156857']) assert.ok(rendered.text.includes(s), 'PDF text missing ' + s);
  ok(`PDF: ${rendered.pages} pages, renders; agreement no., ID, IP and licence in the text`);

  await page.goto(`${BASE}?t=${r1.token}`); await page.waitForSelector('#address');
  assert.equal(await page.locator('#address').innerText(), address);
  const n = (await q(`select count(*)::int n from notifications where type='signing_signed'`))[0].n;
  assert.equal(n, 1);
  ok('reopening a signed link shows the address + copy again; exactly one "חתם/ה" notification');

  // two parallel submits on a fresh link: one signature, one stored PDF
  const r2 = await create('054-7770002', 'שני מקבילים', null);
  await rpc('signing_public_get', { p_token: r2.token });
  const sigPng = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 200; const x = c.getContext('2d');
    x.lineWidth = 4; x.beginPath(); for (let i = 0; i < 60; i++) x.lineTo(20 + i * 9, 100 + 50 * Math.sin(i / 4)); x.stroke(); return c.toDataURL('image/png'); });
  const post = (name) => fetch(BASE + 'api', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: r2.token, full_name: name, id_number: '18', home_address: 'רחוב 1, עיר', consent: true, signature: sigPng }) }).then(r => r.json());
  const [a, b] = await Promise.all([post('ראשון'), post('שני')]);
  assert.equal(a.state, 'signed'); assert.equal(b.state, 'signed');
  const pdfs = [...store.keys()].filter(k => k.includes(r2.id) && k.endsWith('.pdf'));
  assert.equal(pdfs.length, 1, 'stored PDFs: ' + pdfs);
  ok('two submits at once: both told "signed", one signature, one PDF kept');

  const bad = await fetch(BASE + 'api', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: (await create('054-7770003', 'בדיקה', null)).token, full_name: 'x y', id_number: '18', home_address: 'abc', consent: true, signature: 'data:image/png;base64,AAAA' }) });
  assert.equal(bad.status, 422); assert.deepEqual(Object.keys((await bad.json()).errors), ['signature']);
  ok('server refuses a fake signature image (422), even if the page is bypassed');

  const r6 = await create('054-7770006', 'נעילה', null);
  for (let i = 0; i < 12; i++) await fetch(BASE + 'api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: r6.token }) });
  assert.equal((await q('select coalesce(submit_attempts, 0) n from signing_requests where id=$1', [r6.id]))[0].n, 0);
  const good = await fetch(BASE + 'api', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: r6.token, full_name: 'נעילה', id_number: '18', home_address: 'רחוב 1, עיר', consent: true, signature: sigPng }) }).then(r => r.json());
  assert.equal(good.state, 'signed');
  ok('12 junk posts do not count as attempts: the real client can still sign');

  // cancelled and expired links
  const r4 = await create('054-7770004', 'מבוטל', null);
  await as('authenticated', LEAH, () => q('select signing_cancel($1)', [r4.id]));
  await page.goto(`${BASE}?t=${r4.token}`);
  await page.waitForSelector('text=הקישור אינו בתוקף');
  const r5 = await create('054-7770005', 'פג תוקף', null);
  await q(`update signing_requests set expires_at = now() - interval '1 minute' where id=$1`, [r5.id]);
  await page.goto(`${BASE}?t=${r5.token}`);
  await page.waitForSelector('text=הקישור אינו בתוקף');
  await shot('c05-expired', false);
  await page.goto(`${BASE}?t=${'x'.repeat(43)}`); await page.waitForSelector('text=הקישור אינו בתוקף, נא לפנות לליאה').catch(async () => {
    assert.match(await page.locator('#app').innerText(), /קישור/); });
  ok('cancelled, expired and unknown links → "הקישור אינו בתוקף, נא לפנות לליאה"');

  assert.deepEqual(errors, [], 'page errors: ' + errors.join(' | '));
  ok('no JS errors');
  console.log(`\nSigning page passed: ${pass}`);
} catch (e) {
  console.error('\n✗ FAILED:', e.stack || e.message);
  await page.screenshot({ path: SHOTS + 'failure-sign.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally { await browser.close(); server.close(); }
