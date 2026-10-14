// Runs supabase/schema.sql on an in-memory Postgres (PGlite) with Supabase-like auth stubs,
// then checks RLS, atomic saves, idempotent retry and phone normalization.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8').replace('LEAH_EMAIL@example.com', 'Leah@Example.com');
const migration = readFileSync(new URL('../supabase/002_feedback.sql', import.meta.url), 'utf8').replace('LEAH_EMAIL@example.com', 'leah2@example.com');
const migration3 = readFileSync(new URL('../supabase/003_dashboard.sql', import.meta.url), 'utf8');
const LEAH = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
  insert into auth.users values ('${LEAH}', 'leah@example.com');
  insert into auth.users values ('44444444-4444-4444-8444-444444444444', 'stale-test@example.com'); -- existed before the run
`);
await db.exec(schema);
await db.exec(schema); // idempotent re-run
await db.exec(migration);
await db.exec(migration); // idempotent re-run
await db.exec(`insert into auth.users values ('${OTHER}', 'other@example.com');`); // added after: NOT a member

let pass = 0;
const ok = (name) => { pass++; console.log('  ✓', name); };

async function as(role, uid, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const q = (sql, p) => db.query(sql, p).then(r => r.rows);
const fails = async (fn, re) => {
  try { await fn(); } catch (e) { if (re) assert.match(e.message, re); return e; }
  assert.fail('expected failure');
};

// seed counts
const counts = await q(`select
  (select count(*)::int from lead_deals) l, (select count(*)::int from lead_deals where status <> 'active') la,
  (select count(*)::int from owner_deals) o, (select count(*)::int from owner_deals where status <> 'active') oa,
  (select count(*)::int from option_lists) opts, (select count(*)::int from crm_members) m`);
assert.deepEqual(counts[0], { l: 10, la: 2, o: 8, oa: 2, opts: 15, m: 1 }); ok('seed: 10 leads, 8 owners, 2+2 archived, 15 options; only Leah email is a member (stale user is not)');
const both = await q(`select count(*)::int n from contacts c where exists (select 1 from lead_deals where contact_id=c.id)
  and exists (select 1 from owner_deals where contact_id=c.id)`);
assert.equal(both[0].n, 1); ok('seed: one contact in both modules');
const two = await q(`select count(*)::int n from (select contact_id from lead_deals group by 1 having count(*) = 2) x`);
assert.equal(two[0].n, 1); ok('seed: one contact with two lead deals');
const y = await q(`select yield_pct::float y from owner_deals where id='d2000000-0000-4000-8000-000000000001'`);
assert.equal(y[0].y, 6.5); ok('yield_pct generated: 13,000×12 ÷ 2,400,000 = 6.5%');
const s = await q(`select size_sqm::int s from lead_deals where id='d1000000-0000-4000-8000-000000000004'`);
assert.equal(s[0].s, 2000); ok('size_sqm: 2 dunam → 2000');

// phone normalization
for (const [raw, out] of [['0501234567', '050-1234567'], ['+972501234567', '050-1234567'], ['00972 50-123-4567', '050-1234567'],
  ['972501234567', '050-1234567'], ['050 123 45 67', '050-1234567'], ['(054)1234567', '054-1234567']]) {
  assert.equal((await q('select normalize_phone($1) p', [raw]))[0].p, out);
}
ok('normalize_phone: plain, +972, 00972, 972, spaces, brackets');
for (const bad of ['0401234567', '05012345', '050123456789', 'abc', '']) {
  await fails(() => q('select normalize_phone($1)', [bad]), /10 ספרות/);
}
ok('normalize_phone rejects invalid numbers');

// RLS: anon
await as('anon', null, async () => {
  for (const t of ['contacts', 'lead_deals', 'owner_deals', 'option_lists', 'custom_fields', 'crm_members']) {
    await fails(() => q(`select * from ${t}`), /permission denied/);
  }
  await fails(() => q(`select save_lead_deal('{}'::jsonb)`), /permission denied/);
});
ok('anon: no access to any table or RPC');

// RLS: logged-in non-member
await as('authenticated', OTHER, async () => {
  for (const t of ['contacts', 'lead_deals', 'owner_deals', 'option_lists', 'custom_fields', 'crm_members']) {
    assert.equal((await q(`select * from ${t}`)).length, 0, t);
  }
  await fails(() => q(`insert into contacts (phone,name,entity_type) values ('050-9999999','x','private')`), /row-level security/);
  await fails(() => q(`select save_lead_deal($1::jsonb)`, [{}]), /אין הרשאה/);
  const upd = await q(`update lead_deals set status='active', closed_at=null where status <> 'active' returning id`);
  assert.equal(upd.length, 0);
});
ok('authenticated non-member: sees nothing, cannot insert, update or call RPCs');

// member
await as('authenticated', LEAH, async () => {
  assert.equal((await q('select * from lead_deals')).length, 10);
  const opt = async (k, v) => (await q('select id from option_lists where list_key=$1 and value=$2', [k, v]))[0].id;
  const need = await opt('lead_need', 'לשכור'), purpose = await opt('lead_purpose', 'מחסן');
  const ownerPurpose = await opt('owner_purpose', 'מחסן');
  const base = {
    contact: { phone: '+972 52-777-0001', name: 'בדיקה', entity_type: 'private' },
    need_id: need, purpose_id: purpose, size_value: 2, size_unit: 'dunam', lat: 31.6, lng: 34.77, radius_m: 3000,
    height_m: 8, budget_value: 40, budget_kind: 'per_sqm', needed_by: '2027-01-01', custom: {},
  };
  const id = '33333333-3333-4333-8333-333333333333';
  const r = (await q('select save_lead_deal($1::jsonb) r', [{ ...base, id }]))[0].r;
  const c = (await q('select * from contacts where id=$1', [r.contact_id]))[0];
  assert.equal(c.phone, '052-7770001');
  ok('save_lead_deal creates contact (phone normalized) + deal');

  await q('select save_lead_deal($1::jsonb)', [{ ...base, id, height_m: 9 }]);
  assert.equal((await q('select count(*)::int n from lead_deals where id=$1', [id]))[0].n, 1);
  assert.equal(Number((await q('select height_m from lead_deals where id=$1', [id]))[0].height_m), 9);
  ok('retry with the same id updates, no duplicate');

  const before = (await q('select count(*)::int n from contacts'))[0].n;
  await fails(() => q('select save_lead_deal($1::jsonb)', [{ ...base, id: null,
    contact: { phone: '0527770099', name: 'יתום', entity_type: 'private' }, need_id: purpose }]), /ערך לא תקין/);
  assert.equal((await q('select count(*)::int n from contacts'))[0].n, before);
  ok('invalid deal → contact not saved (atomic)');

  await q('select save_lead_deal($1::jsonb)', [{ ...base, id: null,
    contact: { phone: '0527770001', name: 'בדיקה מעודכן', entity_type: 'company', company_name: 'חברה' } }]);
  const c2 = (await q("select * from contacts where phone='052-7770001'"));
  assert.equal(c2.length, 1); assert.equal(c2[0].name, 'בדיקה מעודכן'); assert.equal(c2[0].company_name, 'חברה');
  ok('existing phone → same contact, name/company updated');

  await fails(() => q('select save_lead_deal($1::jsonb)', [{ ...base, id: null,
    contact: { phone: '0527770002', name: 'x', entity_type: 'company', company_name: '' } }]), /check constraint/);
  ok('company requires company name');

  const own = { contact: { phone: '0527770003', name: 'בעלים', entity_type: 'private' }, purpose_id: ownerPurpose,
    built_sqm: 500, plot_sqm: 800, lat: 31.6, lng: 34.77, address: 'כתובת', description: 'תיאור',
    deal_kind: 'rent', asking_price: 3000000, is_rented: true, monthly_rent: 16000, ai_price_per_sqm: 5000 };
  const ro = (await q('select save_owner_deal($1::jsonb) r', [own]))[0].r;
  const od = (await q('select yield_pct::float y, ai_price_per_sqm a from owner_deals where id=$1', [ro.id]))[0];
  assert.equal(od.y, 6.4); assert.equal(od.a, null);
  ok('owner rent + rented → yield 6.4%, no estimate stored for rent');
  const rs = (await q('select save_owner_deal($1::jsonb) r', [{ ...own, deal_kind: 'sale', monthly_rent: 1 }]))[0].r;
  const sd = (await q('select is_rented, monthly_rent, yield_pct, ai_price_per_sqm::int a from owner_deals where id=$1', [rs.id]))[0];
  assert.deepEqual(sd, { is_rented: null, monthly_rent: null, yield_pct: null, a: 5000 });
  ok('owner sale → rent fields cleared, estimate stored');

  const o1 = (await q(`select (add_option('lead_need','לחכור')).*`))[0];
  const o2 = (await q(`select (add_option('lead_need','לחכור')).*`))[0];
  assert.equal(o1.id, o2.id);
  ok('add_option adds once, returns existing on repeat');

  await fails(() => q(`update lead_deals set status='closed' where id=$1`, [id]), /check constraint/);
  await q(`update lead_deals set status='closed', closed_at=now() where id=$1`, [id]);
  await q(`update lead_deals set status='active', closed_at=null where id=$1`, [id]);
  ok('archive/restore keeps status and closed_at consistent');

  const del = await q('delete from lead_deals where id=$1 returning id', [id]);
  assert.equal(del.length, 0);
  ok('no hard delete (0 rows)');

  // migration 002
  const r2 = (await q('select save_lead_deal($1::jsonb) r', [{ ...base, id: null, budget_currency: 'USD', address: ' אזור התעשייה, חולון ' }]))[0].r;
  const l2 = (await q('select budget_currency, address from lead_deals where id=$1', [r2.id]))[0];
  assert.deepEqual(l2, { budget_currency: 'USD', address: 'אזור התעשייה, חולון' });
  const l3 = (await q('select budget_currency from lead_deals where id=$1', [id]))[0];
  assert.equal(l3.budget_currency, 'ILS');
  await fails(() => q('select save_lead_deal($1::jsonb)', [{ ...base, id: null, budget_currency: 'EUR' }]), /check constraint/);
  ok('002: lead address + currency (default ₪, $ allowed, other rejected)');
  const ro2 = (await q('select save_owner_deal($1::jsonb) r', [{ ...own, description: '  ' }]))[0].r;
  assert.equal((await q('select description from owner_deals where id=$1', [ro2.id]))[0].description, null);
  ok('002: owner description optional');
  const oid = (await q(`select (add_option('lead_need','לחכור')).id`))[0].id;
  await q('update option_lists set hidden = true where id=$1', [oid]);
  assert.equal((await q(`select (add_option('lead_need','לחכור')).hidden`))[0].hidden, false);
  await q('update option_lists set value = $2 where id=$1', [oid, 'לחכור לטווח ארוך']);
  await fails(() => q('update option_lists set value = $2 where id=$1', [oid, 'לשכור']), /duplicate key/);
  ok('002: rename option, hide/unhide, duplicate rename rejected');
  await fails(() => q(`insert into custom_fields (module,label,type,section) values ('lead','x','text','nowhere')`), /check constraint/);
  ok('002: custom field section validated');

  // migration 003 (dashboard): run on a DB that already has data, while an old client keeps saving
  await db.exec('reset role;'); await db.exec(migration3); await db.exec(migration3);
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${LEAH}', false); set role authenticated;`);
  const groups = await q(`select list_key, value, match_group from option_lists where value in ('לשכור','להשכיר','מרלוג','פרטי','חנות') order by list_key, value`);
  assert.deepEqual(groups.map(g => [g.value, g.match_group]), [['להשכיר', null], ['לשכור', 'rent'], ['מרלוג', 'storage'], ['פרטי', 'land'], ['חנות', 'commerce']]);
  ok('003: default match groups; להשכיר stays out of matching');
  const rent = { ...own, id: null, deal_kind: 'rent', is_rented: false, monthly_rent: null };
  const oldRow = (await q('select save_owner_deal($1::jsonb) r', [rent]))[0].r;
  assert.equal((await q('select asking_rent from owner_deals where id=$1', [oldRow.id]))[0].asking_rent, null);
  const newRow = (await q('select save_owner_deal($1::jsonb) r', [{ ...rent, id: oldRow.id, asking_rent: 42000 }]))[0].r;
  assert.equal(+(await q('select asking_rent from owner_deals where id=$1', [newRow.id]))[0].asking_rent, 42000);
  await q('select save_owner_deal($1::jsonb) r', [{ ...rent, id: oldRow.id, description: 'עדכון מלקוח ישן' }]);
  assert.equal(+(await q('select asking_rent from owner_deals where id=$1', [oldRow.id]))[0].asking_rent, 42000);
  await q('select save_owner_deal($1::jsonb) r', [{ ...rent, id: oldRow.id, deal_kind: 'sale', is_rented: null }]);
  assert.equal((await q('select asking_rent from owner_deals where id=$1', [oldRow.id]))[0].asking_rent, null);
  const saleWithRent = (await q('select save_owner_deal($1::jsonb) r', [{ ...own, id: null, deal_kind: 'sale', asking_rent: 5000 }]))[0].r;
  assert.equal((await q('select asking_rent from owner_deals where id=$1', [saleWithRent.id]))[0].asking_rent, null);
  ok('003: old payload (no asking_rent) still saves and never wipes it; new payload sets it; sale clears it');
  const sig = await q(`select count(*)::int n from pg_proc where proname = 'save_owner_deal'`);
  assert.equal(sig[0].n, 1);
  ok('003: one save_owner_deal(jsonb) – no overload');

  const cf = (await q(`insert into custom_fields (module,label,type) values ('lead','קומה','number') returning key`))[0];
  assert.match(cf.key, /^f_[0-9a-f]{10}$/);
  ok('custom field gets a generated key');
});

console.log(`\nDB tests passed: ${pass}`);
