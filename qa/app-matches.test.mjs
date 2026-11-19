// Headless QA of categories, "איך הגיע/ה אליי?", matches and settings, against qa/local-db.js.
// Usage: node app-matches.test.mjs [--shots]
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

try {
  await page.goto(BASE);
  await page.fill('#email', 'qa@prime.test'); await page.fill('#password', 'qa-pass-1234');
  await page.click('button[type=submit]'); await page.waitForSelector('.hero-top');
  assert.match(await page.locator('.home-matches').innerText(), /התאמות[\s\S]*1/);
  assert.equal(await page.locator('.hero-settings').count(), 1);
  for (const k of ['lead', 'owner', 'matches']) assert.equal(await page.locator(`.home-btn .ico-${k}`).count(), 1, k);
  ok('home: "התאמות" button with the count, settings icon; an icon on every button');
  await shot('m01-home');

  const { owner, lead } = await ids();
  // owner: category + lead source
  await page.goto(BASE + `#/m/owner/${owner}/edit`); await page.waitForSelector('#deal-form');
  assert.equal(await page.locator('#category_ids label').count(), 13);
  await pickChip('category_ids', 'אופנה');
  await page.selectOption('#lead_source_id', { label: 'גוגל' });
  await shot('m02-owner-form', true);
  await save();
  let card = await page.locator('.dl').innerText();
  assert.match(card, /קטגוריה\s*אופנה/); assert.match(card, /איך הגיע\/ה אליי\?\s*גוגל/);
  const call = await page.evaluate(() => PL_TEST_DB.calls.filter(c => c.module === 'owner').at(-1).p);
  assert.equal(call.category_ids.length, 1); assert.ok(call.contact.lead_source_id);
  ok('owner form: 13 categories (multi), "איך הגיע/ה אליי?"; both shown on the card');

  // a value added in the leads form is there for owners too
  await page.goto(BASE + `#/m/lead/${lead}/edit`); await page.waitForSelector('#deal-form');
  await pickChip('category_ids', 'אופנה');
  await page.click('[data-for="category_ids"]'); await page.fill('#category_ids-new input', 'מזון');
  await page.click('#category_ids-new .btn'); await page.waitForSelector('#category_ids label:has-text("מזון")');
  await save();
  assert.match(await page.locator('.dl').innerText(), /קטגוריה\s*אופנה, מזון/);
  await page.goto(BASE + `#/m/owner/${owner}/edit`); await page.waitForSelector('#deal-form');
  assert.equal(await page.locator('#category_ids label', { hasText: 'מזון' }).count(), 1);
  assert.equal(await page.inputValue('#lead_source_id') !== '', true);
  await page.click('.topbar .back');
  ok('a category added in the leads form appears in the owners form (one shared list); the source stays on the contact');

  // the lead's card: matches section
  await page.goto(BASE + `#/m/lead/${lead}`); await page.waitForSelector('#matches');
  const row = page.locator('#matches .match-row').first();
  assert.match(await row.innerText(), /^\d+/);
  const score = +(await row.locator('.match-score strong').innerText());
  assert.ok(score > 0 && score < 100, String(score));
  assert.match(await row.innerText(), /✓ קטגוריה: אופנה/);
  assert.equal(await row.locator('.match-what .name').innerText(), 'מירב כהן');
  assert.match(await row.locator('.match-what .addr').innerText(), /שדרות לכיש 40/);
  assert.equal(await row.getAttribute('data-band'), score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'orange');
  assert.match(await row.getAttribute('class'), /is-partial/);   // rent: budget unknown
  ok(`lead card: "התאמות" section, the property scores ${score} with its reasons; owner name + address; colour band; partial flagged`);
  assert.equal(await page.locator('.card-head .card-tools a', { hasText: 'עריכה' }).count(), 1);
  assert.equal(await page.locator('.card-head .card-tools #close-deal').count(), 1);
  assert.equal(await page.locator('.content > .actions a', { hasText: 'עריכה' }).count(), 0);
  ok('card: עריכה / שכפול / סגירת עסקה at the top, next to the name');
  await shot('m03-lead-card', true);

  // why + WhatsApp (no address)
  await row.locator('[data-a=why]').click(); await page.waitForSelector('.why');
  const why = await page.locator('.why').innerText();
  assert.match(why, /קטגוריה[\s\S]*אזור[\s\S]*ייעוד[\s\S]*גודל[\s\S]*תקציב/); assert.match(why, /לא ידוע/);
  assert.ok(!/גובה/.test(why), 'height has weight 0 and is not listed');
  await shot('m04-why');
  await page.click('#why-close');
  const [pop] = await Promise.all([page.waitForEvent('popup'), row.locator('[data-a=wa]').click()]);
  const wa = new URL(pop.url()); await pop.close();
  assert.equal(wa.pathname, '/972541110001');
  const msg = wa.searchParams.get('text');
  assert.match(msg, /^היי יוסי, יש לי נכס שיכול להתאים לך: חנות · 120 מ״ר · השכרה/); assert.ok(!msg.includes('לכיש'), 'no address in the WhatsApp');
  ok('"למה ההתאמה הזו?" lists each criterion (unknown marked); WhatsApp to the lead with the property, without the address');

  // dashboard + dismiss + undo + restore
  await page.goto(BASE + '#/matches'); await page.waitForSelector('#m-rows');
  assert.equal(await page.locator('#m-rows .match-row').count(), 1);
  await shot('m05-dashboard', true);
  await page.click('#m-rows .match-what'); await page.waitForSelector('.card-head');
  assert.equal(await page.locator('.card-head h2').innerText(), 'מירב כהן');
  assert.equal(await page.getAttribute('.topbar .back', 'href'), '#/matches');
  await page.click(`.card-tools a:has-text("עריכה")`); await page.waitForSelector('#deal-form');
  await page.click('.topbar .back'); await page.waitForSelector('.card-head');
  assert.equal(await page.getAttribute('.topbar .back', 'href'), '#/matches', 'still back to matches after the edit form');
  await page.click('.topbar .back'); await page.waitForSelector('#m-rows .match-row');
  ok('a property opened from the matches: its owner\'s card; "חזרה" returns to the matches (also after edit)');
  await page.goto(BASE + '#/'); await page.waitForSelector('.hero-top');
  await page.goto(BASE + `#/m/owner/${owner}`); await page.waitForSelector('.card-head');
  assert.equal(await page.getAttribute('.topbar .back', 'href'), '#/m/owner');
  await page.goto(BASE + '#/matches'); await page.waitForSelector('#m-rows .match-row');
  await page.selectOption('#m-min', '85');
  assert.equal(await page.locator('#m-rows .match-row').count(), 0);
  await page.selectOption('#m-min', '0');
  await page.click('#m-rows [data-a=dismiss]'); await page.waitForSelector('.dismiss');
  await shot('m06-dismiss');
  await page.click('.dismiss [data-r="גודל"]');
  await page.waitForFunction(() => !document.querySelector('#m-rows .match-row'));
  assert.equal((await page.evaluate(() => PL_TEST_DB._db.dismissals))[0].reason, 'גודל');
  await page.click('#toast .toast-act');
  await page.waitForSelector('#m-rows .match-row');
  ok('dashboard: min-score filter; "לא מתאים" with a reason hides the pair; "ביטול" in the toast brings it back');
  await page.click('#m-rows [data-a=dismiss]'); await page.click('.dismiss [data-r=""]');
  await page.waitForFunction(() => !document.querySelector('#m-rows .match-row'));
  await page.click('label:has-text("נדחו")'); await page.waitForSelector('#m-rows [data-a=restore]');
  await page.click('#m-rows [data-a=restore]'); await page.waitForFunction(() => !document.querySelector('#m-rows .match-row'));
  await page.click('label:has-text("מומלצות")'); await page.waitForSelector('#m-rows .match-row');
  ok('"נדחו" tab lists hidden pairs; "החזרה להתאמות" restores');

  // category filter on the dashboard and in the leads list
  await page.click('#cat-btn'); await page.waitForSelector('.cat-sheet');
  assert.match(await page.locator('.cat-opt', { hasText: 'אופנה' }).innerText(), /אופנה \(1\)/);
  assert.match(await page.locator('.cat-opt', { hasText: 'מזון' }).innerText(), /מזון \(1\)/);
  assert.match(await page.locator('.cat-opt', { hasText: 'רכב' }).innerText(), /רכב \(0\)/);
  await page.fill('#cat-q', 'רכ'); assert.equal(await page.locator('.cat-opt:visible').count(), 1);
  await page.click('.cat-opt:visible'); await page.click('#cat-apply');
  assert.equal(await page.locator('#m-rows .match-row').count(), 0);
  await page.click('.cat-chip'); await page.waitForSelector('#m-rows .match-row');
  await page.goto(BASE + '#/m/lead'); await page.waitForSelector('#rows .deal-row');
  await page.click('#cat-btn'); assert.match(await page.locator('.cat-opt', { hasText: 'אופנה' }).innerText(), /\(1\)/);
  await page.locator('.cat-opt', { hasText: 'אופנה' }).click(); await page.click('#cat-apply');
  await page.waitForFunction(() => document.querySelectorAll('#rows .deal-row').length === 1);
  assert.match(await page.locator('.cat-chip').innerText(), /אופנה ✕/);
  await shot('m07-list-filter');
  await page.click('.cat-chip'); await page.waitForFunction(() => document.querySelectorAll('#rows .deal-row').length === 2);
  ok('category filter: sheet with search and a count per category; chosen shown as chips with ✕; dashboard and lists');

  const lead2 = await page.evaluate(() => PL_TEST_DB._db.lead[1].id);
  await page.goto(BASE + `#/m/lead/${lead2}`); await page.waitForSelector('#matches');
  assert.match(await page.locator('#matches .m-missing').innerText(), /כדי לראות התאמות, חסר: קטגוריה/);
  ok('a card without matches says what is missing ("כדי לראות התאמות, חסר: קטגוריה")');

  // settings
  await page.goto(BASE); await page.click('.hero-settings'); await page.waitForSelector('#ms-form');
  assert.match(await page.locator('#ms-total').innerText(), /100%/);
  assert.equal(await page.locator('.ms-weights + #ms-total').count(), 1);   // right under the weights
  assert.equal(await page.locator('.sticky-save #ms-total').count(), 0);
  assert.deepEqual([await page.locator('#c-yellow-to').innerText(), await page.locator('#c-orange').innerText()], ['74', '49']);
  assert.deepEqual([await page.inputValue('#c-green'), await page.inputValue('#c-yellow')], ['75', '50']);
  await page.click('[data-k=category] [data-d="5"]');
  assert.match(await page.locator('#ms-total').innerText(), /105%[\s\S]*להוריד 5%/);
  assert.equal(await page.isDisabled('#ms-save'), true);
  await shot('m08-settings-105', true);
  await page.click('[data-k=area] [data-d="-5"]');
  assert.equal(await page.isDisabled('#ms-save'), false);
  await page.check('input[name=must][value=category]');
  await page.fill('#c-yellow', '80');
  assert.match(await page.locator('#c-err').innerText(), /מעל הצהוב/); assert.equal(await page.isDisabled('#ms-save'), true);
  await page.fill('#c-yellow', '60'); assert.equal(await page.locator('#c-orange').innerText(), '59');
  await page.fill('#c-green', '85'); assert.equal(await page.locator('#c-yellow-to').innerText(), '84');
  assert.equal(await page.isDisabled('#ms-save'), false);
  await page.click('#ms-save'); await page.waitForSelector('#toast:has-text("נשמרו")');
  const saved = await page.evaluate(() => PL_TEST_DB.calls.filter(c => c.matchSettings).at(-1).matchSettings);
  assert.deepEqual([saved.weights.category, saved.weights.area, saved.must.category, saved.colors.green, saved.colors.yellow], [30, 20, true, 85, 60]);
  ok('settings (one screen): −/+ by 5, total under the weights, save only at 100%; must-conditions; colours as ranges (75+ / 50–74 / 49−), green above yellow, saved');
  await page.goto(BASE + '#/settings/matches'); await page.waitForSelector('#ms-form');
  assert.equal(await page.inputValue('#c-green'), '85');
  await page.click('#ms-reset'); assert.match(await page.locator('#w-category').innerText(), /25%/);
  assert.equal(await page.inputValue('#c-green'), '75');
  await shot('m09-settings', true);
  ok('"שחזור ברירת המחדל" brings back 25/25/20/15/15/0 and 75 / 50; the old link opens the same screen');
  await page.setViewportSize({ width: 1280, height: 860 });
  page.once('dialog', d => d.accept());   // reset without saving → "לצאת בלי לשמור?"
  await page.goto(BASE + '#/m/lead'); await page.waitForSelector('#rows');
  assert.equal(await page.locator('.side-nav a[href="#/matches"]').isVisible(), true);
  assert.equal(await page.locator('.side-nav a[href="#/settings"]').isVisible(), true);
  await page.click('.side-nav a[href="#/matches"]'); await page.waitForSelector('#m-rows');
  assert.equal(await page.getAttribute('.side-nav a[href="#/matches"]', 'aria-current'), 'page');
  await shot('m10-desktop-matches');
  await page.goto(BASE + '#/settings'); await page.waitForSelector('#ms-form'); await shot('m11-desktop-settings');
  for (const k of ['lead', 'owner', 'matches', 'settings']) assert.equal(await page.locator(`.side-nav .ico-${k}`).count(), 1, k);
  ok('desktop: side menu has "התאמות" and "הגדרות", each item with its icon');

  assert.deepEqual(errors, [], 'page errors: ' + errors.join(' | '));
  ok('no JS errors');
  console.log(`\nApp matches passed: ${pass}`);
} catch (e) {
  console.error('\n✗ FAILED:', e.message);
  await page.screenshot({ path: SHOTS + 'failure-matches.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally { await browser.close(); server.close(); }
