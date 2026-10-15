-- Prime Location CRM – migration 005 (Leah's feedback round 2). Run AFTER 004. Safe to re-run.
-- Only phone + name stay required; broker contacts; lead size range; owner notes; rent fields for sale too;
-- video infrastructure (off). Additive: no row is deleted. All in one transaction: any surprise aborts everything.
begin;

-- ───────────── contacts: broker + business numbers ─────────────
alter table public.contacts add column if not exists company_number text;   -- ח.פ. (optional)
alter table public.contacts add column if not exists broker_license text;   -- מס' רישיון תיווך (optional)
alter table public.contacts drop constraint if exists contacts_entity_type_check;
alter table public.contacts add constraint contacts_entity_type_check check (entity_type in ('company', 'private', 'broker'));

-- The auto-named "company needs a name" check is replaced by a named one. Found by its definition; exactly one expected.
do $$
declare r record; n int := 0;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.contacts'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%company_name%' and conname <> 'contacts_company_name_check'
  loop n := n + 1; execute format('alter table public.contacts drop constraint %I', r.conname); end loop;
  if n > 1 then raise exception 'unexpected: % company_name checks on contacts', n; end if;
end $$;
alter table public.contacts drop constraint if exists contacts_company_name_check;
alter table public.contacts add constraint contacts_company_name_check
  check (entity_type <> 'company' or length(btrim(coalesce(company_name, ''))) > 0);

-- ───────────── lead deals: everything optional, size range ─────────────
alter table public.lead_deals
  alter column need_id drop not null, alter column purpose_id drop not null,
  alter column size_value drop not null, alter column size_unit drop not null,
  alter column lat drop not null, alter column lng drop not null, alter column radius_m drop not null,
  alter column height_m drop not null, alter column budget_value drop not null, alter column budget_kind drop not null,
  alter column needed_by drop not null;
alter table public.lead_deals add column if not exists size_min numeric;
alter table public.lead_deals add column if not exists size_max numeric;
alter table public.lead_deals drop constraint if exists lead_deals_size_range_check;
alter table public.lead_deals add constraint lead_deals_size_range_check check (
  (size_min is null or size_min > 0) and (size_max is null or size_max > 0)
  and (size_min is null or size_max is null or size_min <= size_max));
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lead_deals' and column_name = 'size_min_sqm') then
    alter table public.lead_deals add column size_min_sqm numeric generated always as
      (case when size_unit = 'dunam' then size_min * 1000 else size_min end) stored;
    alter table public.lead_deals add column size_max_sqm numeric generated always as
      (case when size_unit = 'dunam' then size_max * 1000 else size_max end) stored;
  end if;
end $$;
-- existing deals: one size → from = to
update public.lead_deals set size_min = size_value, size_max = size_value
 where size_value is not null and size_min is null and size_max is null;

-- ───────────── owner deals: everything optional, rent fields for sale too, notes ─────────────
alter table public.owner_deals
  alter column purpose_id drop not null, alter column built_sqm drop not null, alter column plot_sqm drop not null,
  alter column lat drop not null, alter column lng drop not null, alter column address drop not null,
  alter column deal_kind drop not null, alter column asking_price drop not null;
alter table public.owner_deals add column if not exists notes text;
-- the two old rent rules ("is_rented only for rent", "rent exactly when rented") – exactly two expected
do $$
declare r record; n int := 0;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.owner_deals'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%is_rented%' and conname <> 'owner_deals_rent_check'
  loop n := n + 1; execute format('alter table public.owner_deals drop constraint %I', r.conname); end loop;
  if n not in (0, 2) then raise exception 'unexpected: % is_rented checks on owner_deals (expected 2)', n; end if;
end $$;
alter table public.owner_deals drop constraint if exists owner_deals_rent_check;
alter table public.owner_deals add constraint owner_deals_rent_check check (monthly_rent is null or is_rented is true);

-- ───────────── RPCs ─────────────
-- Keys an older app version does not send keep their stored value (company_number, broker_license).
create or replace function public.upsert_contact(c jsonb) returns uuid
language plpgsql set search_path = public as $$
declare v_id uuid; v_type text := coalesce(nullif(c->>'entity_type', ''), 'private');
begin
  insert into contacts (phone, name, entity_type, company_name, company_number, broker_license)
  values (normalize_phone(c->>'phone'), btrim(c->>'name'), v_type,
          case when v_type = 'company' then nullif(btrim(c->>'company_name'), '') end,
          case when v_type = 'company' then nullif(btrim(c->>'company_number'), '') end,
          case when v_type = 'broker' then nullif(btrim(c->>'broker_license'), '') end)
  on conflict (phone) do update set
    name = excluded.name, entity_type = excluded.entity_type, company_name = excluded.company_name,
    company_number = case when c ? 'company_number' or excluded.entity_type <> 'company' then excluded.company_number else contacts.company_number end,
    broker_license = case when c ? 'broker_license' or excluded.entity_type <> 'broker' then excluded.broker_license else contacts.broker_license end
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.opt_or_null(v text, expected_key text) returns uuid
language sql stable set search_path = public as $$
  select case when nullif(v, '') is null then null else assert_option(v::uuid, expected_key) end
$$;

-- Size: a new client sends size_min / size_max. An older client sends only size_value: it may set a single size,
-- but it can never collapse a stored range (500–800 stays 500–800). size_value stays filled for older readers.
create or replace function public.save_lead_deal(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_contact uuid; v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_min numeric; v_max numeric; o_min numeric; o_max numeric; v_new boolean := p ? 'size_min' or p ? 'size_max';
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  v_contact := upsert_contact(p->'contact');
  if v_new then
    v_min := nullif(p->>'size_min', '')::numeric; v_max := nullif(p->>'size_max', '')::numeric;
  else
    select size_min, size_max into o_min, o_max from lead_deals where id = v_id;
    if o_min is not null and o_max is not null and o_min <> o_max then v_min := o_min; v_max := o_max;
    else v_min := nullif(p->>'size_value', '')::numeric; v_max := v_min; end if;
  end if;
  insert into lead_deals (id, contact_id, lead_date, need_id, purpose_id, size_value, size_min, size_max, size_unit,
                          lat, lng, radius_m, height_m, notes, budget_value, budget_kind, budget_currency,
                          needed_by, address, custom)
  values (v_id, v_contact,
          coalesce(nullif(p->>'lead_date', '')::date, current_date),
          opt_or_null(p->>'need_id', 'lead_need'), opt_or_null(p->>'purpose_id', 'lead_purpose'),
          coalesce(v_min, v_max), v_min, v_max, coalesce(nullif(p->>'size_unit', ''), 'sqm'),
          nullif(p->>'lat', '')::float8, nullif(p->>'lng', '')::float8, nullif(p->>'radius_m', '')::int,
          nullif(p->>'height_m', '')::numeric, nullif(btrim(coalesce(p->>'notes', '')), ''),
          nullif(p->>'budget_value', '')::numeric, nullif(p->>'budget_kind', ''),
          coalesce(nullif(p->>'budget_currency', ''), 'ILS'),
          nullif(p->>'needed_by', '')::date, nullif(btrim(coalesce(p->>'address', '')), ''),
          coalesce(p->'custom', '{}'::jsonb))
  on conflict (id) do update set
    contact_id = excluded.contact_id, lead_date = excluded.lead_date, need_id = excluded.need_id,
    purpose_id = excluded.purpose_id, size_value = excluded.size_value, size_min = excluded.size_min,
    size_max = excluded.size_max, size_unit = excluded.size_unit,
    lat = excluded.lat, lng = excluded.lng, radius_m = excluded.radius_m, height_m = excluded.height_m,
    notes = excluded.notes, budget_value = excluded.budget_value, budget_kind = excluded.budget_kind,
    budget_currency = excluded.budget_currency, needed_by = excluded.needed_by, address = excluded.address,
    custom = excluded.custom;
  return jsonb_build_object('id', v_id, 'contact_id', v_contact);
end $$;

-- Rent fields work for sale too: "rented?" → monthly rent → yield. notes: kept when an older client doesn't send it.
create or replace function public.save_owner_deal(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_contact uuid;
  v_id      uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_kind    text := nullif(p->>'deal_kind', '');
  v_rented  boolean := nullif(p->>'is_rented', '')::boolean;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  v_contact := upsert_contact(p->'contact');
  insert into owner_deals (id, contact_id, purpose_id, built_sqm, plot_sqm, lat, lng, address, description, notes,
                           deal_kind, asking_price, is_rented, monthly_rent, ai_price_per_sqm, custom)
  values (v_id, v_contact, opt_or_null(p->>'purpose_id', 'owner_purpose'),
          nullif(p->>'built_sqm', '')::numeric, nullif(p->>'plot_sqm', '')::numeric,
          nullif(p->>'lat', '')::float8, nullif(p->>'lng', '')::float8,
          nullif(btrim(coalesce(p->>'address', '')), ''), nullif(btrim(coalesce(p->>'description', '')), ''),
          nullif(btrim(coalesce(p->>'notes', '')), ''),
          v_kind, nullif(p->>'asking_price', '')::numeric, v_rented,
          case when v_rented then nullif(p->>'monthly_rent', '')::numeric end,
          case when v_kind = 'sale' then nullif(p->>'ai_price_per_sqm', '')::numeric end,
          coalesce(p->'custom', '{}'::jsonb))
  on conflict (id) do update set
    contact_id = excluded.contact_id, purpose_id = excluded.purpose_id, built_sqm = excluded.built_sqm,
    plot_sqm = excluded.plot_sqm, lat = excluded.lat, lng = excluded.lng, address = excluded.address,
    description = excluded.description,
    notes = case when p ? 'notes' then excluded.notes else owner_deals.notes end,
    deal_kind = excluded.deal_kind, asking_price = excluded.asking_price,
    is_rented = excluded.is_rented, monthly_rent = excluded.monthly_rent,
    ai_price_per_sqm = excluded.ai_price_per_sqm, custom = excluded.custom;
  return jsonb_build_object('id', v_id, 'contact_id', v_contact);
end $$;

-- Media: items may be { kind: 'image' | 'video', path, thumb, w, h }. Video paths are accepted here already;
-- uploads stay image-only until the bucket allows video (Pro plan), e.g.:
--   update storage.buckets set file_size_limit = 52428800,
--     allowed_mime_types = array['image/jpeg','image/webp','video/mp4','video/quicktime','video/webm'] where id = 'deal-photos';
create or replace function public.set_deal_photos(p_module text, p_id uuid, p_photos jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare e jsonb; v_old jsonb; v_clean jsonb := '[]'::jsonb; v_kind text;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  if p_module not in ('lead', 'owner') then raise exception 'מודול לא תקין' using errcode = '22023'; end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' then raise exception 'רשימת תמונות לא תקינה' using errcode = '22023'; end if;
  if jsonb_array_length(p_photos) > 5 then raise exception 'אפשר לשמור עד 5 תמונות' using errcode = '22023'; end if;
  for e in select value from jsonb_array_elements(p_photos) loop
    v_kind := coalesce(nullif(e->>'kind', ''), 'image');
    if jsonb_typeof(e) <> 'object' or v_kind not in ('image', 'video')
       or coalesce(e->>'path', '') !~ ('^' || p_id::text || '/[0-9a-f-]+\.' || case when v_kind = 'video' then '(mp4|webm|mov)' else '(jpg|webp)' end || '$')
       or coalesce(e->>'thumb', '') !~ ('^' || p_id::text || '/[0-9a-f-]+_t\.(jpg|webp)$') then
      raise exception 'נתיב תמונה לא תקין' using errcode = '22023';
    end if;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'kind', v_kind, 'path', e->>'path', 'thumb', e->>'thumb',
      'w', least(greatest(coalesce((e->>'w')::int, 0), 0), 20000),
      'h', least(greatest(coalesce((e->>'h')::int, 0), 0), 20000)));
  end loop;
  if p_module = 'lead' then
    select photos into v_old from lead_deals where id = p_id;
    if not found then raise exception 'העסקה לא נמצאה' using errcode = 'P0002'; end if;
    update lead_deals set photos = v_clean where id = p_id;
  else
    select photos into v_old from owner_deals where id = p_id;
    if not found then raise exception 'העסקה לא נמצאה' using errcode = 'P0002'; end if;
    update owner_deals set photos = v_clean where id = p_id;
  end if;
  return jsonb_build_object('id', p_id, 'previous', v_old);
end $$;

revoke execute on function public.save_lead_deal(jsonb), public.save_owner_deal(jsonb), public.upsert_contact(jsonb),
                           public.opt_or_null(text, text), public.set_deal_photos(text, uuid, jsonb) from public, anon;
grant execute on function public.save_lead_deal(jsonb), public.save_owner_deal(jsonb), public.upsert_contact(jsonb),
                          public.opt_or_null(text, text), public.set_deal_photos(text, uuid, jsonb) to authenticated;

commit;
