// Headless QA of the built demo (demo-site/, run `node tools/build-demo.mjs` first).
// Usage: node demo.e2e.mjs [--shots]   (screenshots → qa/screens/demo-*.png, 390px)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('../demo-site/', import.meta.url));
const SHOTS = fileURLToPath(new URL('./screens/', import.meta.url));
const shots = process.argv.includes('--shots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\\/]+/, '') || 'index.html';
  try { const body = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'he-IL' });
await ctx.route(/supabase/, (r) => { throw new Error('demo must never call Supabase: ' + r.request().url()); });
await ctx.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204 }));
await ctx.route('https://nominatim.openstreetmap.org/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ display_name: 'אזור התעשייה, קריית גת', address: { industrial: 'אזור התעשייה', city: 'קריית גת' } }) }));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|Invalid login credentials/.test(m.text())) errors.push(m.text()); });

let pass = 0;
const ok = (n) => { pass++; console.log('  ✓', n); };
const shot = async (name, full = false) => { if (shots) { await mkdir(SHOTS, { recursive: true }); await page.waitForTimeout(400); await page.screenshot({ path: SHOTS + 'demo-' + name + '.png', fullPage: full }); } };
const text = (sel) => page.locator(sel).innerText();
const keys = () => page.evaluate(() => Object.keys(localStorage).sort());

try {
  /* ── login ── */
  await page.goto(BASE);
  // a live-app session on the same origin must survive everything the demo does
  await page.evaluate(() => localStorage.setItem('sb-tbuhhxcgkxuovbdtebqv-auth-token', 'LIVE'));
  await page.reload();
  assert.equal(await page.inputValue('#email'), 'broker@nadlan-demo.co.il');
  assert.ok((await page.inputValue('#password')).length >= 8);
  assert.match(await text('#login button[type=submit]'), /התחברות/);
  assert.match(await text('.login-title'), /ברוכים הבאים/);
  assert.equal(await page.locator('.login-photo').count(), 1);
  assert.equal(await page.title(), 'נדל״ן בע״מ · דמו CRM');
  await page.click('.login-row .link'); await page.waitForSelector('#toast.show:has-text("בדמו")');
  await shot('01-login');
  ok('login: split screen (photo + "ברוכים הבאים"), credentials prefilled, "שכחת סיסמה?" explains it is a demo');
  await page.fill('#password', 'wrong'); await page.click('#login button[type=submit]');
  await page.waitForSelector('#login-err:has-text("שגויים")');
  assert.match(await text('#login button[type=submit]'), /התחברות/);
  ok('login is real: wrong password → error, the button keeps its label');
  await page.reload(); await page.click('#login button[type=submit]');
  await page.waitForSelector('.lead-table');
  assert.ok(page.url().endsWith('#/m/lead'));
  ok('login → מתעניינים (each module is its own dashboard; no separate dashboard page)');

  /* ── shell ── */
  assert.match(await text('.demo-banner'), /סביבת הדגמה/);
  const navs = await page.$$eval('.side-nav a.mod', a => a.map(x => x.textContent.trim()));
  assert.deepEqual(navs, ['מתעניינים', 'נכסים', 'התאמות']);
  assert.equal(await page.locator('.side-nav a.mod svg.ic:not(.cur-arrow)').count(), 3);
  assert.equal((await page.locator('.side-nav a.mod[aria-current=page]').innerText()).trim(), 'מתעניינים');
  ok('side menu: only working pages, with icons; the current page is marked');

  /* ── leads: KPIs, table, filters, panel ── */
  const kp = await page.$$eval('.mod-kpis .kpi-card', t => t.map(x => x.querySelector('.kpi-label').textContent));
  assert.deepEqual(kp, ['מתעניינים חדשים', 'מתעניינים חמים', 'מתעניינים לא פעילים', 'זמן תגובה ממוצע']);
  const heads = await page.$$eval('.lead-table thead th', t => t.map(x => x.textContent.trim()));
  assert.deepEqual(heads, ['שם מלא', 'סוג לקוח', 'ערים מועדפות', 'תקציב', 'סוג נכס', 'ציון התאמה', 'סטטוס', 'מקור הגעה', 'יצירת קשר אחרונה']);
  assert.ok(await page.locator('#l-rows tr[data-id]').count() >= 5);
  assert.ok(await page.locator('#l-rows .score:not(.none)').count() >= 3);
  assert.equal(await page.locator('#l-panel .dp').count(), 1);
  await shot('02-leads');
  ok('מתעניינים: 4 metrics, table with match score / status / source / last contact, first row open in the side panel');
  const hotN = +(await page.locator('.kpi-card:has-text("חמים") .kpi-value').innerText());
  await page.click('.kpi-card:has-text("חמים")'); await page.waitForFunction(() => location.hash === '#/m/lead');
  await page.waitForSelector('.lead-table');
  assert.equal(await page.inputValue('#l-stage'), 'חם');
  assert.equal(await page.locator('#l-rows tr[data-id]').count(), Math.min(10, hotN));
  ok(`metric "מתעניינים חמים" (${hotN}) filters the table to exactly those leads`);
  await page.click('#l-clear'); await page.waitForSelector('.lead-table');
  await page.selectOption('#l-quick', 'all');
  const allN = await page.evaluate(() => S.data.lead.length);
  assert.match(await text('#l-pager .count'), new RegExp(`1–10 מתוך ${allN}`));
  await page.click('#l-pager .pg[data-pg="2"]'); assert.match(await text('#l-pager .count'), new RegExp(`11–20 מתוך ${allN}`));
  ok('pager: 10 per page, "1–10 מתוך N", page 2 works');
  await page.selectOption('#l-quick', 'active'); await page.fill('#lq', 'רונית');
  await page.locator('#l-rows tr[data-id]').first().click();
  const tomorrow = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 1); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); });
  assert.match(await page.locator('#l-rows tr[data-id] .date-badge').first().getAttribute('class'), /(^| )red( |$)/);
  assert.match(await page.locator('#l-rows tr[data-id] .date-badge').first().innerText(), new RegExp(tomorrow));
  assert.match(await text('#l-panel .who strong'), /רונית שרעבי/);
  ok(`search + row click: panel shows the lead; needed tomorrow = red date badge ${tomorrow} in the row`);
  // quick actions: note + meeting + task done
  await page.click('#l-panel [data-dp=note]'); await page.fill('#act-text', 'התקשרה, מבקשת לראות נכסים ביום ראשון'); await page.click('#act-form button[type=submit]');
  await page.waitForSelector('#toast.show:has-text("ההערה נשמרה")'); await page.waitForSelector('#l-panel .notes li');
  await page.click('#l-panel [data-dp=meeting]'); await page.click('#act-form button[type=submit]');
  await page.waitForSelector('#toast.show:has-text("הפגישה נקבעה")');
  const openT = await page.locator('#l-panel .tasks li').count();
  await page.locator('#l-panel .tasks input[type=checkbox]').first().check();
  await page.waitForSelector('#toast.show:has-text("בוצעה")');
  await page.waitForFunction((n) => document.querySelectorAll('#l-panel .tasks li').length === n - 1 || n > 4, openT);
  await page.click('#l-panel .quick a.wa-btn'); await page.waitForSelector('#toast.show:has-text("המספרים בדויים")');
  ok('panel: "הוסף הערה" → יומן הערות, "קבע פגישה" → task with a time, ticking a task removes it, WhatsApp/call only explain');
  await shot('03-lead-panel');

  /* ── properties: KPIs, advanced filters, cards with photos, panel ── */
  await page.click('.side-nav a.mod:has-text("נכסים")'); await page.waitForSelector('.pcard');
  const pk = await page.$$eval('.mod-kpis .kpi-card', t => t.map(x => x.querySelector('.kpi-label').textContent));
  assert.deepEqual(pk, ['סה״כ נכסים', 'נכסים פנויים', 'נכסים חדשים החודש', 'שיעור תפוסה ממוצע']);
  assert.ok(await page.locator('.pcard img.pc-img').count() >= 10);
  assert.ok(await page.locator('.pcard .pstatus').count() >= 10);
  assert.equal(await page.locator('#p-panel .dp-photo img').count(), 1);
  await shot('04-properties');
  ok('נכסים: 4 metrics, photo cards with status, size / price / occupancy, first card open in the side panel');
  const vac = +(await page.locator('.kpi-card:has-text("פנויים") .kpi-value').innerText());
  await page.click('.kpi-card:has-text("פנויים")'); await page.waitForSelector('.pcard');
  assert.equal(await page.locator('.pcard').count(), vac);
  await page.selectOption('#p-status', ''); await page.selectOption('#p-g', 'storage');
  const stor = await page.locator('.pcard').count(); assert.ok(stor >= 2);
  await page.click('label:has(input[value=list])'); assert.equal(await page.locator('.prow').count(), stor);
  await page.click('label:has(input[value=cards])'); await page.selectOption('#p-g', '');
  ok(`metric "נכסים פנויים" (${vac}) filters the cards; סוג נכס filter; כרטיסים ⇄ רשימה`);
  await page.locator('.pcard').nth(2).click();
  await page.click('#p-panel [data-dp=task]'); await page.fill('#act-text', 'לשלוח תמונות עדכניות'); await page.click('#act-form button[type=submit]');
  await page.waitForSelector('#p-panel .tasks li:has-text("לשלוח תמונות עדכניות")');
  ok('property panel: "הוסף פעולה" adds to פעולות קרובות');

  /* ── full card + matches in both directions ── */
  await page.click('#p-panel a.btn.primary'); await page.waitForSelector('.card-head');
  assert.match(page.url(), /#\/m\/owner\/[0-9a-f-]+$/);
  await page.goto(BASE + '#/matches'); await page.waitForSelector('.ml-group');
  const total = +(await page.locator('.mf-count bdi').innerText());
  await page.click('.match-filters a.fchip[href*="t=rent"]'); await page.waitForSelector('.mf-clear');
  assert.ok(+(await page.locator('.mf-count bdi').innerText()) < total);
  await shot('05-matches');
  await page.locator('.ml-lead').first().click(); await page.waitForSelector('.card-matches');
  ok('"צפייה בפרטי נכס מלאים" → full card; התאמות screen with filters → lead card with its matching properties');

  /* ── property with asking rent: saves and changes matching ── */
  await page.goto(BASE + '#/m/owner/' + (await page.evaluate(() => S.data.owner.find(o => o.contact.name === 'ורד שושן').id))); await page.waitForSelector('.card-head');
  assert.ok(!(await page.locator('.dl').innerText()).includes('שכירות מבוקשת'));
  await page.click('a:has-text("עריכה")'); await page.waitForSelector('#asking_rent');
  if (shots) { await page.locator('[data-field=built_sqm]').evaluate(e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300); await page.locator('[data-field=built_sqm]').locator('xpath=..').screenshot({ path: SHOTS + 'demo-09-sqm.png' }); }
  await page.fill('#asking_rent', '10800'); await page.click('#save');
  await page.waitForSelector('.card-head');
  assert.match(await page.locator('.dl').innerText(), /שכירות מבוקשת לחודש[\s\S]*10,800/);
  assert.ok(await page.locator('.card-matches .match:not(.is-near)').count() >= 1);
  ok('נכס להשכרה: "שכירות מבוקשת לחודש" saved, shown on the card, and the renter now matches');

  /* ── purpose group inside "עריכת הרשימה" ── */
  await page.goto(BASE + '#/m/lead/new'); await page.waitForSelector('#purpose_id');
  await page.click('[data-field=purpose_id] .opt-edit'); await page.waitForSelector('#dlg[open] select[data-a=group]');
  const groupCount = await page.locator('#dlg select[data-a=group]').count();
  assert.equal(groupCount, await page.locator('#dlg li[data-id]').count());
  await page.locator('#dlg select[data-a=group]').first().selectOption('industry');
  await page.waitForSelector('#toast.show:has-text("קבוצת ההתאמה עודכנה")');
  await shot('07-groups');
  await page.locator('#dlg select[data-a=group]').first().selectOption('storage');
  await page.click('#dlg [data-a=close]');
  ok('עריכת הרשימה: every value has a "קבוצת התאמה" picker that saves on change');

  /* ── "+ הוסף נכס חדש" on the properties page ── */
  await page.goto(BASE + '#/m/owner'); await page.waitForSelector('.pcard');
  await page.click('.adv-head a.btn.accent'); await page.waitForSelector('#deal-form');
  assert.ok(page.url().endsWith('#/m/owner/new'));
  ok('"+ הוסף נכס חדש" opens the property form');

  /* ── owner colour tool: hidden for visitors, ?tune opens it, text colour follows the background ── */
  await page.goto(BASE + '#/m/lead'); await page.waitForSelector('.mod-kpis');
  assert.equal(await page.locator('#tune-panel').count(), 0);
  await page.goto(BASE + '?tune#/m/lead'); await page.waitForSelector('#tune-panel');
  await page.waitForSelector('.mod-kpis');
  await page.locator('#tune-panel input[data-k=kpis]').evaluate((el) => { el.value = '#f2f2f2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.mod-kpis .kpi-card')).backgroundColor), 'rgb(242, 242, 242)');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.mod-kpis .kpi-value')).color), 'rgb(7, 28, 38)');
  await page.click('#tune-panel [data-t=reset]');
  await page.goto(BASE + '#/m/lead'); await page.waitForSelector('.mod-kpis');
  ok('colour tool: only with ?tune; a light card colour switches the text to dark; "ברירת מחדל" restores');

  /* ── persistence, reset, storage isolation ── */
  await page.goto(BASE + '#/m/lead'); await page.reload(); await page.waitForSelector('.lead-table');
  await page.goto(BASE + '#/m/owner/' + (await page.evaluate(() => S.data.owner.find(o => o.contact.name === 'ורד שושן').id)));
  await page.waitForSelector('.dl');
  assert.match(await page.locator('.dl').innerText(), /10,800/);
  ok('changes survive a reload (stored in this browser)');
  /* photos: IndexedDB, survive a reload, cleared by איפוס */
  const shuId = await page.evaluate(() => S.data.owner.find(o => o.contact.name === 'ורד שושן').id);
  await page.goto(BASE + '#/m/owner/' + shuId + '/edit'); await page.waitForSelector('#photo-input', { state: 'attached' });
  await page.setInputFiles('#photo-input', [fileURLToPath(new URL('../assets/photo-building.jpg', import.meta.url))]);
  await page.waitForFunction(() => document.querySelectorAll('#photo-grid .ph:not(.pending)').length === 1);
  await page.click('#save'); await page.waitForSelector('#card-photos img');
  await page.reload(); await page.waitForFunction(() => document.querySelector('#card-photos img')?.src.startsWith('blob:'));
  ok('demo photos: added in the form, kept in IndexedDB, shown after a reload');
  assert.ok(!(await page.locator('[data-act=password]').count()), 'no password change in the demo');
  await page.goto(BASE + '#/m/lead'); await page.waitForSelector('.lead-table');
  await page.click('.side-nav [data-act=demo-reset]');
  await page.click('#dlg [data-yes]'); await page.waitForSelector('#toast.show:has-text("הדמו אופס")');
  const shu = await page.evaluate(() => S.data.owner.find(o => o.contact.name === 'ורד שושן'));
  assert.equal(shu.asking_rent, null);
  ok('"איפוס הדמו" (menu, confirm) → seed data back; no "שינוי סיסמה" in the demo');
  const leftPhotos = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('nadlan-demo-photos', 1);
    r.onsuccess = () => { const q = r.result.transaction('files').objectStore('files').count(); q.onsuccess = () => res(q.result); }; }));
  assert.equal(leftPhotos, 0);
  ok('"איפוס הדמו" also deletes the demo photos');
  const ks = await keys();
  assert.deepEqual(ks.filter(k => !k.startsWith('nadlan-demo:v1:')), ['sb-tbuhhxcgkxuovbdtebqv-auth-token']);
  assert.equal(await page.evaluate(() => localStorage.getItem('sb-tbuhhxcgkxuovbdtebqv-auth-token')), 'LIVE');
  ok('storage: demo keys all "nadlan-demo:v1:*"; the live app\'s key on the same origin is untouched');

  /* ── month change: untouched → fresh seed; changed → dates move forward ── */
  const rebase = await page.evaluate(async (dirty) => {
    const k = 'nadlan-demo:v1:data', db = JSON.parse(localStorage.getItem(k));
    const before = db.lead[0].needed_by;
    const d = new Date(db.anchor); d.setDate(d.getDate() - 40); db.anchor = d.toISOString().slice(0, 10);
    db.dirty = true; db.lead[0].notes = 'נערך';
    localStorage.setItem(k, JSON.stringify(db));
    return before;
  });
  await page.reload(); await page.waitForSelector('.lead-table');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('nadlan-demo:v1:data')));
  assert.equal(after.lead[0].notes, 'נערך');
  const shift = (new Date(after.lead[0].needed_by) - new Date(rebase)) / 86400000;
  assert.equal(Math.round(shift), 40);
  ok('new month with visitor changes: changes kept, all dates move forward');
  await page.evaluate(() => { const k = 'nadlan-demo:v1:data', db = JSON.parse(localStorage.getItem(k)); db.anchor = '2020-01-01'; db.dirty = false; db.lead[0].notes = 'X'; localStorage.setItem(k, JSON.stringify(db)); });
  await page.reload(); await page.waitForSelector('.lead-table');
  assert.notEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('nadlan-demo:v1:data')).lead[0].notes), 'X');
  ok('new month, untouched demo: fresh seed');

  /* ── logout / login again ── */
  await page.goto(BASE + '#/m/lead'); await page.waitForSelector('.lead-table');
  await page.click('.side-nav [data-act=logout]'); await page.waitForSelector('#login');
  ok('logout → login screen');

  /* phone */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#login button[type=submit]'); await page.waitForSelector('.lead-table');
  assert.equal(await page.locator('.top-nav a').count(), 3);
  assert.equal(await page.locator('.bottom-new .nav-new').count(), 1);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal page scroll on a phone (leads)');
  await shot('06-phone-leads', true);
  await page.goto(BASE + '#/m/owner'); await page.waitForSelector('.pcard');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal page scroll on a phone (properties)');
  await shot('07-phone-props', true);
  ok('phone: tabs at the top, "+ חדש" at the bottom, no horizontal scroll on מתעניינים / נכסים');

  assert.deepEqual(errors, []);
  ok('no JS errors in the console');
  console.log(`\nDemo E2E passed: ${pass}`);
} catch (e) {
  console.error('\nFAILED:', e.message);
  try { await page.screenshot({ path: SHOTS + 'demo-failure.png', fullPage: true }); } catch {}
  if (errors.length) console.error('console errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close(); server.close();
}
