-- 015: fixes from the review of round 8 (owner signing). Additive: no data is deleted.
--  1. an owner agreement can be created / signed only while the property is active
--  2. rent fee: at most 12 months; 1 month reads "חודש שכירות אחד"

-- 2a. fee range by deal type (NOT VALID: older rows are not re-checked)
alter table public.signing_requests drop constraint if exists signing_requests_fee_check;
alter table public.signing_requests add constraint signing_requests_fee_check
  check (kind <> 'owner_order' or (fee_value > 0 and fee_value <= case when teaser_snapshot->>'deal_kind' = 'rent' then 12 else 100 end)) not valid;

-- 2b. the wording (same as 014, only the rent fee line changes)
create or replace function public.owner_text(p text, r public.signing_requests) returns text
language sql stable set search_path = public as $$
  with v as (select coalesce(r.teaser_snapshot->>'deal_kind', '') = 'sale' as sale,
                    (coalesce(r.signed_at, now()) at time zone 'Asia/Jerusalem')::date as d,
                    coalesce(trim_scale(r.fee_value)::text, '') as fee)
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(p, ''),
    '{{deal_l}}', case when sale then 'למכירת' else 'להשכרת' end),
    '{{deal_n}}', case when sale then 'מכירה' else 'השכרה' end),
    '{{deal_c}}', case when sale then 'מכירת' else 'השכרת' end),
    '{{buyers}}', case when sale then 'קונים' else 'שוכרים' end),
    '{{buyer}}', case when sale then 'הקונה' else 'השוכר' end),
    '{{fee_line}}', case when sale then 'במכירה: סך של ' || fee || '% מהמחיר הכולל של הנכס'
                         when r.fee_value = 1 then 'בהשכרה: סך של חודש שכירות אחד'
                         else 'בהשכרה: סך של ' || fee || ' חודשי שכירות' end),
    '{{agreement_no}}', r.agreement_no::text),
    '{{order_date}}', to_char(d, 'DD/MM/YYYY')),
    '{{excl_end}}', to_char((d + interval '3 months')::date, 'DD/MM/YYYY'))
  from v
$$;

-- 1a. creating: the property must be active; rent fee up to 12 months.
-- A wrapper around 014's function, so its logic stays in one place.
do $$ begin   -- rename once (safe to run this file again)
  if to_regprocedure('public.signing_create_014(jsonb)') is null then
    alter function public.signing_create(jsonb) rename to signing_create_014; end if;
  if to_regprocedure('public.signing_public_get_014(text)') is null then
    alter function public.signing_public_get(text) rename to signing_public_get_014; end if;
  if to_regprocedure('public.signing_public_begin_014(text)') is null then
    alter function public.signing_public_begin(text) rename to signing_public_begin_014; end if;
end $$;
revoke execute on function public.signing_create_014(jsonb) from public, anon, authenticated;
create or replace function public.signing_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d owner_deals; v_fee numeric;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  if coalesce(nullif(p->>'kind', ''), 'client_order') = 'owner_order' then
    select * into d from owner_deals where id = (p->>'owner_deal_id')::uuid;
    if not found then raise exception 'הנכס לא נמצא'; end if;
    if d.status <> 'active' then raise exception 'הנכס אינו פעיל' using errcode = '22023'; end if;
    v_fee := nullif(p->>'fee_value', '')::numeric;
    if d.deal_kind = 'rent' and v_fee > 12 then raise exception 'דמי תיווך בהשכרה: עד 12 חודשי שכירות' using errcode = '22023'; end if;
  end if;
  return signing_create_014(p);
end $$;
revoke execute on function public.signing_create(jsonb) from public, anon;
grant execute on function public.signing_create(jsonb) to authenticated;

-- 1b. signing: an unsigned owner agreement whose property is no longer active is cancelled on open / submit
create or replace function public.owner_order_stale(p_token text) returns void
language sql security definer set search_path = public as $$
  update signing_requests r set status = 'cancelled'
  from owner_deals d
  where r.token = p_token and r.kind = 'owner_order' and r.status in ('sent', 'opened')
    and d.id = r.owner_deal_id and d.status <> 'active'
$$;
revoke execute on function public.owner_order_stale(text) from public, anon, authenticated;

revoke execute on function public.signing_public_get_014(text), public.signing_public_begin_014(text) from public, anon, authenticated;

create or replace function public.signing_public_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin perform owner_order_stale(p_token); return signing_public_get_014(p_token); end $$;
create or replace function public.signing_public_begin(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin perform owner_order_stale(p_token); return signing_public_begin_014(p_token); end $$;

revoke execute on function public.signing_public_get(text), public.signing_public_begin(text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.signing_public_get(text), public.signing_public_begin(text), public.owner_order_stale(text),
      public.signing_public_get_014(text), public.signing_public_begin_014(text) to service_role;
  end if;
end $$;
