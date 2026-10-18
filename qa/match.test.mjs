// Table tests for the matching rules (matchPair in index.html, dashboard block). Usage: node match.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const block = html.slice(html.indexOf('/* ════════════ dashboard'), html.indexOf('/* ════════════ boot'));
assert.ok(block.length > 1000, 'dashboard block found');
const opts = [
  { id: 'n-rent', match_group: 'rent' }, { id: 'n-buy', match_group: 'buy' }, { id: 'n-invest', match_group: 'invest' }, { id: 'n-let', match_group: null },
  { id: 'lp-storage', match_group: 'storage' }, { id: 'lp-land', match_group: 'land' }, { id: 'lp-none', match_group: null },
  { id: 'op-storage', match_group: 'storage' }, { id: 'op-land', match_group: 'land' }, { id: 'op-shop', match_group: 'commerce' },
];
const ctx = { has: (v) => v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v)),
  S: { data: { options: opts, lead: [], owner: [] } }, APP: { dashboard: true },
  fmt: { num: (n) => String(n), size: () => '', bi: (s) => s }, esc: (s) => s, optText: () => '', deals: () => [], todayISO: () => '2026-10-14', Math, URLSearchParams, Date, String };
vm.createContext(ctx);
vm.runInContext(block + '\nthis.matchPair = matchPair; this.cityOf = cityOf; this.listFilter = listFilter;', ctx);
// results come from another realm: copy them so deepEqual compares plain values
const plain = (x) => x == null ? x : JSON.parse(JSON.stringify(x));
const matchPair = (l, o) => plain(ctx.matchPair(l, o)), { cityOf } = ctx;

const KG = [31.61, 34.77];
const lead = (o = {}) => ({ status: 'active', need_id: 'n-rent', purpose_id: 'lp-storage', size_value: 1000, size_unit: 'sqm',
  lat: KG[0], lng: KG[1], radius_m: 5000, budget_value: 50, budget_kind: 'per_sqm', budget_currency: 'ILS', ...o });
const owner = (o = {}) => ({ status: 'active', deal_kind: 'rent', purpose_id: 'op-storage', built_sqm: 1000, plot_sqm: 2000,
  lat: KG[0], lng: KG[1], asking_price: 8000000, asking_rent: 45000, ...o });
const km = (k) => k / 111.2; // degrees of latitude per km

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

t('perfect match → high, score 100, three ok chips', () => {
  const m = matchPair(lead(), owner());
  assert.equal(m.level, 'high'); assert.equal(m.score, 100); assert.equal(m.near, false);
  assert.deepEqual(m.chips.map(c => c.t), ['בתוך האזור', 'שטח מדויק', 'בתקציב']);
});
t('gates: archived, wrong transaction, להשכיר, other group, no group → no match', () => {
  assert.equal(matchPair(lead({ status: 'closed' }), owner()), null);
  assert.equal(matchPair(lead(), owner({ status: 'irrelevant' })), null);
  assert.equal(matchPair(lead(), owner({ deal_kind: 'sale' })), null);
  assert.equal(matchPair(lead({ need_id: 'n-let' }), owner()), null);
  assert.equal(matchPair(lead(), owner({ purpose_id: 'op-shop' })), null);
  assert.equal(matchPair(lead({ purpose_id: 'lp-none' }), owner()), null);
});
t('buy and invest match sale; rent matches rent', () => {
  const sale = owner({ deal_kind: 'sale', asking_price: 5000000, asking_rent: null });
  assert.ok(matchPair(lead({ need_id: 'n-buy', budget_kind: 'total', budget_value: 5000000 }), sale));
  assert.ok(matchPair(lead({ need_id: 'n-invest', budget_kind: 'per_sqm', budget_value: 5000 }), sale));
  assert.equal(matchPair(lead({ need_id: 'n-rent' }), sale), null);
});
t('location: inside radius full; up to 1.5× = כמעט; beyond = none', () => {
  assert.equal(matchPair(lead(), owner({ lat: KG[0] + km(4.5) })).near, false);
  const n = matchPair(lead(), owner({ lat: KG[0] + km(7) }));
  assert.equal(n.near, true); assert.match(n.chips[0].t, /מחוץ לרדיוס/);
  assert.equal(matchPair(lead(), owner({ lat: KG[0] + km(8) })), null);
});
t('size: dunam ×1000; −10%…+30% full; −25%…+60% near; else none', () => {
  assert.equal(matchPair(lead({ size_value: 1, size_unit: 'dunam' }), owner()).near, false);
  assert.equal(matchPair(lead(), owner({ built_sqm: 1300, asking_rent: 45000 })).near, false);
  assert.equal(matchPair(lead(), owner({ built_sqm: 800, asking_rent: 30000 })).near, true);
  assert.equal(matchPair(lead(), owner({ built_sqm: 700, asking_rent: 20000 })), null);
  assert.equal(matchPair(lead(), owner({ built_sqm: 1700, asking_rent: 60000 })), null);
});
t('land compares plot area, not built area', () => {
  const l = lead({ need_id: 'n-buy', purpose_id: 'lp-land', size_value: 2, size_unit: 'dunam', budget_kind: 'total', budget_value: 3000000 });
  assert.ok(matchPair(l, owner({ deal_kind: 'sale', purpose_id: 'op-land', built_sqm: 10, plot_sqm: 2000, asking_price: 3000000 })));
  assert.equal(matchPair(l, owner({ deal_kind: 'sale', purpose_id: 'op-land', built_sqm: 2000, plot_sqm: 500, asking_price: 3000000 })), null);
});
t('budget: rent per m² vs asking_rent / built; total vs asking_rent; +15% near; more = none', () => {
  assert.equal(matchPair(lead({ budget_value: 45 }), owner()).chips[2].t, 'בתקציב');
  assert.equal(matchPair(lead({ budget_kind: 'total', budget_value: 45000 }), owner()).chips[2].t, 'בתקציב');
  const n = matchPair(lead({ budget_value: 40 }), owner());
  assert.equal(n.near, true); assert.match(n.chips[2].t, /מעל התקציב ב-13%/);
  assert.equal(matchPair(lead({ budget_value: 38 }), owner()), null);
});
t('sale budget: total vs asking price; per m² vs asking price / built', () => {
  const s = owner({ deal_kind: 'sale', asking_price: 6000000, asking_rent: null });
  assert.ok(matchPair(lead({ need_id: 'n-buy', budget_kind: 'total', budget_value: 6000000 }), s));
  assert.ok(matchPair(lead({ need_id: 'n-buy', budget_kind: 'per_sqm', budget_value: 6000 }), s));
  assert.equal(matchPair(lead({ need_id: 'n-buy', budget_kind: 'total', budget_value: 4000000 }), s), null);
});
t('USD budget converted at the fixed rate and stated on the chip', () => {
  const s = owner({ deal_kind: 'sale', asking_price: 3700000, asking_rent: null });
  const m = matchPair(lead({ need_id: 'n-buy', budget_kind: 'total', budget_value: 1000000, budget_currency: 'USD' }), s);
  assert.equal(m.chips[2].t, 'בתקציב (לפי $1 = ₪3.7)');
});
t('missing asking rent → warning chip, at most "טובה", never "גבוהה"', () => {
  const m = matchPair(lead(), owner({ asking_rent: null }));
  assert.equal(m.level, 'good'); assert.equal(m.score, 70);
  assert.deepEqual(m.chips[2], { t: 'חסרה שכירות מבוקשת', k: 'warn' });
});
t('two "near" dimensions → no match', () => {
  assert.equal(matchPair(lead(), owner({ lat: KG[0] + km(7), built_sqm: 800, asking_rent: 30000 })), null);
});
t('nearest city: centre, industrial edge, far away → אחר', () => {
  assert.equal(cityOf({ lat: 31.61, lng: 34.77 }), 'קריית גת');
  assert.equal(cityOf({ lat: 31.668, lng: 34.59 }), 'אשקלון');
  assert.equal(cityOf({ lat: 30.6, lng: 34.8 }), 'אחר');
});
t('list filters: unknown values ignored, group+city, urgent', () => {
  assert.equal(ctx.listFilter('lead', 'g=nope'), null);
  assert.equal(ctx.listFilter('lead', 'g=storage&a=' + encodeURIComponent('קריית גת')).label, 'אחסנה ולוגיסטיקה · קריית גת');
  assert.equal(ctx.listFilter('lead', 'u=soon').label, 'נדרש בשבוע הקרוב');
  assert.equal(ctx.listFilter('owner', 'u=soon'), null);
});
t('size range (round 2): inside the range = full; just outside = כמעט; far outside = no match', () => {
  const l = lead({ size_value: 500, size_min: 500, size_max: 1500 });
  assert.equal(matchPair(l, owner({ built_sqm: 1200, asking_rent: 50000 })).chips[1].t, 'בטווח השטח');
  assert.equal(matchPair(l, owner({ built_sqm: 1700, asking_rent: 50000 })).near, true);
  assert.equal(matchPair(l, owner({ built_sqm: 2500, asking_rent: 50000 })), null);
  assert.equal(matchPair(lead({ size_value: null, size_min: 800, size_max: null }), owner({ built_sqm: 5000, asking_rent: 1 })).chips[1].t, 'בטווח השטח');
  assert.equal(matchPair(lead({ size_value: 2, size_unit: 'dunam', size_min: 1, size_max: 2 }), owner({ built_sqm: 1500, asking_rent: 1 })).chips[1].t, 'בטווח השטח');
});
t('empty optional fields = no limit (never 0 / NaN)', () => {
  const m = matchPair(lead({ need_id: null, purpose_id: null, size_value: null, size_min: null, size_max: null, budget_value: null, lat: null, lng: null }), owner());
  assert.ok(m); assert.equal(m.score, 100);
  assert.deepEqual(m.chips.map(c => c.t), ['בלי הגבלת אזור', 'בלי הגבלת שטח', 'בלי הגבלת תקציב']);
  assert.ok(matchPair(lead({ budget_value: 50 }), owner({ deal_kind: null, asking_rent: null, asking_price: null })));
  const noSize = matchPair(lead(), owner({ built_sqm: null }));
  assert.ok(noSize && !JSON.stringify(noSize).includes('NaN'));
});
t('unknown property location / area is incomplete, never a "high" match; a lead without a radius has no distance limit', () => {
  const noPoint = matchPair(lead(), owner({ lat: null, lng: null }));
  assert.equal(noPoint.level, 'good'); assert.equal(noPoint.chips[0].t, 'מיקום הנכס לא צוין');
  const noArea = matchPair(lead(), owner({ built_sqm: null }));
  assert.notEqual(noArea.level, 'high');
  assert.equal(matchPair(lead({ radius_m: null }), owner({ lat: KG[0] + km(40) })).chips[0].t, 'בלי הגבלת אזור');
});
console.log(`\nMatch tests passed: ${pass}`);
