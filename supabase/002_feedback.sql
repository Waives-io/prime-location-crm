-- Prime Location CRM – migration 002 (Galli's feedback round 1). Run AFTER schema.sql.
-- Additive only: no data is deleted. Safe to re-run.

-- Leads: address / area text (filled from search or map tap) + budget currency
alter table public.lead_deals add column if not exists address text;
alter table public.lead_deals add column if not exists budget_currency text not null default 'ILS';
alter table public.lead_deals drop constraint if exists lead_deals_budget_currency_check;
alter table public.lead_deals add constraint lead_deals_budget_currency_check check (budget_currency in ('ILS', 'USD'));

-- Owners: description is optional
alter table public.owner_deals alter column description drop not null;
alter table public.owner_deals drop constraint if exists owner_deals_description_check;

-- Custom fields: which form section they belong to (existing fields stay at the end of the form)
alter table public.custom_fields add column if not exists section text not null default 'money';
alter table public.custom_fields drop constraint if exists custom_fields_section_check;
alter table public.custom_fields add constraint custom_fields_section_check
  check (section in ('contact', 'property', 'location', 'money'));

-- Option lists: "remove" hides a value from the dropdown; deals that use it keep showing it
alter table public.option_lists add column if not exists hidden boolean not null default false;

-- ───────────── RPCs (replace) ─────────────
create or replace function public.save_lead_deal(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare v_contact uuid; v_id uuid := coalesce(nullif(p->>'id', '')::uuid, gen_random_uuid());
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  v_contact := upsert_contact(p->'contact');
  insert into lead_deals (id, contact_id, lead_date, need_id, purpose_id, size_value, size_unit,
                          lat, lng, radius_m, height_m, notes, budget_value, budget_kind, budget_currency,
                          needed_by, address, custom)
  values (v_id, v_contact,
          coalesce(nullif(p->>'lead_date', '')::date, current_date),
          assert_option(nullif(p->>'need_id', '')::uuid, 'lead_need'),
          assert_option(nullif(p->>'purpose_id', '')::uuid, 'lead_purpose'),
          (p->>'size_value')::numeric, p->>'size_unit',
          (p->>'lat')::float8, (p->>'lng')::float8, (p->>'radius_m')::int, (p->>'height_m')::numeric,
          nullif(btrim(coalesce(p->>'notes', '')), ''),
          (p->>'budget_value')::numeric, p->>'budget_kind', coalesce(nullif(p->>'budget_currency', ''), 'ILS'),
          (p->>'needed_by')::date,
          nullif(btrim(coalesce(p->>'address', '')), ''),
          coalesce(p->'custom', '{}'::jsonb))
  on conflict (id) do update set
    contact_id = excluded.contact_id, lead_date = excluded.lead_date, need_id = excluded.need_id,
    purpose_id = excluded.purpose_id, size_value = excluded.size_value, size_unit = excluded.size_unit,
    lat = excluded.lat, lng = excluded.lng, radius_m = excluded.radius_m, height_m = excluded.height_m,
    notes = excluded.notes, budget_value = excluded.budget_value, budget_kind = excluded.budget_kind,
    budget_currency = excluded.budget_currency, needed_by = excluded.needed_by, address = excluded.address,
    custom = excluded.custom;
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
          (p->>'lat')::float8, (p->>'lng')::float8, btrim(p->>'address'),
          nullif(btrim(coalesce(p->>'description', '')), ''),
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

-- "+ חדש" on a value that was removed (hidden) brings it back
create or replace function public.add_option(p_list_key text, p_value text) returns public.option_lists
language plpgsql set search_path = public as $$
declare r option_lists;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  insert into option_lists (list_key, value, sort)
  values (p_list_key, btrim(p_value),
          (select coalesce(max(sort), 0) + 10 from option_lists where list_key = p_list_key))
  on conflict (list_key, value) do update set value = excluded.value, hidden = false
  returning * into r;
  return r;
end $$;

revoke execute on function public.save_lead_deal(jsonb), public.save_owner_deal(jsonb),
                           public.add_option(text, text) from public, anon;
grant execute on function public.save_lead_deal(jsonb), public.save_owner_deal(jsonb),
                          public.add_option(text, text) to authenticated;

-- ───────────── members ─────────────
-- Leah: works once her user exists (Authentication → Users → Add user). Re-run this line after creating her.
insert into public.crm_members (user_id)
  select id from auth.users where lower(email) = lower('LEAH_EMAIL@example.com')
on conflict do nothing;
