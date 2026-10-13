-- Prime Location CRM – phase 1 schema
-- Run in Supabase → SQL Editor → Run. Safe to re-run (idempotent).
-- Create Leah's user (Authentication → Users) BEFORE running; the last block adds ONLY her email to crm_members.

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- 05XXXXXXXX / +972-5X... / 00972 5X... → 05X-XXXXXXX, or raises
create or replace function public.normalize_phone(raw text) returns text
language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(raw, ''), '[\s\-\(\)\.]', '', 'g');
begin
  d := regexp_replace(d, '^\+', '');
  if d ~ '^00972' then d := '0' || substr(d, 6);
  elsif d ~ '^972' then d := '0' || substr(d, 4);
  end if;
  if d !~ '^05[0-9]{8}$' then
    raise exception 'מספר נייד צריך להכיל 10 ספרות ולהתחיל ב-05' using errcode = '22023';
  end if;
  return substr(d, 1, 3) || '-' || substr(d, 4);
end $$;

-- ───────────────────────── tables ─────────────────────────
create table if not exists public.crm_members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.crm_members where user_id = auth.uid());
$$;

create table if not exists public.option_lists (
  id          uuid primary key default gen_random_uuid(),
  list_key    text not null check (list_key in ('lead_need', 'lead_purpose', 'owner_purpose')),
  value       text not null check (length(btrim(value)) > 0),
  sort        int  not null default 0,
  match_group text,                       -- phase 2: maps lead purposes ↔ owner purposes
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (list_key, value)
);

create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null unique check (phone ~ '^05[0-9]-[0-9]{7}$'),
  name         text not null check (length(btrim(name)) > 0),
  entity_type  text not null check (entity_type in ('company', 'private')),
  company_name text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (entity_type = 'private' or length(btrim(coalesce(company_name, ''))) > 0)
);

create table if not exists public.lead_deals (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid not null references public.contacts(id),
  lead_date    date not null default current_date,
  need_id      uuid not null references public.option_lists(id),
  purpose_id   uuid not null references public.option_lists(id),
  size_value   numeric not null check (size_value > 0),
  size_unit    text not null check (size_unit in ('sqm', 'dunam')),
  size_sqm     numeric generated always as
                 (case when size_unit = 'dunam' then size_value * 1000 else size_value end) stored,
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  radius_m     int not null check (radius_m between 500 and 20000),
  height_m     numeric not null check (height_m > 0),
  notes        text,
  budget_value numeric not null check (budget_value > 0),
  budget_kind  text not null check (budget_kind in ('total', 'per_sqm')),
  needed_by    date not null,
  status       text not null default 'active' check (status in ('active', 'closed', 'irrelevant')),
  closed_at    timestamptz,
  custom       jsonb not null default '{}'::jsonb check (jsonb_typeof(custom) = 'object'),
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((status = 'active') = (closed_at is null))
);

create table if not exists public.owner_deals (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid not null references public.contacts(id),
  purpose_id       uuid not null references public.option_lists(id),
  built_sqm        numeric not null check (built_sqm > 0),
  plot_sqm         numeric not null check (plot_sqm > 0),
  lat              double precision not null check (lat between -90 and 90),
  lng              double precision not null check (lng between -180 and 180),
  address          text not null check (length(btrim(address)) > 0),
  description      text not null check (length(btrim(description)) > 0),
  deal_kind        text not null check (deal_kind in ('rent', 'sale')),
  asking_price     numeric not null check (asking_price > 0),
  is_rented        boolean,
  monthly_rent     numeric check (monthly_rent > 0),
  yield_pct        numeric generated always as
                     (case when monthly_rent is not null
                           then round(monthly_rent * 12 / asking_price * 100, 2) end) stored,
  ai_price_per_sqm numeric check (ai_price_per_sqm > 0),
  status           text not null default 'active' check (status in ('active', 'closed', 'irrelevant')),
  closed_at        timestamptz,
  custom           jsonb not null default '{}'::jsonb check (jsonb_typeof(custom) = 'object'),
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((status = 'active') = (closed_at is null)),
  check ((deal_kind = 'rent') = (is_rented is not null)),
  check ((is_rented is true) = (monthly_rent is not null)),
  check (deal_kind = 'sale' or ai_price_per_sqm is null)
);

create table if not exists public.custom_fields (
  id         uuid primary key default gen_random_uuid(),
  module     text not null check (module in ('lead', 'owner')),
  key        text not null default ('f_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  label      text not null check (length(btrim(label)) > 0),
  type       text not null check (type in ('text', 'number', 'date', 'list')),
  options    jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  sort       int not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module, key),
  check (type <> 'list' or jsonb_array_length(options) > 0)
);

-- ───────────────────────── indexes & triggers ─────────────────────────
create index if not exists lead_deals_contact_idx  on public.lead_deals (contact_id);
create index if not exists lead_deals_status_idx   on public.lead_deals (status);
create index if not exists owner_deals_contact_idx on public.owner_deals (contact_id);
create index if not exists owner_deals_status_idx  on public.owner_deals (status);
-- contacts.phone is indexed by its UNIQUE constraint

do $$
declare t text;
begin
  foreach t in array array['option_lists', 'contacts', 'lead_deals', 'owner_deals', 'custom_fields'] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ───────────────────────── row level security ─────────────────────────
-- Only users listed in crm_members see or change anything. anon gets nothing.
-- No DELETE policies: phase 1 has no hard delete.
alter table public.crm_members   enable row level security;
alter table public.option_lists  enable row level security;
alter table public.contacts      enable row level security;
alter table public.lead_deals    enable row level security;
alter table public.owner_deals   enable row level security;
alter table public.custom_fields enable row level security;

revoke all on public.crm_members, public.option_lists, public.contacts,
              public.lead_deals, public.owner_deals, public.custom_fields from anon;

drop policy if exists members_self on public.crm_members;
create policy members_self on public.crm_members for select to authenticated
  using (user_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['option_lists', 'contacts', 'lead_deals', 'owner_deals', 'custom_fields'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_member())', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.is_member())', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated
                    using (public.is_member()) with check (public.is_member())', t, t);
  end loop;
end $$;

-- ───────────────────────── RPCs (atomic saves) ─────────────────────────
create or replace function public.assert_option(opt uuid, expected_key text) returns uuid
language plpgsql stable set search_path = public as $$
begin
  if opt is null or not exists (select 1 from option_lists where id = opt and list_key = expected_key) then
    raise exception 'ערך לא תקין ברשימה %', expected_key using errcode = '22023';
  end if;
  return opt;
end $$;

-- Upsert the contact by phone. Editing the name here updates the contact for all its deals.
create or replace function public.upsert_contact(c jsonb) returns uuid
language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  insert into contacts (phone, name, entity_type, company_name)
  values (normalize_phone(c->>'phone'),
          btrim(c->>'name'),
          c->>'entity_type',
          case when c->>'entity_type' = 'company' then nullif(btrim(c->>'company_name'), '') end)
  on conflict (phone) do update
    set name = excluded.name, entity_type = excluded.entity_type, company_name = excluded.company_name
  returning id into v_id;
  return v_id;
end $$;

-- p.id is created by the client, so a retry after a timeout updates the same row (no duplicate).
-- Status is never changed here (see close/restore in the app).
create or replace function public.save_lead_deal(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare v_contact uuid; v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  v_contact := upsert_contact(p->'contact');
  insert into lead_deals (id, contact_id, lead_date, need_id, purpose_id, size_value, size_unit,
                          lat, lng, radius_m, height_m, notes, budget_value, budget_kind, needed_by, custom)
  values (v_id, v_contact,
          coalesce(nullif(p->>'lead_date', '')::date, current_date),
          assert_option(nullif(p->>'need_id', '')::uuid, 'lead_need'),
          assert_option(nullif(p->>'purpose_id', '')::uuid, 'lead_purpose'),
          (p->>'size_value')::numeric, p->>'size_unit',
          (p->>'lat')::float8, (p->>'lng')::float8, (p->>'radius_m')::int, (p->>'height_m')::numeric,
          nullif(btrim(coalesce(p->>'notes', '')), ''),
          (p->>'budget_value')::numeric, p->>'budget_kind',
          (p->>'needed_by')::date,
          coalesce(p->'custom', '{}'::jsonb))
  on conflict (id) do update set
    contact_id = excluded.contact_id, lead_date = excluded.lead_date, need_id = excluded.need_id,
    purpose_id = excluded.purpose_id, size_value = excluded.size_value, size_unit = excluded.size_unit,
    lat = excluded.lat, lng = excluded.lng, radius_m = excluded.radius_m, height_m = excluded.height_m,
    notes = excluded.notes, budget_value = excluded.budget_value, budget_kind = excluded.budget_kind,
    needed_by = excluded.needed_by, custom = excluded.custom;
  return jsonb_build_object('id', v_id, 'contact_id', v_contact);
end $$;

create or replace function public.save_owner_deal(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_contact uuid;
  v_id      uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_kind    text := p->>'deal_kind';
  v_rented  boolean := case when v_kind = 'rent' then (p->>'is_rented')::boolean end;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  v_contact := upsert_contact(p->'contact');
  insert into owner_deals (id, contact_id, purpose_id, built_sqm, plot_sqm, lat, lng, address, description,
                           deal_kind, asking_price, is_rented, monthly_rent, ai_price_per_sqm, custom)
  values (v_id, v_contact,
          assert_option(nullif(p->>'purpose_id', '')::uuid, 'owner_purpose'),
          (p->>'built_sqm')::numeric, (p->>'plot_sqm')::numeric,
          (p->>'lat')::float8, (p->>'lng')::float8, btrim(p->>'address'), btrim(p->>'description'),
          v_kind, (p->>'asking_price')::numeric, v_rented,
          case when v_rented then (p->>'monthly_rent')::numeric end,
          case when v_kind = 'sale' then nullif(p->>'ai_price_per_sqm', '')::numeric end,
          coalesce(p->'custom', '{}'::jsonb))
  on conflict (id) do update set
    contact_id = excluded.contact_id, purpose_id = excluded.purpose_id, built_sqm = excluded.built_sqm,
    plot_sqm = excluded.plot_sqm, lat = excluded.lat, lng = excluded.lng, address = excluded.address,
    description = excluded.description, deal_kind = excluded.deal_kind, asking_price = excluded.asking_price,
    is_rented = excluded.is_rented, monthly_rent = excluded.monthly_rent,
    ai_price_per_sqm = excluded.ai_price_per_sqm, custom = excluded.custom;
  return jsonb_build_object('id', v_id, 'contact_id', v_contact);
end $$;

-- "+ חדש" in a dropdown: returns the existing row if the value is already there.
create or replace function public.add_option(p_list_key text, p_value text) returns public.option_lists
language plpgsql set search_path = public as $$
declare r option_lists;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  insert into option_lists (list_key, value, sort)
  values (p_list_key, btrim(p_value),
          (select coalesce(max(sort), 0) + 10 from option_lists where list_key = p_list_key))
  on conflict (list_key, value) do update set value = excluded.value
  returning * into r;
  return r;
end $$;

revoke execute on function public.save_lead_deal(jsonb), public.save_owner_deal(jsonb),
                           public.add_option(text, text), public.upsert_contact(jsonb),
                           public.assert_option(uuid, text), public.is_member() from public, anon;
grant execute on function public.save_lead_deal(jsonb), public.save_owner_deal(jsonb),
                          public.add_option(text, text), public.upsert_contact(jsonb),
                          public.assert_option(uuid, text), public.is_member() to authenticated;

-- ───────────────────────── seed: option lists ─────────────────────────
insert into public.option_lists (list_key, value, sort) values
  ('lead_need', 'לקנות', 10), ('lead_need', 'לשכור', 20), ('lead_need', 'להשכיר', 30), ('lead_need', 'להשקעה', 40),
  ('lead_purpose', 'תעשייה קלה', 10), ('lead_purpose', 'תעשייה כבדה', 20), ('lead_purpose', 'משרדים', 30),
  ('lead_purpose', 'מסחר / חנות', 40), ('lead_purpose', 'פרטי', 50), ('lead_purpose', 'מרלוג', 60),
  ('lead_purpose', 'מחסן', 70),
  ('owner_purpose', 'מחסן', 10), ('owner_purpose', 'תעשייה', 20), ('owner_purpose', 'מסחר', 30),
  ('owner_purpose', 'חנות', 40)
on conflict (list_key, value) do nothing;

-- ───────────────────────── seed: demo data (fake 05X numbers) ─────────────────────────
create or replace function pg_temp.opt(k text, v text) returns uuid language sql as $$
  select id from public.option_lists where list_key = k and value = v
$$;

insert into public.contacts (id, phone, name, entity_type, company_name) values
  ('c0000000-0000-4000-8000-000000000001', '054-1110001', 'יוסי אברהם',  'company', 'אברהם לוגיסטיקה בע"מ'),
  ('c0000000-0000-4000-8000-000000000002', '052-1110002', 'מירב כהן',    'private', null),
  ('c0000000-0000-4000-8000-000000000003', '050-1110003', 'דוד לוי',     'company', 'לוי מתכות'),
  ('c0000000-0000-4000-8000-000000000004', '053-1110004', 'רונית שרעבי', 'private', null),
  ('c0000000-0000-4000-8000-000000000005', '058-1110005', 'אבי מזרחי',   'company', 'מזרחי שיווק והפצה'),
  ('c0000000-0000-4000-8000-000000000006', '054-1110006', 'נועה פרץ',    'private', null),
  ('c0000000-0000-4000-8000-000000000007', '050-1110007', 'משה ביטון',   'company', 'ביטון הובלות'),
  ('c0000000-0000-4000-8000-000000000008', '052-1110008', 'שירן אוחיון', 'private', null),
  ('c0000000-0000-4000-8000-000000000009', '053-1110009', 'עמית גבאי',   'company', 'גבאי טקסטיל'),
  ('c0000000-0000-4000-8000-000000000010', '054-1110010', 'אליהו דהן',   'company', 'דהן נכסים'),
  ('c0000000-0000-4000-8000-000000000011', '050-1110011', 'שמעון חזן',   'private', null),
  ('c0000000-0000-4000-8000-000000000012', '052-1110012', 'ליאור אזולאי', 'company', 'אזולאי השקעות'),
  ('c0000000-0000-4000-8000-000000000013', '058-1110013', 'טל סויסה',    'private', null),
  ('c0000000-0000-4000-8000-000000000014', '053-1110014', 'חיים בן דוד', 'company', 'בן דוד בנייה'),
  ('c0000000-0000-4000-8000-000000000015', '054-1110015', 'אורית מלכה',  'private', null),
  ('c0000000-0000-4000-8000-000000000016', '050-1110016', 'ניר עמר',     'company', 'עמר תעשיות')
on conflict (id) do nothing;

insert into public.lead_deals (id, contact_id, lead_date, need_id, purpose_id, size_value, size_unit,
  lat, lng, radius_m, height_m, notes, budget_value, budget_kind, needed_by, status, closed_at) values
  ('d1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '2026-09-14',
   pg_temp.opt('lead_need','לשכור'), pg_temp.opt('lead_purpose','מרלוג'), 1200, 'sqm',
   31.6100, 34.7642, 5000, 9, 'צריך רמפת פריקה ו-2 דלתות משאית', 45, 'per_sqm', '2026-12-01', 'active', null),
  ('d1000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', '2026-10-02',
   pg_temp.opt('lead_need','להשקעה'), pg_temp.opt('lead_purpose','מסחר / חנות'), 300, 'sqm',
   31.6680, 34.5740, 8000, 4, 'מחפש נכס מניב עם שוכר קיים', 4500000, 'total', '2027-03-01', 'active', null),
  ('d1000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', '2026-09-20',
   pg_temp.opt('lead_need','לקנות'), pg_temp.opt('lead_purpose','משרדים'), 150, 'sqm',
   31.6075, 34.7460, 3000, 3, null, 2200000, 'total', '2027-01-15', 'active', null),
  ('d1000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000003', '2026-08-30',
   pg_temp.opt('lead_need','לשכור'), pg_temp.opt('lead_purpose','תעשייה כבדה'), 2, 'dunam',
   31.6020, 34.7900, 10000, 12, 'חשמל תלת פאזי, עגורן גשר', 38, 'per_sqm', '2026-11-20', 'active', null),
  ('d1000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000004', '2026-10-05',
   pg_temp.opt('lead_need','לשכור'), pg_temp.opt('lead_purpose','מסחר / חנות'), 80, 'sqm',
   31.5250, 34.5960, 2000, 3.5, 'חזית לרחוב ראשי', 6000, 'total', '2026-11-01', 'active', null),
  ('d1000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000005', '2026-09-08',
   pg_temp.opt('lead_need','לשכור'), pg_temp.opt('lead_purpose','מחסן'), 500, 'sqm',
   31.6150, 34.7700, 6000, 7, null, 40, 'per_sqm', '2026-12-15', 'active', null),
  ('d1000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000006', '2026-10-10',
   pg_temp.opt('lead_need','לקנות'), pg_temp.opt('lead_purpose','פרטי'), 1, 'dunam',
   31.6200, 34.7500, 4000, 6, 'מגרש לבית פרטי בכרמי גת', 1800000, 'total', '2027-06-01', 'active', null),
  ('d1000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000007', '2026-09-25',
   pg_temp.opt('lead_need','לשכור'), pg_temp.opt('lead_purpose','תעשייה קלה'), 800, 'sqm',
   31.5300, 34.6050, 7000, 8, 'חניה למשאיות', 35, 'per_sqm', '2027-01-01', 'active', null),
  ('d1000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000008', '2026-07-12',
   pg_temp.opt('lead_need','לשכור'), pg_temp.opt('lead_purpose','משרדים'), 60, 'sqm',
   31.6650, 34.5780, 3000, 3, null, 3500, 'total', '2026-09-01', 'closed', '2026-08-28 10:00+03'),
  ('d1000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000009', '2026-06-03',
   pg_temp.opt('lead_need','לקנות'), pg_temp.opt('lead_purpose','תעשייה קלה'), 3, 'dunam',
   31.6050, 34.7800, 15000, 10, 'ויתר – עבר לאזור הצפון', 9000000, 'total', '2026-10-01', 'irrelevant', '2026-09-10 12:00+03')
on conflict (id) do nothing;

insert into public.owner_deals (id, contact_id, purpose_id, built_sqm, plot_sqm, lat, lng, address, description,
  deal_kind, asking_price, is_rented, monthly_rent, ai_price_per_sqm, status, closed_at) values
  ('d2000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', pg_temp.opt('owner_purpose','חנות'),
   120, 150, 31.6090, 34.7710, 'שדרות לכיש 40, קריית גת', 'חנות ברחוב ראשי, חזית 8 מטר',
   'rent', 2400000, true, 13000, null, 'active', null),
  ('d2000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000010', pg_temp.opt('owner_purpose','מחסן'),
   1500, 2500, 31.6030, 34.7880, 'אזור תעשייה קריית גת', 'מבנה אחסנה, גובה 14 מ׳, חצר תפעולית 1,000 מ״ר',
   'rent', 9000000, false, null, null, 'active', null),
  ('d2000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000011', pg_temp.opt('owner_purpose','מסחר'),
   2500, 3000, 31.6210, 34.7480, 'מרכז מסחרי כרמי גת', 'קומת מסחר מתחת למגורים, מחולקת לכמה חנויות',
   'sale', 65000000, null, null, 24000, 'active', null),
  ('d2000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000012', pg_temp.opt('owner_purpose','תעשייה'),
   800, 1500, 31.5320, 34.6080, 'אזור תעשייה ספיר, שדרות', 'מבנה תעשייה עם משרדים בקומה ב׳',
   'sale', 6400000, null, null, 7000, 'active', null),
  ('d2000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000013', pg_temp.opt('owner_purpose','חנות'),
   90, 90, 31.6690, 34.5710, 'רחוב הרצל 25, אשקלון', 'חנות פינתית, מושכרת לרשת',
   'rent', 1800000, true, 9500, null, 'active', null),
  ('d2000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000014', pg_temp.opt('owner_purpose','מחסן'),
   600, 1000, 31.6650, 34.5900, 'אזור תעשייה צפוני, אשקלון', 'מחסן עם רמפה ושער חשמלי',
   'sale', 4200000, null, null, 6000, 'active', null),
  ('d2000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000015', pg_temp.opt('owner_purpose','מסחר'),
   200, 250, 31.6110, 34.7690, 'רחוב הגפן 5, קריית גת', 'קומת קרקע מסחרית',
   'rent', 3000000, true, 15000, null, 'closed', '2026-09-01 09:00+03'),
  ('d2000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000016', pg_temp.opt('owner_purpose','תעשייה'),
   3000, 5000, 31.5990, 34.7950, 'פארק תעשייה קריית גת', 'מפעל לשעבר, דורש שיפוץ',
   'sale', 18000000, null, null, 6300, 'irrelevant', '2026-08-15 11:00+03')
on conflict (id) do nothing;

-- ───────────────────────── members ─────────────────────────
-- Explicit allowlist: only this email gets access. Replace the placeholder with Leah's email before running.
-- To allow another user later, run this line again with their email.
insert into public.crm_members (user_id)
  select id from auth.users where lower(email) = lower('LEAH_EMAIL@example.com')
on conflict do nothing;
