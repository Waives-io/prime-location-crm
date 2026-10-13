// Headless QA of index.html against the in-memory QA data layer (qa/local-db.js).
// Usage: node e2e.test.mjs [--shots]   (screenshots go to qa/screens/)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = fileURLToPath(new URL('./screens/', import.meta.url));
const shots = process.argv.includes('--shots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'he-IL', hasTouch: false });
await ctx.addInitScript({ path: fileURLToPath(new URL('./local-db.js', import.meta.url)) });
let geoCalls = 0, photonCalls = 0;
await ctx.route('https://photon.komoot.io/**', (route) => {
  photonCalls++;
  if (!route.request().url().includes('lang=default')) throw new Error('Photon must be asked for local (Hebrew) names: lang=default');
  const q = decodeURIComponent(new URL(route.request().url()).searchParams.get('q') || '');
  const features = q.includes('חולון') ? [{ geometry: { coordinates: [34.8035, 32.0167] },
    properties: { countrycode: 'IL', name: 'אזור התעשייה חולון', district: 'אזור תעשייה ב', city: 'חולון' } }]
    : q.includes('קריית גת') ? [{ geometry: { coordinates: [34.77, 31.61] }, properties: { countrycode: 'IL', name: 'קריית גת', city: 'קריית גת' } }] : [];
  route.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features }) });
});
await ctx.route('https://nominatim.openstreetmap.org/**', (route) => {
  geoCalls++;
  const u = route.request().url();
  const body = u.includes('/reverse')
    ? { display_name: 'הגפן 5, קריית גת', address: { road: 'הגפן', house_number: '5', city: 'קריית גת' } }
    : [{ lat: '31.6100', lon: '34.7700', display_name: 'קריית גת, מחוז הדרום, ישראל', address: { city: 'קריית גת' } }];
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|network|Invalid login credentials|should be different/.test(m.text())) errors.push(m.text()); });

let pass = 0;
const ok = (n) => { pass++; console.log('  ✓', n); };
const shot = async (name, full = false) => { if (shots) { await mkdir(SHOTS, { recursive: true }); await page.waitForTimeout(500); await page.screenshot({ path: SHOTS + name + '.png', fullPage: full }); } };
const text = (sel) => page.locator(sel).innerText();
const fill = async (sel, v) => { await page.fill(sel, v); await page.locator(sel).blur(); };
const radio = (name, value) => page.locator(`label:has(> input[name="${name}"][value="${value}"])`).click();

try {
  /* ── login ── */
  await page.goto(BASE);
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
  await shot('01-login');
  await page.fill('#email', 'qa@prime.test'); await page.fill('#password', 'wrong');
  await page.click('button[type=submit]');
  await page.waitForSelector('#login-err:has-text("שגויים")');
  ok('login: wrong password → Hebrew error');
  await page.click('.eye');
  assert.equal(await page.getAttribute('#password', 'type'), 'text');
  ok('login: eye icon shows the password');
  await page.fill('#password', 'qa-pass-1234');
  await page.click('button[type=submit]');
  await page.waitForSelector('.home-btn');
  const counts = await page.locator('.home-btn small').allInnerTexts();
  assert.deepEqual(counts.map(s => s.replace(/\s+/g, ' ')), ['2 פעילות', '1 פעילות']);
  ok('home: two module buttons with active counts');
  await shot('02-home');
  await page.reload(); await page.waitForSelector('.home-btn');
  ok('session remembered after reload');

  /* change password */
  await page.click('[data-act=password]');
  await page.fill('#pw1', 'short'); await page.locator('#pw1').blur();
  assert.equal(await text('#pw1-err'), 'הסיסמה צריכה להכיל לפחות 8 תווים');
  await page.fill('#pw1', 'qa-pass-1234'); await page.fill('#pw2', 'qa-pass-9999');
  await page.click('#pw-form button[type=submit]');
  assert.equal(await text('#pw2-err'), 'הסיסמאות לא זהות');
  await page.fill('#pw2', 'qa-pass-1234'); await page.click('#pw-form button[type=submit]');
  await page.waitForSelector('#pw1-err:has-text("שונה מהנוכחית")');
  await page.fill('#pw1', 'new-pass-5678'); await page.fill('#pw2', 'new-pass-5678');
  await page.click('#pw-form button[type=submit]');
  await page.waitForSelector('#toast.show:has-text("הסיסמה עודכנה")');
  assert.equal(await page.evaluate(() => document.querySelector('#dlg').open), false);
  ok('change password: min length, match check, same-password error, success toast');

  /* ── list, archive, search ── */
  await page.click('.home-btn >> nth=0');
  await page.waitForSelector('#rows li a');
  assert.equal(await page.locator('#rows li a').count(), 2);
  assert.equal(await page.locator('.bottom-nav a[aria-current=page]').innerText(), 'מתעניינים');
  await shot('03-list');
  await radio('tab', 'archive');
  assert.equal(await page.locator('#rows li a').count(), 1);
  await shot('04-archive');
  await page.fill('#q', 'לוי'); assert.equal(await page.locator('#rows li a').count(), 1);
  await radio('tab', 'active');
  assert.equal(await page.locator('#rows li a').count(), 1);
  assert.equal(await page.locator('#rows .row-chip').innerText(), 'ארכיון');
  await page.fill('#q', 'אין כזה'); assert.match(await text('#rows'), /לא נמצאו תוצאות/);
  await page.fill('#q', '0541110001'); assert.equal(await page.locator('#rows li a').count(), 2);
  await page.fill('#q', 'אברהם לוגיסטיקה'); assert.equal(await page.locator('#rows li a').count(), 2);
  await page.fill('#q', '');
  ok('list: tabs; search covers active + archive (archived row marked "ארכיון"); name, phone, company; empty state');
  assert.deepEqual(await page.locator('.bottom-nav a').allInnerTexts(), ['מתעניינים', '+ חדש', 'בעלים / משכיר']);
  assert.equal(await page.isVisible('.new-top'), false); assert.equal(await page.locator('.fab').count(), 0);
  ok('phone: "+ חדש" sits in the middle of the bottom bar (no floating button over the rows)');

  /* daily sweep: close / restore from the list */
  const firstName = await page.locator('#rows li .name').first().innerText();
  await page.locator('#rows li .row-act').first().click();
  await page.click('dialog button:has-text("לא רלוונטית")');
  await page.waitForFunction(() => document.querySelectorAll('#rows li.deal-row').length === 1);
  assert.equal(await page.evaluate(() => location.hash), '#/m/lead');
  await page.click('#toast .toast-act');
  await page.waitForFunction(() => document.querySelectorAll('#rows li.deal-row').length === 2);
  assert.equal(await page.locator('#rows li .name').first().innerText(), firstName);
  ok('list: "סגירת עסקה" on a row → reason → archived, stays on the list; "ביטול" in the toast brings it back');
  await radio('tab', 'archive');
  await page.locator('#rows li .row-act:has-text("החזרה לפעילות")').click();
  await page.waitForFunction(() => !document.querySelector('#rows li.deal-row'));
  await radio('tab', 'active');
  assert.equal(await page.locator('#rows li.deal-row').count(), 3);
  await page.locator('#rows li .row-act').nth(2).click();
  await page.click('dialog button:has-text("נסגרה")');
  await page.waitForFunction(() => document.querySelectorAll('#rows li.deal-row').length === 2);
  ok('archive tab: "החזרה לפעילות" on a row restores it');

  /* ── new lead: validation ── */
  await page.click('.bottom-nav .nav-new');
  await page.waitForSelector('#deal-form');
  assert.equal(await page.locator('.back').innerText(), 'חזרה');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.back'), '::before').content), '"→"');
  ok('form: back control with text, arrow points right (RTL)');
  await page.click('#save');
  await page.waitForSelector('[data-field=phone].invalid');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'phone');
  const errCount = await page.locator('.field.invalid').count();
  assert.ok(errCount >= 8, 'errors: ' + errCount);
  ok(`save on empty form → ${errCount} inline errors, focus on first (phone)`);
  await fill('#phone', '12345');
  assert.equal(await text('#phone-err'), 'מספר נייד צריך להכיל 10 ספרות ולהתחיל ב-05');
  await page.fill('#phone', '052-111');
  assert.equal(await text('#phone-err'), 'מספר נייד צריך להכיל 10 ספרות ולהתחיל ב-05');
  ok('phone: error on blur, still shown while typing invalid');

  /* existing phone prefill */
  await fill('#phone', '+972 52-111-0002');
  await page.waitForSelector('#existing-note:not([hidden])');
  assert.equal(await page.inputValue('#phone'), '052-1110002');
  assert.equal(await page.inputValue('#name'), 'מירב כהן');
  assert.equal(await text('#phone-err'), '');
  assert.equal(await text('#existing-note'), 'לקוח קיים – אין צורך למלא שוב פרטים');
  ok('existing phone (+972 format) → normalized, "לקוח קיים – אין צורך למלא שוב פרטים", name prefilled');

  /* stale phone lookup must not overwrite a newer phone */
  await page.evaluate(() => { const f = PL_TEST_DB.findContact.bind(PL_TEST_DB);
    PL_TEST_DB.findContact = async (p) => { if (p === '054-1110001') await new Promise(r => setTimeout(r, 400)); return f(p); }; });
  await fill('#phone', '0541110001');
  await page.fill('#phone', '0521110002'); await page.locator('#phone').blur();
  await page.waitForTimeout(600);
  assert.equal(await page.inputValue('#name'), 'מירב כהן');
  ok('slow lookup for an older phone does not overwrite the newer contact');

  /* + חדש in dropdown keeps typed data */
  await fill('#size_value', '2');
  await page.selectOption('#need_id', '__new');
  await page.fill('#need_id-new input', 'לחכור');
  await page.click('#need_id-new button:has-text("הוספה")');
  await page.waitForFunction(() => document.querySelector('#need_id').selectedOptions[0]?.textContent === 'לחכור');
  assert.equal(await page.inputValue('#name'), 'מירב כהן');
  assert.equal(await page.inputValue('#size_value'), '2');
  ok('"+ חדש" adds "לחכור", selects it, keeps everything typed');

  await page.click('[data-field=purpose_id] .opt-edit');
  const rowOf = (v) => page.locator('.opt-rows li').filter({ has: page.locator(`input[value="${v}"]`) });
  const mrl = rowOf('מרלוג');
  assert.match(await mrl.locator('.hint').first().innerText(), /בשימוש ב-1 רשומות/);
  await mrl.locator('input').fill('מרלוג / לוגיסטיקה');
  assert.equal(await mrl.locator('.warn').isVisible(), true);
  await mrl.locator('[data-a=save]').click();
  await page.waitForSelector('.opt-rows input[value="מרלוג / לוגיסטיקה"]');
  const off = rowOf('פרטי');
  await off.locator('[data-a=remove]').click();
  assert.match(await off.locator('.confirm').innerText(), /להסיר את "פרטי"/);
  await off.locator('[data-a=remove-yes]').click();
  await page.waitForFunction(() => !document.querySelector('.opt-rows input[value="פרטי"]'));
  await page.click('dialog [data-a=close]');
  await page.waitForFunction(() => [...document.querySelectorAll('#purpose_id option')].some(o => o.textContent === 'מרלוג / לוגיסטיקה'));
  const purposeOpts = await page.locator('#purpose_id option').allInnerTexts();
  assert.ok(purposeOpts.includes('מרלוג / לוגיסטיקה') && !purposeOpts.includes('פרטי') && !purposeOpts.includes('מרלוג'));
  assert.equal(await page.inputValue('#name'), 'מירב כהן');
  ok('"עריכת הרשימה": rename warns when in use, remove hides value; form keeps typed data');
  await page.selectOption('#purpose_id', { label: 'מחסן' });
  await radio('size_unit', 'dunam');
  await fill('#height_m', '7');
  await page.fill('#address', 'אזור התעשיה חולון'); await page.click('#geo-go');
  await page.click('#geo-results button');
  await page.waitForSelector('.leaflet-marker-icon');
  assert.equal(await page.inputValue('#address'), 'אזור התעשייה חולון, חולון');
  ok('approximate search "אזור התעשיה חולון" (missing י) finds the zone, fills the one address field + pin');
  assert.equal(await page.locator('path.leaflet-interactive').count(), 1);
  await page.locator('#radius').fill('10000');
  assert.equal(await text('#radius-out'), '10 ק״מ');
  ok('map: address search → pin + radius circle, slider 10 km');
  await fill('#budget_value', '1500000');
  assert.equal(await page.inputValue('#budget_value'), '1,500,000');
  await radio('budget_currency', 'USD');
  assert.equal(await page.locator('[data-field=budget_value] .affix span').innerText(), '$');
  await page.fill('#needed_by', '2027-02-01');
  await shot('05-form-lead', true);

  /* leaving a dirty form asks first */
  let asked = 0;
  page.once('dialog', d => { asked++; d.dismiss(); });
  await page.click('.back');
  await page.waitForTimeout(200);
  assert.equal(asked, 1);
  assert.equal(await page.inputValue('#name'), 'מירב כהן');
  ok('back on a form with typing → confirm; cancel keeps everything');

  /* save failure keeps data, retry uses same id */
  await page.evaluate(() => { window.PL_TEST_FAIL_NEXT_SAVE = true; });
  await page.click('#save');
  await page.waitForSelector('#toast.show:has-text("השמירה נכשלה")');
  assert.equal(await page.inputValue('#name'), 'מירב כהן');
  assert.equal(await page.isEnabled('#save'), true);
  await page.click('#save');
  await page.waitForSelector('.card-head');
  const calls = await page.evaluate(() => PL_TEST_DB.calls.map(c => c.p.id));
  assert.equal(calls.length, 2); assert.equal(calls[0], calls[1]);
  ok('save fails → data kept, retry succeeds with the same deal id (no duplicate)');

  /* card */
  assert.match(await text('.dl'), /לחכור/);
  assert.match(await text('.dl'), /2 דונם/);
  assert.match(await text('.dl'), /\$ 1,500,000 סה״כ/);
  assert.match(await text('.dl'), /אזור התעשייה חולון/);
  ok('budget in $ shown on the card; lead keeps the address / area');
  assert.equal(await page.getAttribute('a:has-text("WhatsApp")', 'href'), 'https://wa.me/972521110002');
  assert.equal(await page.getAttribute('a:has-text("חיוג")', 'href'), 'tel:0521110002');
  ok('card: details, WhatsApp wa.me/972… and tel: links');
  await shot('06-card-lead', true);

  /* duplicate */
  await page.click('a:has-text("שכפול")');
  await page.waitForSelector('#deal-form');
  assert.equal(await text('.topbar h1'), 'שכפול עסקה');
  assert.equal(await page.inputValue('#name'), 'מירב כהן');
  assert.equal(await page.inputValue('#height_m'), '7');
  const today = await page.evaluate(() => todayISO());
  assert.equal(await page.inputValue('#lead_date'), today);
  /* add custom field inside the form */
  await page.click('.add-field[data-section=property]');
  await page.fill('#nf_label', 'קומה'); await page.selectOption('#nf_type', 'number');
  await page.click('#nf_save');
  await page.waitForSelector('.cf-list[data-section=property] .field label:has-text("קומה")');
  await page.locator('.cf-list[data-section=property] input').fill('3');
  await page.click('#save');
  await page.waitForSelector('.card-head');
  assert.match(await text('.dl'), /קומה\s*3/);
  const dtOrder = await page.locator('.dl dt').allInnerTexts();
  assert.ok(dtOrder.indexOf('קומה') > dtOrder.indexOf('גובה נדרש') && dtOrder.indexOf('קומה') < dtOrder.indexOf('כתובת / אזור'), dtOrder.join(','));
  ok('duplicate: prefilled form, today\'s date; "+ שדה חדש" inside "הנכס" appears there in the form and on the card');
  const leadsActive = await page.evaluate(() => PL_TEST_DB._db.lead.filter(d => d.status === 'active').length);
  assert.equal(leadsActive, 4);

  /* archive + restore */
  await page.click('#close-deal');
  await page.click('dialog button:has-text("נסגרה")');
  await page.waitForSelector('#restore-deal');
  assert.equal(await text('.chip'), 'נסגרה');
  ok('close deal → reason "נסגרה" → archived');
  await page.click('#restore-deal');
  await page.waitForSelector('#close-deal');
  assert.equal(await text('.chip'), 'פעילה');
  ok('archive → "החזרה לפעילות" restores');

  /* ── owner: rent + rented → yield ── */
  await page.click('.bottom-nav a:has-text("בעלים")');
  await page.waitForSelector('#rows');
  await page.click('.bottom-nav .nav-new');
  await page.waitForSelector('#deal-form');
  await fill('#phone', '053 999 8887');
  assert.equal(await page.inputValue('#phone'), '053-9998887');
  assert.equal(await page.isHidden('#existing-note'), true);
  await fill('#name', 'בעלים חדש');
  await radio('entity_type', 'company');
  await page.click('#save');
  await page.waitForSelector('[data-field=company_name].invalid');
  await fill('#company_name', 'חברת בדיקה');
  await page.selectOption('#purpose_id', { label: 'חנות' });
  await fill('#built_sqm', '100'); await fill('#plot_sqm', '120');
  await page.locator('#form-map').click({ position: { x: 180, y: 120 } });
  await page.waitForFunction(() => document.querySelector('#address').value === 'הגפן 5, קריית גת');
  ok('owner map tap → pin + address filled from reverse search (editable)');
  await radio('deal_kind', 'rent');
  await fill('#asking_price', '2000000');
  await radio('is_rented', 'true');
  await page.fill('#monthly_rent', '10000');
  assert.equal(await text('#yield'), 'תשואה: 6.0%');
  ok('rent + rented → live yield "תשואה: 6.0%"');
  await shot('07-form-owner', true);
  await page.click('#save');
  await page.waitForSelector('.card-head');
  assert.match(await text('.dl'), /תשואה\s*6\.0%/);
  assert.doesNotMatch(await text('.dl'), /תיאור/);
  ok('owner rent deal saved without a description (optional), yield on card');
  await shot('08-card-owner', true);

  /* owner sale → estimate */
  await page.click('a:has-text("עריכה")');
  await page.waitForSelector('#deal-form');
  assert.equal(await page.inputValue('#company_name'), 'חברת בדיקה');
  await radio('deal_kind', 'sale');
  assert.equal(await page.isHidden('#rent-block'), true);
  const sale = await text('#sale-calc');
  assert.match(sale, /מחיר למ״ר מבוקש: ₪ 20,000/);
  assert.match(sale, /הערכת מחיר למ״ר: ₪ 16,100/);
  assert.match(sale, /הערכה/);
  await page.click('#save');
  await page.waitForSelector('.card-head');
  const saved = await page.evaluate(() => PL_TEST_DB._db.owner.find(d => d.address === 'הגפן 5, קריית גת'));
  assert.equal(saved.is_rented, null); assert.equal(saved.monthly_rent, null); assert.equal(saved.ai_price_per_sqm, 16100);
  ok('sale → asking ₪/sqm + estimate labelled "הערכה"; rent fields cleared on save');

  /* phone normalization unit cases */
  const cases = await page.evaluate(() => ['0501234567', '050-123-4567', '050 123 4567', '+972501234567', '+972-50-123-4567',
    '00972501234567', '972501234567', '(050) 1234567', '0401234567', '05012345', '050123456789', 'abc'].map(Phone.normalize));
  assert.deepEqual(cases, ['050-1234567', '050-1234567', '050-1234567', '050-1234567', '050-1234567', '050-1234567', '050-1234567', '050-1234567', null, null, null, null]);
  ok('phone tests: valid, spaces, dashes, brackets, +972, 00972, 972; invalid rejected');

  assert.ok(geoCalls <= 2, 'nominatim calls: ' + geoCalls);
  ok(`geocoding: ${photonCalls} Photon searches, ${geoCalls} Nominatim requests (map-tap reverse only)`);

  /* desktop layout: side nav */
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE + '#/m/owner'); await page.waitForSelector('#rows');
  assert.equal(await page.isVisible('.side-nav'), true);
  assert.equal(await page.isVisible('.bottom-nav'), false);
  assert.equal(await page.locator('.side-nav a[aria-current=page]').innerText(), 'בעלים / משכיר');
  assert.equal(await page.isVisible('.topbar .new-top'), true); assert.equal(await page.isVisible('.bottom-nav'), false);
  ok('desktop: right side menu with active module, no bottom bar, "+ חדש" in the top bar');
  await shot('09-desktop-list');

  assert.deepEqual(errors, [], 'page errors: ' + errors.join(' | '));
  ok('no JS errors in the console');
  console.log(`\nE2E passed: ${pass}`);
} catch (e) {
  console.error('\n✗ FAILED:', e.message);
  if (shots) await page.screenshot({ path: SHOTS + 'failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close(); server.close();
}
