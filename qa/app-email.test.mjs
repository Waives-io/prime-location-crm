// Headless QA of the optional email field (leads + owners): warning only, never blocks saving.
// Usage: node app-email.test.mjs [--shots]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = fileURLToPath(new URL('./screens/', import.meta.url));
const shots = process.argv.includes('--shots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'he-IL' });
await ctx.addInitScript(() => { window.PL_APP = { govmapToken: '', features: { signing: true } }; });
await ctx.addInitScript({ path: fileURLToPath(new URL('./local-db.js', import.meta.url)) });
await ctx.route('https://wa.me/**', r => r.fulfill({ contentType: 'text/html', body: '<p>wa</p>' }));
await ctx.route(/openstreetmap|komoot|tile/, r => r.fulfill({ status: 204, body: '' }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

let pass = 0;
const ok = (n) => { pass++; console.log('  ✓', n); };
const shot = async (name, full = false) => { if (shots) { await mkdir(SHOTS, { recursive: true }); await page.waitForTimeout(400); await page.screenshot({ path: SHOTS + name + '.png', fullPage: full }); } };
const ids = () => page.evaluate(() => ({ owner: PL_TEST_DB._db.owner[0].id, lead: PL_TEST_DB._db.lead[0].id }));
const pickChip = (group, text) => page.locator(`#${group} label`, { hasText: text }).click();
const save = async () => { await page.click('#save'); await page.waitForSelector('.card-head'); };

const warn = () => page.locator('#email-warn').innerText();
const typeEmail = async (v) => { await page.fill('#email', v); await page.locator('#email').blur(); };
const lastCall = (m) => page.evaluate((m) => PL_TEST_DB.calls.filter(c => c.module === m).at(-1).p, m);

try {
  await page.goto(BASE);
  await page.fill('#email', 'qa@prime.test'); await page.fill('#password', 'qa-pass-1234');
  await page.click('button[type=submit]'); await page.waitForSelector('.hero-top');
  const { owner, lead } = await ids();

  // owner: typo in a common domain → one-tap fix
  await page.goto(BASE + `#/m/owner/${owner}/edit`); await page.waitForSelector('#deal-form');
  const f = page.locator('#email');
  assert.equal(await f.getAttribute('inputmode'), 'email'); assert.equal(await f.getAttribute('dir'), 'ltr');
  assert.equal(await page.locator('[data-field="email"] .req').count(), 0, 'not required');
  assert.equal(await warn(), '');
  await typeEmail('  Dana.Levi@GMIAL.com ');
  assert.equal(await f.inputValue(), 'dana.levi@gmial.com', 'trimmed + lower case');
  assert.match(await warn(), /אולי התכוונת ל־\s*dana\.levi@gmail\.com\?/);
  await shot('e01-typo');
  await page.click('#email-fix');
  assert.equal(await f.inputValue(), 'dana.levi@gmail.com'); assert.equal(await warn(), '');
  await save();
  assert.equal((await lastCall('owner')).contact.email, 'dana.levi@gmail.com');
  const a = page.locator('.dl a[href^="mailto:"]');
  assert.equal(await a.getAttribute('href'), 'mailto:dana.levi@gmail.com'); assert.equal(await a.getAttribute('dir'), 'ltr');
  ok('owner: optional "מייל" (LTR, email keyboard); trimmed + lower case; "gmial" → tap "לתקן" → gmail.com; saved; on the card as a mail link');

  // lead: a broken address warns, but saving still works
  await page.goto(BASE + `#/m/lead/${lead}/edit`); await page.waitForSelector('#deal-form');
  await typeEmail('dana gmail.com');
  assert.match(await warn(), /רווח.*אפשר לשמור גם כך/);
  await typeEmail('danagmail.com');
  assert.match(await warn(), /חסר @/);
  await page.fill('#email', 'dana@gmail.com');   // while typing, a shown warning goes away once fixed
  assert.equal(await warn(), '');
  await typeEmail('דנה@gmail.com');
  assert.match(await warn(), /אותיות בעברית/);
  await typeEmail('dana@gmail');
  assert.match(await warn(), /לא נראה תקין/);
  assert.equal(await page.locator('[data-field="email"].invalid').count(), 0, 'never marked as an error');
  await shot('e02-warn');
  await save();
  assert.equal((await lastCall('lead')).contact.email, 'dana@gmail', 'saved as typed, despite the warning');
  ok('lead: no @ / space / Hebrew letters / no ending → a Hebrew warning, never an error; the deal saves anyway');

  // empty clears; typing a fine address shows nothing
  await page.goto(BASE + `#/m/lead/${lead}/edit`); await page.waitForSelector('#deal-form');
  assert.equal(await page.inputValue('#email'), 'dana@gmail');
  assert.match(await warn(), /לא נראה תקין/, 'a stored doubtful address is flagged when the form opens');
  await typeEmail('');
  assert.equal(await warn(), '');
  await save();
  assert.equal((await lastCall('lead')).contact.email, null);
  assert.equal(await page.locator('.dl a[href^="mailto:"]').count(), 0);
  await page.goto(BASE + `#/m/lead/${lead}/edit`); await page.waitForSelector('#deal-form');
  await typeEmail('noa@walla.co.il'); assert.equal(await warn(), '');
  await save(); assert.equal((await lastCall('lead')).contact.email, 'noa@walla.co.il');
  ok('empty clears the stored email; a correct address shows no warning');

  // a new lead with the owner's phone gets the owner's email (one shared contact); search finds it
  const ownerPhone = await page.evaluate((id) => { const d = PL_TEST_DB._db; const o = d.owner.find(x => x.id === id); return d.contacts.find(c => c.id === o.contact_id).phone; }, owner);
  await page.goto(BASE + '#/m/lead/new'); await page.waitForSelector('#deal-form');
  await page.fill('#phone', ownerPhone); await page.locator('#phone').blur();
  await page.waitForFunction(() => document.querySelector('#email').value === 'dana.levi@gmail.com');
  await save(); assert.equal((await lastCall('lead')).contact.email, 'dana.levi@gmail.com');
  await page.goto(BASE + '#/m/owner'); await page.waitForSelector('#q');
  await page.fill('#q', 'dana.levi'); assert.equal(await page.locator('#rows li a').count(), 1, 'search by email');
  ok('a known phone fills in the stored email; the list search finds a deal by its email');

  assert.deepEqual(errors, []);
  console.log(`\nApp email passed: ${pass}`);
} catch (e) {
  console.error('\n✗ FAILED:', e.message);
  await page.screenshot({ path: SHOTS + 'failure-email.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally { await browser.close(); server.close(); }
