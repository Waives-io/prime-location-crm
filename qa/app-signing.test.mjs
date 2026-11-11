// Headless QA of the brokerage-order flow inside the CRM (FEATURES.signing on), against qa/local-db.js.
// Usage: node app-signing.test.mjs [--shots]
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
const bellCount = () => page.locator('.bell .bell-n').first().innerText().catch(() => '0');
const ownerId = () => page.evaluate(() => PL_TEST_DB._db.owner[0].id);
const reqs = () => page.evaluate(() => PL_TEST_DB._db.signing.map(r => ({ id: r.id, no: r.agreement_no, status: r.status, contact: r.contact_id })));

try {
  await page.goto(BASE);
  await page.fill('#email', 'qa@prime.test'); await page.fill('#password', 'qa-pass-1234');
  await page.click('button[type=submit]'); await page.waitForSelector('.hero-top');
  assert.equal(await page.locator('.hero-top .bell').count(), 1);
  assert.equal(await page.locator('.bell-n').count(), 0);
  ok('home: bell shown, no unread count');

  const oid = await ownerId();
  await page.goto(BASE + '#/m/owner/' + oid); await page.waitForSelector('#signing');
  assert.match(await page.locator('#signing').innerText(), /עדיין לא נשלחו/);
  ok('owner card: "הזמנות תיווך" section, empty state, "שליחה להחתמה"');
  await shot('s01-card-empty', true);

  await page.click('#send-sign'); await page.waitForSelector('#sg-form');
  assert.equal(await page.inputValue('#sg_teaser'), 'חנות ברחוב ראשי');
  await page.fill('#sg_teaser', 'חנות ברחוב ראשי ליד שדרות לכיש');
  assert.match(await page.locator('#sg_teaser-err').innerText(), /לכיש/);
  ok('send sheet: teaser prefilled from description; address word "לכיש" flagged inline');
  await page.fill('#sg_teaser', 'חנות ברחוב ראשי, חזית רחבה, חניה צמודה');
  assert.equal(await page.locator('#sg_teaser-err').innerText(), '');
  assert.match(await page.locator('#sg-pv-text').innerText(), /חזית רחבה/);
  ok('send sheet: clean teaser accepted, live preview updates');

  await page.click('#sg-send');
  assert.match(await page.locator('#sg_phone-err').innerText(), /05/);
  ok('send sheet: empty phone → inline error, nothing sent');
  await page.fill('#sg_phone', '054 111 0001'); await page.locator('#sg_phone').blur();
  await page.waitForFunction(() => document.querySelector('#sg_name').value === 'יוסי אברהם');
  assert.equal(await page.isVisible('#sg-existing'), true);
  ok('send sheet: existing phone fills the client name ("לקוח קיים")');
  await shot('s02-send-sheet', true);

  const [pop] = await Promise.all([page.waitForEvent('popup'), page.click('#sg-send')]);
  await pop.waitForURL(/wa\.me/);
  const wa = new URL(pop.url());
  assert.equal(wa.pathname, '/972541110001');
  const msg = wa.searchParams.get('text');
  assert.match(msg, /^שלום יוסי,/); assert.match(msg, /sign\.html\?t=tok/); assert.match(msg, /ליאה ארז, פריים לוקיישן$/);
  assert.ok(!msg.includes('לכיש'), 'the WhatsApp text must not include the address');
  await pop.close();
  ok('send: WhatsApp opens to the client with the greeting, the sign link and no address');

  await page.waitForSelector('.sg-row');
  assert.match(await page.locator('.sg-row').innerText(), /76773[\s\S]*נשלחה/);
  assert.equal(await bellCount(), '1');
  ok('card: request 76773 listed as "נשלחה"; bell shows 1');
  await shot('s03-card-sent', true);

  await page.click('.topbar .bell'); await page.waitForSelector('.notif-list');
  assert.match(await page.locator('.notif-list').innerText(), /76773/);
  await page.waitForFunction(() => !document.querySelector('.bell-n'));
  ok('notifications: listed; opening the screen marks them read (bell clears)');
  await shot('s04-notifications');

  const [r1] = await reqs();
  await page.evaluate((id) => PL_TEST_DB._sign(id), r1.id);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => document.querySelector('.bell-n')?.textContent === '1');
  ok('a signature while the app is in the background → bell updates on return');
  await page.click('.notif-list li:first-child a'); await page.waitForSelector('.sg-row');
  assert.match(await page.locator('.sg-row').innerText(), /נחתמה[\s\S]*ישראל ישראלי|ישראל ישראלי[\s\S]*נחתמה/);
  const [pdfPop] = await Promise.all([page.waitForEvent('popup'), page.click('.sg-row [data-a=pdf]')]);
  await pdfPop.close();
  assert.ok((await page.evaluate(() => PL_TEST_DB.calls.filter(c => c.pdf).length)) === 1);
  ok('signed: notification opens the card, row shows signer + "נחתמה", PDF opens (signed URL asked)');
  await shot('s05-card-signed', true);

  // second request to a new client, then cancel it
  await page.click('#send-sign'); await page.waitForSelector('#sg-form');
  await page.fill('#sg_phone', '050-9998877'); await page.locator('#sg_phone').blur();
  await page.fill('#sg_name', 'רונית בדיקה');
  const [pop2] = await Promise.all([page.waitForEvent('popup'), page.click('#sg-send')]); await pop2.close();
  await page.waitForFunction(() => document.querySelectorAll('.sg-row').length === 2);
  page.once('dialog', d => d.accept());
  await page.locator('.sg-row', { hasText: '76774' }).locator('[data-a=cancel]').click();
  await page.waitForFunction(() => /בוטלה/.test(document.querySelector('#signing').innerText) && document.querySelectorAll('.sg-row').length === 2);
  assert.equal((await reqs()).find(r => r.no === 76774).status, 'cancelled');
  ok('new client: contact created, second order 76774; "ביטול" cancels it');

  // owners list search
  await page.goto(BASE + '#/m/owner'); await page.waitForSelector('#rows');
  await page.fill('#q', '76773'); await page.waitForSelector('.sg-hit');
  assert.equal(await page.locator('#rows li').first().getAttribute('class'), 'sg-hit');
  assert.match(await page.locator('.sg-hit').innerText(), /פתיחת המסמך החתום/);
  await shot('s06-search');
  await page.fill('#q', '000000018'); await page.waitForSelector('.sg-hit');
  await page.fill('#q', 'רונית'); await page.waitForSelector('.sg-hit:has-text("76774")');
  await page.click('.sg-hit button'); await page.waitForSelector('#signing');
  ok('owners search: by agreement no., signer ID and client name; unsigned hit opens the card section');

  // lead card of the same contact shows the order
  const leadId = await page.evaluate(() => PL_TEST_DB._db.lead.find(l => l.contact_id === PL_TEST_DB._db.signing[0].contact_id).id);
  await page.goto(BASE + '#/m/lead/' + leadId); await page.waitForSelector('#signing');
  assert.match(await page.locator('#signing').innerText(), /76773/);
  assert.equal(await page.locator('#send-sign').count(), 0);
  ok('lead card: the contact\'s orders are listed (no send button there)');

  // flag off → nothing of this exists
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => { window.PL_APP.features.signing = false; });
  await p2.goto(BASE);
  await p2.fill('#email', 'qa@prime.test'); await p2.fill('#password', 'qa-pass-1234');
  await p2.click('button[type=submit]'); await p2.waitForSelector('.hero-top');
  assert.equal(await p2.locator('.bell').count(), 0);
  await p2.goto(BASE + '#/m/owner'); await p2.waitForSelector('#rows li a');
  await p2.click('#rows li a'); await p2.waitForSelector('.actions');
  assert.equal(await p2.locator('#signing, .bell').count(), 0);
  await p2.close();
  ok('flag off: no bell, no section');

  assert.deepEqual(errors, [], 'page errors: ' + errors.join(' | '));
  ok('no JS errors');
  console.log(`\nApp signing passed: ${pass}`);
} catch (e) {
  console.error('\n✗ FAILED:', e.message);
  await page.screenshot({ path: SHOTS + 'failure-signing.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally { await browser.close(); server.close(); }
