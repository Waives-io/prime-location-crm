-- 008: a lead can have several purposes ("מחסן" + "מסחר"), like several needs (007).
-- purpose_ids holds them in the order picked; purpose_id stays = the first one, for older app versions.
-- Owners keep one purpose. Safe to run twice.

alter table public.lead_deals add column if not exists purpose_ids uuid[] not null default '{}';
update public.lead_deals set purpose_ids = array[purpose_id] where purpose_id is not null and cardinality(purpose_ids) = 0;

-- Same as 007, plus purposes (same rules as needs). A new client sends need_ids. An older client sends only need_id:
-- if it is the same first need as stored, the other needs are kept; if it changed, needs = that one.
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
    custom = excluded.custom;
  return jsonb_build_object('id', v_id, 'contact_id', v_contact);
end $$;

revoke execute on function public.save_lead_deal(jsonb) from public, anon;
grant execute on function public.save_lead_deal(jsonb) to authenticated;
