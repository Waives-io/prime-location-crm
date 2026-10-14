-- Prime Location CRM – migration 003: dashboard + matching. Run AFTER 002, and BEFORE turning the dashboard flag on.
-- Additive only, safe to re-run. The live client keeps working: save_owner_deal keeps its (p jsonb) signature
-- and a payload without asking_rent saves exactly as before (asking_rent stays null).

-- Owner rent deals: the rent the owner asks for (monthly), used to check a renter's budget.
alter table public.owner_deals add column if not exists asking_rent numeric;
alter table public.owner_deals drop constraint if exists owner_deals_asking_rent_check;
alter table public.owner_deals add constraint owner_deals_asking_rent_check
  check (asking_rent is null or (asking_rent > 0 and deal_kind = 'rent'));

-- Default matching groups for the values that exist today (only where no group was chosen yet).
-- lead_need: rent / buy / invest (להשכיר stays without a group = not matched).
update public.option_lists set match_group = v.g
from (values
  ('lead_need', 'לשכור', 'rent'), ('lead_need', 'לקנות', 'buy'), ('lead_need', 'להשקעה', 'invest'),
  ('lead_purpose', 'מרלוג', 'storage'), ('lead_purpose', 'מחסן', 'storage'),
  ('lead_purpose', 'תעשייה קלה', 'industry'), ('lead_purpose', 'תעשייה כבדה', 'industry'),
  ('lead_purpose', 'משרדים', 'offices'), ('lead_purpose', 'מסחר / חנות', 'commerce'), ('lead_purpose', 'פרטי', 'land'),
  ('owner_purpose', 'מחסן', 'storage'), ('owner_purpose', 'תעשייה', 'industry'),
  ('owner_purpose', 'מסחר', 'commerce'), ('owner_purpose', 'חנות', 'commerce')
) as v(k, val, g)
where option_lists.list_key = v.k and option_lists.value = v.val and option_lists.match_group is null;

-- Same signature as before; only asking_rent is new (optional, rent deals only).
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
                           deal_kind, asking_price, is_rented, monthly_rent, ai_price_per_sqm, asking_rent, custom)
  values (v_id, v_contact,
          assert_option(nullif(p->>'purpose_id', '')::uuid, 'owner_purpose'),
          (p->>'built_sqm')::numeric, (p->>'plot_sqm')::numeric,
          (p->>'lat')::float8, (p->>'lng')::float8, btrim(p->>'address'), nullif(btrim(coalesce(p->>'description', '')), ''),
          v_kind, (p->>'asking_price')::numeric, v_rented,
          case when v_rented then (p->>'monthly_rent')::numeric end,
          case when v_kind = 'sale' then nullif(p->>'ai_price_per_sqm', '')::numeric end,
          case when v_kind = 'rent' then nullif(p->>'asking_rent', '')::numeric end,
          coalesce(p->'custom', '{}'::jsonb))
  on conflict (id) do update set
    contact_id = excluded.contact_id, purpose_id = excluded.purpose_id, built_sqm = excluded.built_sqm,
    plot_sqm = excluded.plot_sqm, lat = excluded.lat, lng = excluded.lng, address = excluded.address,
    description = excluded.description, deal_kind = excluded.deal_kind, asking_price = excluded.asking_price,
    is_rented = excluded.is_rented, monthly_rent = excluded.monthly_rent,
    ai_price_per_sqm = excluded.ai_price_per_sqm,
    -- an old client (no asking_rent in the payload) never wipes a value set by a new client
    asking_rent = case when p ? 'asking_rent' then excluded.asking_rent
                       when excluded.deal_kind = 'rent' then owner_deals.asking_rent end,
    custom = excluded.custom;
  return jsonb_build_object('id', v_id, 'contact_id', v_contact);
end $$;

revoke execute on function public.save_owner_deal(jsonb) from public, anon;
grant execute on function public.save_owner_deal(jsonb) to authenticated;
