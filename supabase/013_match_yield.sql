-- 013: a 7th match criterion "מושכר / תשואה (למשקיעים)" (weight key "yield", 0% by default).
-- Additive: nothing is deleted. Adds weights.yield = 0 to the stored settings and lets save_match_settings
-- accept it. An older app that saves the 6 weights keeps the stored yield weight (or 0).

update public.app_settings
   set value = jsonb_set(value, '{weights,yield}', '0'::jsonb)
 where key = 'match_settings' and jsonb_typeof(value->'weights') = 'object' and not (value->'weights' ? 'yield');

create or replace function public.save_match_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w jsonb := p->'weights'; m jsonb := p->'must'; c jsonb := p->'colors'; k text; v int; s int := 0; v_clean jsonb;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  if coalesce((p->>'version')::int, 0) <> 1 or jsonb_typeof(w) <> 'object' or jsonb_typeof(m) <> 'object' then
    raise exception 'הגדרות לא תקינות' using errcode = '22023'; end if;
  if not (w ? 'yield') then   -- older app (6 weights): keep the stored yield weight
    w := w || jsonb_build_object('yield', coalesce((select (value->'weights'->>'yield')::int from app_settings where key = 'match_settings'), 0));
  end if;
  if (select count(*) from jsonb_object_keys(w)) <> 7 or (select count(*) from jsonb_object_keys(m)) <> 4 then
    raise exception 'הגדרות לא תקינות' using errcode = '22023'; end if;
  foreach k in array array['category', 'area', 'purpose', 'size', 'budget', 'height', 'yield'] loop
    if jsonb_typeof(w->k) is distinct from 'number' then raise exception 'משקל חסר: %', k using errcode = '22023'; end if;
    v := (w->>k)::int;
    if v < 0 or v > 100 or (w->>k)::numeric <> v then raise exception 'משקל לא תקין: %', k using errcode = '22023'; end if;
    s := s + v;
  end loop;
  if s <> 100 then raise exception 'סכום המשקלים חייב להיות 100 (עכשיו %)', s using errcode = '22023'; end if;
  foreach k in array array['deal_type', 'category', 'area', 'purpose'] loop
    if jsonb_typeof(m->k) is distinct from 'boolean' then raise exception 'תנאי חובה לא תקין: %', k using errcode = '22023'; end if;
  end loop;
  if c is null or jsonb_typeof(c) = 'null' then   -- older app: keep what is stored
    c := coalesce((select value->'colors' from app_settings where key = 'match_settings'), '{"green":75,"yellow":50}'::jsonb);
  else
    if jsonb_typeof(c) <> 'object' or (select count(*) from jsonb_object_keys(c)) <> 2 then
      raise exception 'צבעים לא תקינים' using errcode = '22023'; end if;
    foreach k in array array['green', 'yellow'] loop
      if jsonb_typeof(c->k) is distinct from 'number' or (c->>k)::numeric <> (c->>k)::numeric::int
         or (c->>k)::int < 0 or (c->>k)::int > 100 then
        raise exception 'צבע לא תקין: %', k using errcode = '22023'; end if;
    end loop;
    if (c->>'green')::int <= (c->>'yellow')::int then
      raise exception 'הירוק צריך להתחיל מעל הצהוב' using errcode = '22023'; end if;
  end if;
  v_clean := jsonb_build_object('version', 1, 'weights', w, 'must', m,
    'colors', jsonb_build_object('green', (c->>'green')::int, 'yellow', (c->>'yellow')::int));
  insert into app_settings (key, value) values ('match_settings', v_clean)
  on conflict (key) do update set value = excluded.value;
  return v_clean;
end $$;
