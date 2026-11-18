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
  assert.match(await page.locator('#sg_who-err').innerText(), /יש לבחור לקוח/);
  ok('send sheet: nobody chosen → inline error, nothing sent');
  await page.fill('#sg_find', 'יוסי');
  await page.waitForSelector('#sg-results button');
  assert.equal(await page.locator('#sg-results button').count(), 2, 'each of the contact\'s leads is offered, with its purpose');
  await page.fill('#sg_find', '1110003'); await page.waitForSelector('#sg-results button:has-text("דוד לוי")');
  assert.match(await page.locator('#sg-results').innerText(), /ארכיון/);
  await page.fill('#sg_find', 'יוסי'); await page.click('#sg-results button >> nth=0');
  assert.match(await page.locator('#sg-chosen').innerText(), /יוסי אברהם[\s\S]*054-1110001/);
  ok('send sheet: search the leads by name or phone (one row per lead, archived marked); pick one');
  await shot('s02-send-sheet', true);

  const [pop] = await Promise.all([page.waitForEvent('popup'), page.click('#sg-send')]);
  await pop.waitForURL(/wa\.me/);
  const wa = new URL(pop.url());
  assert.equal(wa.pathname, '/972541110001');
  const msg = wa.searchParams.get('text');
  assert.match(msg, /^שלום יוסי,/); assert.match(msg, /sign\.html\?t=tok/); assert.match(msg, /ליאה ארז, פריים לוקיישן$/);
  assert.ok(!msg.includes('לכיש'), 'the WhatsApp text must not include the address');
  await pop.close();
  const call1 = await page.evaluate(() => PL_TEST_DB.calls.filter(c => c.signing)[0].signing);
  assert.equal(call1.kind, 'client_order'); assert.ok(call1.lead_id && !call1.contact, 'an existing lead is sent by id');
  ok('send: WhatsApp opens to the client with the greeting, the sign link and no address; the lead is linked');

  await page.waitForSelector('.sg-row');
  assert.match(await page.locator('.sg-row').innerText(), /76773[\s\S]*ממתינה לחתימה[\s\S]*קישור נוצר/);
  assert.equal(await bellCount(), '1');
  ok('card: request 76773 listed as "ממתינה לחתימה" with the time the link was made; bell shows 1');
  await shot('s03-card-sent', true);

  await page.click('.topbar .bell'); await page.waitForSelector('.notif-list');
  assert.match(await page.locator('.notif-list').innerText(), /נוצר קישור להחתמה עבור יוסי אברהם/);
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
  assert.match(await page.locator('.sg-row').innerText(), /000000018/);
  const [pdfPop] = await Promise.all([page.waitForEvent('popup'), page.click('.sg-row [data-a=pdf]')]);
  await pdfPop.close();
  assert.ok((await page.evaluate(() => PL_TEST_DB.calls.filter(c => c.pdf).length)) === 1);
  ok('signed: notification opens the card, row shows signer + "נחתמה", PDF opens (signed URL asked)');
  await shot('s05-card-signed', true);

  // second request to a new client → a draft lead; then cancel it
  await page.click('#send-sign'); await page.waitForSelector('#sg-form');
  await page.fill('#sg_find', '050-9998877'); await page.click('#sg-new-btn');
  assert.equal(await page.inputValue('#sg_phone'), '050-9998877');
  await page.fill('#sg_name', 'רונית בדיקה');
  await shot('s07-new-client', true);
  const [pop2] = await Promise.all([page.waitForEvent('popup'), page.click('#sg-send')]); await pop2.close();
  await page.waitForFunction(() => document.querySelectorAll('.sg-row').length === 2);
  const draft = await page.evaluate(() => PL_TEST_DB._db.lead.find(l => l.is_draft));
  assert.ok(draft, 'a draft lead was created'); assert.match(draft.notes, /נוצר מהחתמה/);
  page.once('dialog', d => d.accept());
  await page.locator('.sg-row', { hasText: '76774' }).locator('[data-a=cancel]').click();
  await page.waitForFunction(() => /בוטלה/.test(document.querySelector('#signing').innerText) && document.querySelectorAll('.sg-row').length === 2);
  assert.equal((await reqs()).find(r => r.no === 76774).status, 'cancelled');
  ok('"+ לקוח חדש" (name + phone only): a draft lead is created, order 76774; "ביטול" cancels it');

  // broker co-op
  await page.click('#send-coop'); await page.waitForSelector('#sg-form');
  assert.match(await page.locator('#sg-form h2').innerText(), /החתמת שת״פ/);
  await page.click('#sg-send');
  assert.match(await page.locator('#sg_type-err').innerText(), /סוג/);
  assert.match(await page.locator('#sg_who-err').innerText(), /מתווך/);
  ok('co-op sheet: type and broker are required');
  await page.check('input[name=sg_type][value=shared]'); await page.fill('#sg_notes', '50% לכל צד');
  await page.click('#sg-new-btn'); await page.fill('#sg_phone', '054-7770008'); await page.locator('#sg_phone').blur();
  await page.fill('#sg_name', 'משה מתווך');
  await shot('s08-coop-sheet', true);
  const [pop3] = await Promise.all([page.waitForEvent('popup'), page.click('#sg-send')]);
  await pop3.waitForURL(/wa\.me/);
  const m3 = new URL(pop3.url()).searchParams.get('text'); await pop3.close();
  assert.match(m3, /^היי משה, מצורף הסכם לחתימה\n\nלצפייה בהסכם: \S+sign\.html\?t=tok\S+\n\nלאחר החתימה, לחיצה על הלינק ⬆️ תעביר אותך להסכם החתום\.\n\nבברכה,\nליאה ארז$/);
  const call3 = await page.evaluate(() => PL_TEST_DB.calls.filter(c => c.signing).at(-1).signing);
  assert.deepEqual([call3.kind, call3.coop_type, call3.coop_notes, call3.contact.name], ['broker_coop', 'shared', '50% לכל צד', 'משה מתווך']);
  await page.waitForFunction(() => document.querySelectorAll('.sg-row').length === 3);
  const coopRow = page.locator('.sg-row', { hasText: '76775' });
  assert.match(await coopRow.innerText(), /שת״פ · קופה משותפת[\s\S]*הערות: 50% לכל צד/);
  assert.equal(await page.evaluate(() => PL_TEST_DB._db.lead.filter(l => l.is_draft).length), 1, 'a broker is not added to the leads');
  ok('co-op: type + notes, new broker; WhatsApp in Galli\'s wording with the broker\'s name; row "שת״פ · קופה משותפת"');
  const [pop4] = await Promise.all([page.waitForEvent('popup'), coopRow.locator('[data-a=wa]').click()]);
  assert.match(new URL(pop4.url()).searchParams.get('text'), /^היי משה, מצורף הסכם לחתימה/); await pop4.close();
  await page.click('#send-coop'); await page.waitForSelector('#sg-form');
  await page.fill('#sg_find', 'משה'); await page.waitForSelector('#sg-results button:has-text("משה מתווך")');
  await page.click('#sg-cancel');
  ok('co-op: "שליחה שוב" uses the co-op wording; the broker is offered next time');
  await page.evaluate(() => { const r = PL_TEST_DB._db.signing.find(x => x.agreement_no === 76775); PL_TEST_DB._sign(r.id, 'משה מתווך', '000000018', '7654321'); });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => /רשיון 7654321/.test(document.querySelector('#signing')?.innerText || ''));
  ok('co-op signed: the row shows the broker\'s licence');
  await shot('s09-card-coop', true);

  // drafts in the leads list
  await page.goto(BASE + '#/m/lead'); await page.waitForSelector('#rows');
  assert.match(await page.locator('.seg').innerText(), /טיוטות \(1\)/);
  assert.equal(await page.locator('#rows li.deal-row.draft').count(), 1);
  await page.click('label:has-text("טיוטות")');
  await page.waitForFunction(() => document.querySelectorAll('#rows li.deal-row').length === 1);
  assert.match(await page.locator('#rows').innerText(), /רונית בדיקה[\s\S]*טיוטה/);
  await shot('s10-drafts');
  await page.click('#rows li.deal-row a'); await page.waitForSelector('.draft-note');
  ok('leads list: "טיוטות (1)" filter, dashed draft row; the card explains how to complete it');
  await page.evaluate(async () => { const l = PL_TEST_DB._db.lead.find(x => x.is_draft); const c = PL_TEST_DB._db.contacts.find(x => x.id === l.contact_id);
    await PL_TEST_DB.saveDeal('lead', { ...l, contact: { phone: c.phone, name: c.name, entity_type: 'private' } }); await reload(); render(); });
  await page.goto(BASE + '#/m/lead'); await page.waitForSelector('#rows');
  assert.ok(!/טיוטות/.test(await page.locator('.seg').innerText()));
  ok('saving the lead clears the draft mark and the filter');

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
  const leadId = await page.evaluate(() => PL_TEST_DB._db.signing[0].lead_deal_id);
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
