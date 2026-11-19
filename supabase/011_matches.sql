-- 011: category (leads + owners, one shared list), "איך הגיע/ה אליי?" (on the contact), matches settings + dismissals.
-- Additive only: no row is deleted or rewritten. Safe to run twice.
begin;

-- two new shared lists
alter table public.option_lists drop constraint if exists option_lists_list_key_check;
alter table public.option_lists add constraint option_lists_list_key_check
  check (list_key in ('lead_need', 'lead_purpose', 'owner_purpose', 'category', 'lead_source'));
insert into public.option_lists (list_key, value, sort)
select k, v, o * 10 from (values
  ('category', 'רכב', 1), ('category', 'לוגיסטיקה / אחסנה', 2), ('category', 'אופנה', 3), ('category', 'בנקים', 4),
  ('category', 'בתי קפה', 5), ('category', 'קוסמטיקה', 6), ('category', 'הנעלה', 7), ('category', 'חברים', 8),
  ('category', 'חד״כ', 9), ('category', 'חניונים', 10), ('category', 'חשמל', 11), ('category', 'יזמים - בניה', 12),
  ('category', 'סטוקים', 13),
  ('lead_source', 'פייסבוק', 1), ('lead_source', 'חבר המליץ', 2), ('lead_source', 'גוגל', 3), ('lead_source', 'יד 2', 4),
  ('lead_source', 'מדלן', 5), ('lead_source', 'מניבים', 6), ('lead_source', 'ChatGPT', 7)) s(k, v, o)
on conflict (list_key, value) do nothing;

alter table public.lead_deals  add column if not exists category_ids uuid[] not null default '{}';
alter table public.owner_deals add column if not exists category_ids uuid[] not null default '{}';
alter table public.contacts    add column if not exists lead_source_id uuid references public.option_lists(id) on delete set null;

-- called by both save functions after the row is written: a key that is not sent keeps what is stored
create or replace function public.apply_deal_extras(p_module text, p_id uuid, p_contact uuid, p jsonb) returns void
language plpgsql set search_path = public as $$
declare v_cats uuid[] := '{}'; v_e text; v_u uuid;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  if p ? 'category_ids' and jsonb_typeof(p->'category_ids') in ('array', 'null') then   -- null or [] clears
    for v_e in select jsonb_array_elements_text(case when jsonb_typeof(p->'category_ids') = 'array' then p->'category_ids' else '[]' end) loop
      v_u := opt_or_null(v_e, 'category');
      if v_u is not null and not (v_u = any(v_cats)) then v_cats := v_cats || v_u; end if;
    end loop;
    if p_module = 'lead' then update lead_deals set category_ids = v_cats where id = p_id;
    else update owner_deals set category_ids = v_cats where id = p_id; end if;
  end if;
  if jsonb_typeof(p->'contact') = 'object' and (p->'contact') ? 'lead_source_id' then
    update contacts set lead_source_id = opt_or_null(p->'contact'->>'lead_source_id', 'lead_source') where id = p_contact;
  end if;
end $$;
revoke execute on function public.apply_deal_extras(text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.apply_deal_extras(text, uuid, uuid, jsonb) to authenticated;

-- matches: weights (sum 100) and must-conditions; Leah edits them in הגדרות → התאמות
insert into public.app_settings (key, value) values ('match_settings', '{"version":1,
  "weights":{"category":25,"area":25,"purpose":20,"size":15,"budget":15,"height":0},
  "must":{"deal_type":true,"category":false,"area":false,"purpose":false}}')
on conflict (key) do nothing;

create or replace function public.save_match_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w jsonb := p->'weights'; m jsonb := p->'must'; k text; v int; s int := 0; v_clean jsonb;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  if coalesce((p->>'version')::int, 0) <> 1 or jsonb_typeof(w) <> 'object' or jsonb_typeof(m) <> 'object' then
    raise exception 'הגדרות לא תקינות' using errcode = '22023'; end if;
  if (select count(*) from jsonb_object_keys(w)) <> 6 or (select count(*) from jsonb_object_keys(m)) <> 4 then
    raise exception 'הגדרות לא תקינות' using errcode = '22023'; end if;
  foreach k in array array['category', 'area', 'purpose', 'size', 'budget', 'height'] loop
    if jsonb_typeof(w->k) <> 'number' then raise exception 'משקל חסר: %', k using errcode = '22023'; end if;
    v := (w->>k)::int;
    if v < 0 or v > 100 or (w->>k)::numeric <> v then raise exception 'משקל לא תקין: %', k using errcode = '22023'; end if;
    s := s + v;
  end loop;
  if s <> 100 then raise exception 'סכום המשקלים חייב להיות 100 (עכשיו %)', s using errcode = '22023'; end if;
  foreach k in array array['deal_type', 'category', 'area', 'purpose'] loop
    if jsonb_typeof(m->k) <> 'boolean' then raise exception 'תנאי חובה לא תקין: %', k using errcode = '22023'; end if;
  end loop;
  v_clean := jsonb_build_object('version', 1, 'weights', w, 'must', m);
  insert into app_settings (key, value) values ('match_settings', v_clean)
  on conflict (key) do update set value = excluded.value;
  return v_clean;
end $$;

-- a pair Leah marked "לא מתאים": hidden from the list, can be restored
create table if not exists public.match_dismissals (
  lead_deal_id  uuid not null references public.lead_deals(id) on delete cascade,
  owner_deal_id uuid not null references public.owner_deals(id) on delete cascade,
  reason        text check (reason is null or char_length(reason) <= 40),
  created_at    timestamptz not null default now(),
  primary key (lead_deal_id, owner_deal_id)
);
alter table public.match_dismissals enable row level security;
revoke all on public.match_dismissals from anon, public;
grant select on public.match_dismissals to authenticated;
drop policy if exists member_read on public.match_dismissals;
create policy member_read on public.match_dismissals for select to authenticated using (public.is_member());

create or replace function public.dismiss_match(p_lead uuid, p_owner uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  insert into match_dismissals (lead_deal_id, owner_deal_id, reason)
  values (p_lead, p_owner, left(nullif(btrim(coalesce(p_reason, '')), ''), 40))
  on conflict (lead_deal_id, owner_deal_id) do update set reason = excluded.reason, created_at = now();
end $$;
create or replace function public.restore_match(p_lead uuid, p_owner uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  delete from match_dismissals where lead_deal_id = p_lead and owner_deal_id = p_owner;
end $$;
revoke execute on function public.save_match_settings(jsonb), public.dismiss_match(uuid, uuid, text), public.restore_match(uuid, uuid) from public, anon;
grant execute on function public.save_match_settings(jsonb), public.dismiss_match(uuid, uuid, text), public.restore_match(uuid, uuid) to authenticated;

-- the save functions: unchanged (010 / 005) except the category + lead-source step before the return
create or replace function public.save_lead_deal(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_contact uuid; v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
  v_min numeric; v_max numeric; o_min numeric; o_max numeric; v_new boolean := p ? 'size_min' or p ? 'size_max';
  v_needs uuid[] := '{}'; v_need uuid; v_e text; v_u uuid; o_needs uuid[]; o_need uuid; v_found boolean;
  v_purps uuid[] := '{}'; v_purp uuid; o_purps uuid[]; o_purp uuid;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  v_contact := upsert_contact(p->'contact');
  if v_new then
    v_min := nullif(p->>'size_min', '')::numeric; v_max := nullif(p->>'size_max', '')::numeric;
  else
    select size_min, size_max into o_min, o_max from lead_deals where id = v_id;
    if o_min is not null or o_max is not null then v_min := o_min; v_max := o_max;   -- keep the stored range as it is
    else v_min := nullif(p->>'size_value', '')::numeric; v_max := v_min; end if;
  end if;
  if jsonb_typeof(p->'need_ids') = 'array' then
    for v_e in select jsonb_array_elements_text(p->'need_ids') loop
      v_u := opt_or_null(v_e, 'lead_need');
      if v_u is not null and not (v_u = any(v_needs)) then v_needs := v_needs || v_u; end if;
    end loop;
    v_need := v_needs[1];
  else
    v_need := opt_or_null(p->>'need_id', 'lead_need');
    select need_ids, need_id, true into o_needs, o_need, v_found from lead_deals where id = v_id;
    if v_found and o_need is not distinct from v_need and cardinality(o_needs) > 0 then v_needs := o_needs;
    elsif v_need is not null then v_needs := array[v_need]; end if;
  end if;
  if jsonb_typeof(p->'purpose_ids') = 'array' then
    for v_e in select jsonb_array_elements_text(p->'purpose_ids') loop
      v_u := opt_or_null(v_e, 'lead_purpose');
      if v_u is not null and not (v_u = any(v_purps)) then v_purps := v_purps || v_u; end if;
    end loop;
    v_purp := v_purps[1];
  else
    v_purp := opt_or_null(p->>'purpose_id', 'lead_purpose');
    v_found := null;
    select purpose_ids, purpose_id, true into o_purps, o_purp, v_found from lead_deals where id = v_id;
    if v_found and o_purp is not distinct from v_purp and cardinality(o_purps) > 0 then v_purps := o_purps;
    elsif v_purp is not null then v_purps := array[v_purp]; end if;
  end if;
  insert into lead_deals (id, contact_id, lead_date, need_id, need_ids, purpose_id, purpose_ids, size_value, size_min, size_max, size_unit,
                          lat, lng, radius_m, height_m, notes, budget_value, budget_kind, budget_currency,
                          needed_by, address, custom)
  values (v_id, v_contact,
          coalesce(nullif(p->>'lead_date', '')::date, current_date),
          v_need, v_needs, v_purp, v_purps,
          coalesce(v_min, v_max), v_min, v_max, coalesce(nullif(p->>'size_unit', ''), 'sqm'),
          nullif(p->>'lat', '')::float8, nullif(p->>'lng', '')::float8, nullif(p->>'radius_m', '')::int,
          nullif(p->>'height_m', '')::numeric, nullif(btrim(coalesce(p->>'notes', '')), ''),
          nullif(p->>'budget_value', '')::numeric, nullif(p->>'budget_kind', ''),
          coalesce(nullif(p->>'budget_currency', ''), 'ILS'),
          nullif(p->>'needed_by', '')::date, nullif(btrim(coalesce(p->>'address', '')), ''),
          coalesce(p->'custom', '{}'::jsonb))
  on conflict (id) do update set
    contact_id = excluded.contact_id, lead_date = excluded.lead_date, need_id = excluded.need_id,
    need_ids = excluded.need_ids, purpose_ids = excluded.purpose_ids,
    purpose_id = excluded.purpose_id, size_value = excluded.size_value, size_min = excluded.size_min,
    size_max = excluded.size_max, size_unit = excluded.size_unit,
    lat = excluded.lat, lng = excluded.lng, radius_m = excluded.radius_m, height_m = excluded.height_m,
    notes = excluded.notes, budget_value = excluded.budget_value, budget_kind = excluded.budget_kind,
    budget_currency = excluded.budget_currency, needed_by = excluded.needed_by, address = excluded.address,
    custom = excluded.custom, is_draft = false;
  perform apply_deal_extras('lead', v_id, v_contact, p);
  return jsonb_build_object('id', v_id, 'contact_id', v_contact);
end $$;

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
    -- an older app (no "v") always sends empty rent fields for a sale: keep what the new app stored
    is_rented = case when not (p ? 'v') and excluded.deal_kind = 'sale' then owner_deals.is_rented else excluded.is_rented end,
    monthly_rent = case when not (p ? 'v') and excluded.deal_kind = 'sale' then owner_deals.monthly_rent else excluded.monthly_rent end,
    ai_price_per_sqm = excluded.ai_price_per_sqm, custom = excluded.custom;
  perform apply_deal_extras('owner', v_id, v_contact, p);
  return jsonb_build_object('id', v_id, 'contact_id', v_contact);
end $$;

revoke execute on function public.save_lead_deal(jsonb), public.save_owner_deal(jsonb) from public, anon;
grant execute on function public.save_lead_deal(jsonb), public.save_owner_deal(jsonb) to authenticated;

commit;
