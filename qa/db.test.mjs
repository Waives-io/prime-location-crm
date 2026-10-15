// Runs supabase/schema.sql on an in-memory Postgres (PGlite) with Supabase-like auth stubs,
// then checks RLS, atomic saves, idempotent retry and phone normalization.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8').replace('LEAH_EMAIL@example.com', 'Leah@Example.com');
const migration = readFileSync(new URL('../supabase/002_feedback.sql', import.meta.url), 'utf8').replace('LEAH_EMAIL@example.com', 'leah2@example.com');
const photosSql = readFileSync(new URL('../supabase/004_photos.sql', import.meta.url), 'utf8');
const round2Sql = readFileSync(new URL('../supabase/005_round2.sql', import.meta.url), 'utf8');
const removeSql = readFileSync(new URL('../supabase/006_field_remove.sql', import.meta.url), 'utf8');
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
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
  insert into auth.users values ('${LEAH}', 'leah@example.com');
  insert into auth.users values ('44444444-4444-4444-8444-444444444444', 'stale-test@example.com'); -- existed before the run
`);
await db.exec(schema);
await db.exec(schema); // idempotent re-run
await db.exec(migration);
await db.exec(migration); // idempotent re-run
await db.exec(photosSql);
await db.exec(photosSql); // idempotent re-run
await db.exec(round2Sql);
await db.exec(round2Sql); // idempotent re-run
await db.exec(removeSql); await db.exec(removeSql);
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
  const rs = (await q('select save_owner_deal($1::jsonb) r', [{ ...own, deal_kind: 'sale', is_rented: false, monthly_rent: 1 }]))[0].r;
  const sd = (await q('select is_rented, monthly_rent, yield_pct, ai_price_per_sqm::int a from owner_deals where id=$1', [rs.id]))[0];
  assert.deepEqual(sd, { is_rented: false, monthly_rent: null, yield_pct: null, a: 5000 });
  ok('owner sale, not rented → no rent, estimate stored');
  const rs2 = (await q('select save_owner_deal($1::jsonb) r', [{ ...own, contact: { ...own.contact, phone: '0527770004' }, deal_kind: 'sale', is_rented: true, monthly_rent: 16000 }]))[0].r;
  const sd2 = (await q('select is_rented, monthly_rent::int m, yield_pct::float y from owner_deals where id=$1', [rs2.id]))[0];
  assert.deepEqual(sd2, { is_rented: true, m: 16000, y: 6.4 });
  ok('005: sale + rented → monthly rent kept and yield computed');

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

  const cf = (await q(`insert into custom_fields (module,label,type) values ('lead','קומה','number') returning key`))[0];
  assert.match(cf.key, /^f_[0-9a-f]{10}$/);
  ok('custom field gets a generated key');

  // 004 photos
  const did = id, ph = (n) => ({ path: `${did}/0000000${n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`, thumb: `${did}/0000000${n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa_t.jpg`, w: 1600, h: 1200 });
  const r1 = (await q('select set_deal_photos($1,$2,$3::jsonb) r', ['lead', did, JSON.stringify([ph(1), ph(2)])]))[0].r;
  assert.deepEqual(r1.previous, []);
  assert.equal((await q('select jsonb_array_length(photos) n from lead_deals where id=$1', [did]))[0].n, 2);
  await q('select save_lead_deal($1::jsonb)', [{ ...base, id: did, height_m: 10 }]);
  assert.equal((await q('select jsonb_array_length(photos) n from lead_deals where id=$1', [did]))[0].n, 2);
  ok('004: photos saved by their own RPC; a normal deal save (old app) keeps them');
  await fails(() => q('select set_deal_photos($1,$2,$3::jsonb)', ['lead', did, JSON.stringify([1,2,3,4,5,6].map(ph))]), /עד 5/);
  await fails(() => q('select set_deal_photos($1,$2,$3::jsonb)', ['lead', did, JSON.stringify([{ path: 'other/x.jpg', thumb: 'other/x_t.jpg' }])]), /נתיב/);
  await fails(() => q('select set_deal_photos($1,$2,$3::jsonb)', ['lead', did, JSON.stringify([{ path: `${did}/../x.jpg`, thumb: `${did}/x_t.jpg` }])]), /נתיב/);
  await fails(() => q('select set_deal_photos($1,$2,$3::jsonb)', ['owner', did, '[]']), /לא נמצאה/);
  ok('004: max 5 photos, paths must sit under this deal id, wrong module rejected');
  await q(`insert into storage.objects (bucket_id, name) values ('deal-photos', $1)`, [ph(1).path]);
  assert.equal((await q(`select count(*)::int n from storage.objects where bucket_id='deal-photos'`))[0].n, 1);
  ok('004: member can upload and see photos in the private bucket');
  await q('select set_deal_photos($1,$2,$3::jsonb)', ['lead', did, JSON.stringify([{ ...ph(1), local: '"><img src=x onerror=alert(1)>', w: '1600' }])]);
  assert.deepEqual((await q('select photos from lead_deals where id=$1', [did]))[0].photos, [{ kind: 'image', path: ph(1).path, thumb: ph(1).thumb, w: 1600, h: 1200 }]);
  ok('004: only path/thumb/w/h are stored (extra fields like an HTML payload are dropped)');
  assert.equal((await q('delete from storage.objects where name=$1 returning id', [ph(1).path])).length, 0);
  await q('select set_deal_photos($1,$2,$3::jsonb)', ['lead', did, '[]']);
  assert.equal((await q('delete from storage.objects where name=$1 returning id', [ph(1).path])).length, 1);
  ok('004: a file still used by a deal cannot be deleted; once unused it can');
});

await as('authenticated', OTHER, async () => {
  assert.equal((await q(`select * from storage.objects`)).length, 0);
  await fails(() => q(`insert into storage.objects (bucket_id, name) values ('deal-photos', 'x/y.jpg')`), /row-level security/);
  await fails(() => q(`select set_deal_photos('lead', '33333333-3333-4333-8333-333333333333', '[]'::jsonb)`), /אין הרשאה/);
  assert.equal((await q(`delete from storage.objects returning id`)).length, 0);
});
await as('anon', null, async () => {
  assert.equal((await q(`select * from storage.objects`)).length, 0);
  await fails(() => q(`insert into storage.objects (bucket_id, name) values ('deal-photos', 'x/y.jpg')`), /row-level security/);
  await fails(() => q(`select set_deal_photos('lead', '33333333-3333-4333-8333-333333333333', '[]'::jsonb)`), /permission denied/);
});
ok('004: anon and logged-in non-members cannot see, upload, delete photos or call set_deal_photos');

// ───────── 005 round 2 ─────────
await as('authenticated', LEAH, async () => {
  const r = (await q('select save_lead_deal($1::jsonb) r', [{ contact: { phone: '0529990001', name: 'רק שם וטלפון', entity_type: 'private' } }]))[0].r;
  const l = (await q('select need_id, size_min, lat, needed_by, size_unit from lead_deals where id=$1', [r.id]))[0];
  assert.deepEqual(l, { need_id: null, size_min: null, lat: null, needed_by: null, size_unit: 'sqm' });
  const o = (await q('select save_owner_deal($1::jsonb) r', [{ contact: { phone: '0529990002', name: 'בעלים בלבד', entity_type: 'private' } }]))[0].r;
  const od = (await q('select purpose_id, deal_kind, asking_price, yield_pct from owner_deals where id=$1', [o.id]))[0];
  assert.deepEqual(od, { purpose_id: null, deal_kind: null, asking_price: null, yield_pct: null });
  await fails(() => q('select save_lead_deal($1::jsonb)', [{ contact: { phone: '0529990003', name: '  ', entity_type: 'private' } }]), /check constraint/);
  await fails(() => q('select save_lead_deal($1::jsonb)', [{ contact: { phone: '123', name: 'x', entity_type: 'private' } }]), /10 ספרות/);
  ok('005: a deal saves with phone + name only (lead and owner); phone and name still required');

  const b = (await q('select save_lead_deal($1::jsonb) r', [{ contact: { phone: '0529990004', name: 'דני מתווך', entity_type: 'broker', broker_license: ' 12345 ' } }]))[0].r;
  assert.deepEqual((await q('select entity_type, broker_license, company_name from contacts where id=$1', [b.contact_id]))[0], { entity_type: 'broker', broker_license: '12345', company_name: null });
  const cpy = (await q('select save_lead_deal($1::jsonb) r', [{ contact: { phone: '0529990005', name: 'רוני', entity_type: 'company', company_name: 'חברה בע"מ', company_number: '515555555' } }]))[0].r;
  await q('select save_lead_deal($1::jsonb)', [{ contact: { phone: '0529990005', name: 'רוני', entity_type: 'company', company_name: 'חברה בע"מ' } }]); // older client: no company_number key
  assert.equal((await q('select company_number from contacts where id=$1', [cpy.contact_id]))[0].company_number, '515555555');
  await fails(() => q('select save_lead_deal($1::jsonb)', [{ contact: { phone: '0529990006', name: 'x', entity_type: 'company', company_name: '' } }]), /check constraint/);
  ok('005: broker with optional licence; company name required, ח.פ. optional and kept when an older app saves');

  const rid = '55555555-5555-4555-8555-555555555555';
  await q('select save_lead_deal($1::jsonb)', [{ id: rid, contact: { phone: '0529990007', name: 'טווח', entity_type: 'private' }, size_min: 500, size_max: 800, size_unit: 'sqm' }]);
  await q('select save_lead_deal($1::jsonb)', [{ id: rid, contact: { phone: '0529990007', name: 'טווח', entity_type: 'private' }, size_value: 500, size_unit: 'sqm' }]); // older client
  assert.deepEqual((await q('select size_min::int a, size_max::int b, size_value::int v from lead_deals where id=$1', [rid]))[0], { a: 500, b: 800, v: 500 });
  await q('select save_lead_deal($1::jsonb)', [{ id: rid, contact: { phone: '0529990007', name: 'טווח', entity_type: 'private' }, size_min: 2, size_max: null, size_unit: 'dunam' }]);
  assert.deepEqual((await q('select size_min_sqm::int a, size_max_sqm b from lead_deals where id=$1', [rid]))[0], { a: 2000, b: null });
  for (const bad of [{ size_min: -1 }, { size_min: 0 }, { size_min: 900, size_max: 800 }]) {
    await fails(() => q('select save_lead_deal($1::jsonb)', [{ id: rid, contact: { phone: '0529990007', name: 'טווח', entity_type: 'private' }, ...bad }]), /check constraint/);
  }
  const old = (await q(`select size_min::int a, size_max::int b from lead_deals where id='d1000000-0000-4000-8000-000000000004'`))[0];
  assert.deepEqual(old, { a: 2, b: 2 });
  ok('005: size range (one side is enough, dunam → m²); an older app never collapses a range; no negative / zero / reversed; old rows backfilled');

  await q('select save_owner_deal($1::jsonb)', [{ id: o.id, contact: { phone: '0529990002', name: 'בעלים בלבד', entity_type: 'private' }, notes: 'הערה' }]);
  await q('select save_owner_deal($1::jsonb)', [{ id: o.id, contact: { phone: '0529990002', name: 'בעלים בלבד', entity_type: 'private' } }]); // older client
  assert.equal((await q('select notes from owner_deals where id=$1', [o.id]))[0].notes, 'הערה');
  ok('005: owner notes; kept when an older app saves');

  const vid = { kind: 'video', path: `${o.id}/0000000a-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp4`, thumb: `${o.id}/0000000a-aaaa-4aaa-8aaa-aaaaaaaaaaaa_t.jpg`, w: 1920, h: 1080 };
  const img = { path: `${o.id}/0000000b-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`, thumb: `${o.id}/0000000b-aaaa-4aaa-8aaa-aaaaaaaaaaaa_t.jpg`, w: 10, h: 10 };
  await q('select set_deal_photos($1,$2,$3::jsonb)', ['owner', o.id, JSON.stringify([vid, img])]);
  assert.deepEqual((await q('select photos from owner_deals where id=$1', [o.id]))[0].photos.map(x => x.kind), ['video', 'image']);
  await fails(() => q('select set_deal_photos($1,$2,$3::jsonb)', ['owner', o.id, JSON.stringify([{ ...img, kind: 'video' }])]), /נתיב/);
  ok('005: media items carry a kind; video paths accepted by the RPC (uploads stay image-only until the bucket allows video)');
});

// ───────── 005: older app versions never destroy round-2 data ─────────
await as('authenticated', LEAH, async () => {
  const C = (phone, extra = {}) => ({ phone, name: 'בדיקת גרסה', entity_type: 'private', ...extra });
  const oid1 = '66666666-6666-4666-8666-666666666661';
  await q('select save_lead_deal($1::jsonb)', [{ v: 2, id: oid1, contact: { v: 2, ...C('0528880001') }, size_min: 500, size_max: null, size_unit: 'sqm' }]);
  await q('select save_lead_deal($1::jsonb)', [{ id: oid1, contact: C('0528880001'), size_value: 500, size_unit: 'sqm' }]); // older app
  assert.deepEqual((await q('select size_min::int a, size_max b from lead_deals where id=$1', [oid1]))[0], { a: 500, b: null });
  ok('005: an older app keeps a one-sided range ("מ־500") as it is');

  const oid2 = '66666666-6666-4666-8666-666666666662';
  await q('select save_owner_deal($1::jsonb)', [{ v: 2, id: oid2, contact: { v: 2, ...C('0528880002') }, deal_kind: 'sale', asking_price: 3000000, is_rented: true, monthly_rent: 15000 }]);
  await q('select save_owner_deal($1::jsonb)', [{ id: oid2, contact: C('0528880002'), deal_kind: 'sale', asking_price: 3000000, is_rented: null, monthly_rent: null }]); // older app
  assert.deepEqual((await q('select is_rented, monthly_rent::int m, yield_pct::float y from owner_deals where id=$1', [oid2]))[0], { is_rented: true, m: 15000, y: 6 });
  await q('select save_owner_deal($1::jsonb)', [{ v: 2, id: oid2, contact: { v: 2, ...C('0528880002') }, deal_kind: 'sale', asking_price: 3000000, is_rented: false }]);
  assert.deepEqual((await q('select is_rented, monthly_rent from owner_deals where id=$1', [oid2]))[0], { is_rented: false, monthly_rent: null });
  ok('005: an older app keeps rent + yield of a sale; the new app can still change them');

  await q('select save_lead_deal($1::jsonb)', [{ v: 2, contact: { v: 2, ...C('0528880003', { entity_type: 'broker', broker_license: '777' }) } }]);
  await q('select save_lead_deal($1::jsonb)', [{ contact: C('0528880003', { entity_type: '' }) }]); // older app: no broker choice
  assert.deepEqual((await q(`select entity_type, broker_license from contacts where phone='052-8880003'`))[0], { entity_type: 'broker', broker_license: '777' });
  await q('select save_lead_deal($1::jsonb)', [{ v: 2, contact: { v: 2, ...C('0528880003') } }]); // new app: broker → private on purpose
  assert.deepEqual((await q(`select entity_type, broker_license from contacts where phone='052-8880003'`))[0], { entity_type: 'private', broker_license: null });
  ok('005: an older app keeps a broker a broker (and the licence); the new app can still change it');
});

// ───────── 005 on a database whose constraints have other names ─────────
{
  const db2 = new PGlite();
  await db2.exec(`
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin; create role authenticated nologin;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);`);
  await db2.exec(schema); await db2.exec(migration); await db2.exec(photosSql);
  const cons = (await db2.query(`select conname, conrelid::regclass::text t from pg_constraint where contype='c' and conrelid in ('public.contacts'::regclass, 'public.owner_deals'::regclass)`)).rows;
  let k = 0;
  for (const c of cons) await db2.exec(`alter table ${c.t} rename constraint "${c.conname}" to "renamed_${k++}"`);
  await db2.exec(round2Sql);
  await db2.exec(`insert into public.contacts (phone, name, entity_type) values ('050-7770001', 'מתווך', 'broker')`);
  await assert.rejects(db2.exec(`insert into public.contacts (phone, name, entity_type) values ('050-7770002', 'x', 'company')`), /check constraint/);
  await db2.exec(`insert into public.owner_deals (contact_id, deal_kind, is_rented, monthly_rent) select id, 'sale', true, 9000 from public.contacts where phone='050-7770001'`);
  await assert.rejects(db2.exec(`insert into public.owner_deals (contact_id, is_rented, monthly_rent) select id, false, 9000 from public.contacts where phone='050-7770001'`), /check constraint/);
  ok('005 on a copy where every check constraint has another name: old rules replaced, new rules active');
}

await as('authenticated', LEAH, async () => {
  const f = (await q("insert into custom_fields (module,label,type) values ('owner','ח.פ','text') returning id"))[0];
  await q('update custom_fields set hidden = true where id=$1', [f.id]);
  assert.equal((await q('select hidden from custom_fields where id=$1', [f.id]))[0].hidden, true);
});
await as('authenticated', OTHER, async () => {
  assert.equal((await q("update custom_fields set hidden = false returning id")).length, 0);
});
ok('006: a member can remove (hide) an added field; a non-member cannot touch fields');
console.log(`\nDB tests passed: ${pass}`);
