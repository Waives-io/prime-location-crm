// Unit tests of the match engine (match.js). Usage: node match.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const Match = createRequire(import.meta.url)('../match.js');

let pass = 0;
const ok = (n) => { pass++; console.log('  ✓', n); };
const T = { n1: 'לשכור', n2: 'לקנות', n3: 'להשקעה', n4: 'להשכיר', lp1: 'מחסן', lp2: 'מסחר / חנות', lp3: 'משרדים', op1: 'מחסן', op2: 'חנות', op3: 'תעשייה',
  c1: 'רכב', c2: 'אופנה', c3: 'בנקים' };
const text = (id) => T[id] || '';
const S = Match.DEFAULTS;
const lead = (x = {}) => ({ id: 'L', need_ids: ['n1'], purpose_ids: ['lp1'], category_ids: ['c1'], size_min: 400, size_max: 600, size_unit: 'sqm',
  lat: 31.6, lng: 34.77, radius_m: 5000, budget_value: 3000000, budget_kind: 'total', budget_currency: 'ILS', ...x });
const owner = (x = {}) => ({ id: 'O', deal_kind: 'rent', purpose_id: 'op1', category_ids: ['c1'], built_sqm: 500, plot_sqm: 800, lat: 31.61, lng: 34.775, asking_price: 25000, ...x });

try {
  // perfect rent match: budget unknown for rent (asked Leah), everything else 1 → 100, partial
  let r = Match.score(lead(), owner(), S, text);
  assert.equal(r.status, 'ok'); assert.equal(r.score, 100); assert.equal(r.partial, true);
  assert.equal(r.parts.find(p => p.key === 'budget').value, null);
  assert.equal(r.reasons.length, 3); assert.ok(r.reasons.every(x => x.startsWith('✓')));
  ok('rent, same category / purpose / area / size → 100, budget left out ("מידע חלקי")');

  r = Match.score(lead(), owner({ deal_kind: 'sale', asking_price: 2800000 }), S, text);
  assert.equal(r.status, 'blocked');
  r = Match.score(lead({ need_ids: ['n1', 'n3'] }), owner({ deal_kind: 'sale', asking_price: 2800000 }), S, text);
  assert.equal(r.status, 'ok'); assert.equal(r.score, 100); assert.equal(r.partial, false); // height has weight 0, all others known
  ok('deal type is a gate: rent lead never sees a sale; a lead with "להשקעה" too does');

  r = Match.score(lead({ need_ids: ['n4'] }), owner(), S, text);
  assert.equal(r.status, 'missing'); assert.deepEqual(r.missing, ['סוג עסקה']);
  r = Match.score(lead(), owner({ deal_kind: null }), S, text);
  assert.equal(r.status, 'missing');
  r = Match.score(lead({ need_ids: ['n4'] }), owner(), { ...S, must: { ...S.must, deal_type: false } }, text);
  assert.equal(r.status, 'ok');
  ok('unknown deal type on either side → "חסרים פרטים" (never silently passed); with the must off → scored');

  // budget (sale)
  const sale = (price, x = {}) => Match.score(lead({ need_ids: ['n2'], ...x }), owner({ deal_kind: 'sale', asking_price: price }), S, text).parts.find(p => p.key === 'budget');
  assert.equal(sale(3000000).value, 1); assert.equal(sale(3450000).value, 0.5); assert.equal(sale(4000000).value, 0);
  assert.match(sale(3450000).why, /15%/);
  assert.equal(sale(3000000, { budget_kind: 'per_sqm', budget_value: 6000 }).value, 1);            // 3M / 500 = 6000/sqm
  assert.equal(sale(3000000, { budget_kind: 'per_sqm', budget_value: 5000 }).value, 0.333);
  assert.equal(sale(3000000, { budget_currency: 'USD' }).value, null);
  ok('budget: sale only; total and per sqm; 15% over → half; USD left out');

  // size
  const size = (x, o = {}) => Match.score(lead(x), owner(o), S, text).parts.find(p => p.key === 'size');
  assert.equal(size({}, { built_sqm: 450 }).value, 1);
  assert.equal(size({}, { built_sqm: 340 }).value, 0.625);          // 15% small → 1 − 0.15 × 2.5
  assert.equal(size({}, { built_sqm: 320 }).value, 0.5);            // 20% small → half
  assert.equal(size({ size_min: null, size_max: 300 }, { built_sqm: 500 }).value, 0);
  assert.equal(size({ size_unit: 'dunam', size_min: 0.5, size_max: 1 }, { built_sqm: 50, plot_sqm: 800 }).value, 1);   // dunam ↔ plot
  assert.equal(size({ size_unit: 'dunam', size_min: 1, size_max: 2 }, { plot_sqm: null }).value, null);
  ok('size: like for like (מ״ר ↔ בנוי, דונם ↔ מגרש), 20% off → half, 40% off → 0, missing → unknown');

  // area
  const area = (o, x = {}) => Match.score(lead(x), owner(o), S, text).parts.find(p => p.key === 'area');
  assert.equal(area({}).value, 1);
  const far = area({ lat: 31.6 + 7.5 / 111.2, lng: 34.77 });
  assert.ok(far.value > 0.45 && far.value < 0.55, String(far.value)); assert.match(far.why, /מחוץ לאזור/);
  assert.equal(area({ lat: null }).value, null); assert.equal(area({}, { radius_m: 0 }).value, null);
  ok('area: inside the radius → 1, at 1.5× radius ≈ half, no coordinates / radius 0 → unknown');

  // category + purpose
  const cat = (lc, oc) => Match.score(lead({ category_ids: lc }), owner({ category_ids: oc }), S, text).parts.find(p => p.key === 'category');
  assert.equal(cat(['c1', 'c2'], ['c1']).value, 0.5); assert.equal(cat(['c1'], ['c2']).value, 0); assert.equal(cat([], ['c1']).value, null);
  const purp = (lp, op) => Match.score(lead({ purpose_ids: lp }), owner({ purpose_id: op }), S, text).parts.find(p => p.key === 'purpose');
  assert.equal(purp(['lp2'], 'op2').value, 1); assert.equal(purp(['lp3'], 'op1').value, 0); assert.equal(purp(['lp3', 'lp1'], 'op1').value, 1);
  ok('category: share of the lead\'s categories; purpose: shared word ("מסחר / חנות" ↔ "חנות"), any of several purposes');

  // must conditions + coverage
  const mustCat = { ...S, must: { ...S.must, category: true } };
  assert.equal(Match.score(lead({ category_ids: ['c2'] }), owner(), mustCat, text).status, 'blocked');
  assert.deepEqual(Match.score(lead({ category_ids: [] }), owner(), mustCat, text).missing, ['קטגוריה']);
  r = Match.score(lead({ category_ids: [], purpose_ids: [], lat: null }), owner(), S, text);   // known: size 15 of 100
  assert.equal(r.status, 'missing'); assert.ok(r.missing.includes('קטגוריה') && r.missing.includes('אזור'));
  ok('a must that fails hides the pair; missing data for a must → "חסרים פרטים"; under half the weight known → "חסרים פרטים"');

  // settings
  assert.deepEqual(Match.settingsOf(null), { version: 1, weights: S.weights, must: S.must });
  assert.deepEqual(Match.settingsOf({ weights: { category: 90 } }).weights, S.weights);   // broken sum → defaults
  const w = { category: 50, area: 50, purpose: 0, size: 0, budget: 0, height: 0 };
  r = Match.score(lead({ category_ids: ['c1', 'c2'] }), owner(), { version: 1, weights: w, must: S.must }, text);
  assert.equal(r.score, 75);
  ok('settings: missing / broken values fall back to defaults; weights change the score (50/50 → 75)');

  // all(): sorting + dismissed
  const owners = [owner({ id: 'A' }), owner({ id: 'B', category_ids: ['c2'] }), owner({ id: 'C', deal_kind: 'sale' })];
  const list = Match.all([lead()], owners, S, text);
  assert.deepEqual(list.map(x => x.owner.id), ['A', 'B']);
  assert.deepEqual(Match.all([lead()], owners, S, text, { dismissed: new Set(['L|A']) }).map(x => x.owner.id), ['B']);
  assert.deepEqual(Match.all([lead()], owners, S, text, { dismissed: new Set(['L|A']), showDismissed: true }).map(x => x.owner.id), ['A']);
  const gone = Match.all([lead()], owners, S, text, { dismissed: new Set(['L|C']), showDismissed: true });   // C is now blocked
  assert.deepEqual([gone[0].owner.id, gone[0].score], ['C', null]); assert.match(gone[0].reasons[0], /תנאי חובה/);
  ok('all pairs: blocked left out, best first; dismissed hidden, listed in "נדחו" (even when it no longer scores)');

  console.log(`\nMatch engine passed: ${pass}`);
} catch (e) { console.error('\n✗ FAILED:', e.message); process.exitCode = 1; }
