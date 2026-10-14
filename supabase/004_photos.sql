-- Prime Location CRM – migration 004: deal photos (up to 5 per deal). Run AFTER 002. Safe to re-run.
-- Additive only. The existing save RPCs are NOT changed: photos are saved by their own RPC, so an older
-- app version that does not know about photos can never erase them.

-- ───────────── columns ─────────────
alter table public.lead_deals  add column if not exists photos jsonb not null default '[]'::jsonb;
alter table public.owner_deals add column if not exists photos jsonb not null default '[]'::jsonb;
alter table public.lead_deals  drop constraint if exists lead_deals_photos_check;
alter table public.owner_deals drop constraint if exists owner_deals_photos_check;
alter table public.lead_deals  add constraint lead_deals_photos_check
  check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 5);
alter table public.owner_deals add constraint owner_deals_photos_check
  check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 5);

-- ───────────── save photos of one deal ─────────────
-- p_photos: [{ "path": "<deal id>/<uuid>.jpg", "thumb": "<deal id>/<uuid>_t.jpg", "w": 1600, "h": 1200 }, …]
create or replace function public.set_deal_photos(p_module text, p_id uuid, p_photos jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare e jsonb; v_prefix text := p_id::text || '/'; v_old jsonb;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  if p_module not in ('lead', 'owner') then raise exception 'מודול לא תקין' using errcode = '22023'; end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' then raise exception 'רשימת תמונות לא תקינה' using errcode = '22023'; end if;
  if jsonb_array_length(p_photos) > 5 then raise exception 'אפשר לשמור עד 5 תמונות' using errcode = '22023'; end if;
  for e in select value from jsonb_array_elements(p_photos) loop
    if jsonb_typeof(e) <> 'object'
       or coalesce(e->>'path', '') !~ ('^' || p_id::text || '/[0-9a-f-]+\.(jpg|webp)$')
       or coalesce(e->>'thumb', '') !~ ('^' || p_id::text || '/[0-9a-f-]+_t\.(jpg|webp)$') then
      raise exception 'נתיב תמונה לא תקין' using errcode = '22023';
    end if;
  end loop;
  if p_module = 'lead' then
    select photos into v_old from lead_deals where id = p_id;
    if not found then raise exception 'העסקה לא נמצאה' using errcode = 'P0002'; end if;
    update lead_deals set photos = p_photos where id = p_id;
  else
    select photos into v_old from owner_deals where id = p_id;
    if not found then raise exception 'העסקה לא נמצאה' using errcode = 'P0002'; end if;
    update owner_deals set photos = p_photos where id = p_id;
  end if;
  return jsonb_build_object('id', p_id, 'previous', v_old);
end $$;

revoke execute on function public.set_deal_photos(text, uuid, jsonb) from public, anon;
grant execute on function public.set_deal_photos(text, uuid, jsonb) to authenticated;

-- ───────────── private storage bucket ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deal-photos', 'deal-photos', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Only CRM members can see, upload or delete photos; anon and other logged-in accounts get nothing.
drop policy if exists deal_photos_select on storage.objects;
drop policy if exists deal_photos_insert on storage.objects;
drop policy if exists deal_photos_delete on storage.objects;
create policy deal_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'deal-photos' and public.is_member());
create policy deal_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'deal-photos' and public.is_member());
create policy deal_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'deal-photos' and public.is_member());
