-- 016: optional email on a contact (shared by leads and owners).
-- Additive only: one new column, nothing deleted. The app only warns about a doubtful address; the server never refuses one.
-- An older app does not send "email", so a stored email is kept.

alter table public.contacts add column if not exists email text;

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
  if jsonb_typeof(p->'contact') = 'object' and (p->'contact') ? 'email' then   -- null or '' clears
    update contacts set email = nullif(left(lower(btrim(p->'contact'->>'email')), 320), '') where id = p_contact;
  end if;
end $$;
revoke execute on function public.apply_deal_extras(text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.apply_deal_extras(text, uuid, uuid, jsonb) to authenticated;
