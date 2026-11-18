-- Prime Location CRM – migration 010: signing round 2. Run AFTER 009. Safe to run twice. Additive: nothing is deleted.
--  • Broker cooperation agreement ("הסכם שת״פ בין מתווכים"): 3 types + notes, signed by the other broker (with licence)
--  • Sending to an existing lead, or a new client by name + phone only → a draft lead ("טיוטה") Leah completes later
--  • Email + WhatsApp to Leah after every signature (sent by the Edge Function; addresses live here, keys in Supabase secrets)

-- ── settings ──
insert into public.app_settings (key, value) values
  ('notify_email', '"liaherez@gmail.com"'), ('notify_whatsapp', '"972505544524"'),
  ('app_url', '"https://waives-io.github.io/prime-location-crm/"')
on conflict (key) do nothing;

-- ── drafts: a lead created from a signing, with only a name and a phone ──
alter table public.lead_deals add column if not exists is_draft boolean not null default false;

-- ── agreement kinds ──
alter table public.agreement_templates add column if not exists kind text not null default 'client_order';
alter table public.agreement_templates drop constraint if exists agreement_templates_kind_check;
alter table public.agreement_templates add constraint agreement_templates_kind_check check (kind in ('client_order', 'broker_coop'));
drop index if exists public.agreement_templates_one_active;
create unique index if not exists agreement_templates_one_active_kind on public.agreement_templates (kind) where is_active;
alter table public.agreement_templates drop constraint if exists agreement_templates_version_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agreement_templates_kind_version_key') then
    alter table public.agreement_templates add constraint agreement_templates_kind_version_key unique (kind, version);
  end if;
end $$;

create or replace function public.agreement_templates_frozen() returns trigger language plpgsql as $$
begin
  if (new.kind, new.version, new.title, new.body, new.broker_name, new.broker_license, new.office_name, new.fee_sale_text, new.fee_rent_text)
     is distinct from (old.kind, old.version, old.title, old.body, old.broker_name, old.broker_license, old.office_name, old.fee_sale_text, old.fee_rent_text) then
    raise exception 'נוסח הסכם שמור אינו ניתן לשינוי. יש להוסיף גרסה חדשה.';
  end if;
  return new;
end $$;

-- {{split}} is replaced by the cooperation type Leah picks, and her notes (percentages)
insert into public.agreement_templates (kind, version, title, body, broker_name, broker_license, office_name, is_active)
values ('broker_coop', 1, 'הסכם שת"פ בין מתווכים', $body$1. כל אחד מהצדדים מצהיר ומתחייב בזאת כדלקמן:
1.1 למלא אחר הסכם זה, על כל הוראותיו בתום לב, בנאמנות, במקצועיות בהגינות ובשקיפות מלאה לצורך שיתוף פעולה פורה.
1.2 הוא בעל רישיון תיווך בתוקף, אשר ניתן כדין במדינת ישראל ומורשה לעסוק בתיווך מקרקעין בהתאם להוראות כל דין, וכי ככל שיכול שינוי כלשהו באמור, הוא יעדכן את הצד השני באופן מידי, דבר שיביא הסכם זה לסיומו.
1.3 להחתים את לקוחותיו על הזמנת שירותי תיווך בהתאם להוראות הדין, לרבות בהתאם לחוק המתווכים במקרקעין, תשנ"ו-1996 ולתקנות המתווכים במקרקעין (פרטי הזמנה בכתב), תשנ"ז- 1997.
2. האחריות לגביית דמי התיווך מהלקוחות תחול על כל צד בנפרד.
3. דמי התיווך ו/או כל עמלה אחרת אשר יגבו מהקונה והמוכר, יחולקו בין מתווך הקונה למתווך המוכר באופן הבא (להלן: "העמלה"):
{{split}}
4. בהתאם לתנאים המפורטים בהסכם זה, ככל שצד אחד יהיה חייב בתשלום לצד השני, יעביר צד זה את התשלום תוך 14 ימים מיום חתימה על הסכם מכר ו/או התחייבות לביצוע עסקה (המוקדם מבניהם) וזאת כנגד חשבונית מס כחוק. מובהר כי לכל תשלום יתווסף מע״מ כחוק.
5. ככל וצד ייתן הנחה ללקוחו, יופחת סכום ההנחה מחלקו של אותו צד בעמלה אלא אם סוכם אחרת בין הצדדים מראש ובכתב.
6. מוסכם כי די במסירת הפרטים על הנכס ו/או הלקוח על מנת שהצדדים יחלקו בדמי התיווך כמפורט בסעיף 3 לעיל.
7. ביקורים בנכס יתואמו ע"י מתווך המוכר ו/או מי מטעמו בלבד.
8. כל קשר עם בעל הנכס / הקונה, או נציגיהם (לרבות העברת כל פניה), יהיה באמצעות המתווך המייצג הרלוונטי בלבד.
9. הצדדים לא ימסרו לכל צד שלישי פרטים אודות שיתוף הפעולה (לרבות עצם שיתוף הפעולה), ולא ימסרו לכל צד שלישי פרטים אודות הקונה, הנכס או בעל הנכס, ולא יבצעו כל פרסום ביחס לנכס בשום מקור פרסומי, אלא אם הצד הרלוונטי נתן הסכמתו לכך מראש ובכתב.
10. הסכם זה יהיה בתוקף החל ממועד חתימתו ועד לתום תקופת הבלעדיות בנכס (ככל שקיימת תקופה כאמור), או עם פרסום הנכס ברבים על ידי בעל הנכס (או מי מטעמו), או למשך תקופה אחרת ככל שיקבעו כך הצדדים (להלן: "תקופת ההתקשרות").
11. למען הסר ספק, הצדדים ימשיכו להיות חייבים בשיתוף פעולה בנוגע למתעניינים שהנכס הוצג בפניהם כתוצאה או במסגרת הסכם זה, גם לאחר סיומו של ההסכם.
12. אם אחד מהצדדים יצרף מטעמו מתווך / גורם נוסף, ללא הסכמת הצד השני, אותו צד והגורם הנוסף ייחשבו כצד אחד לעניין חלוקת העמלה, וזאת מבלי לגרוע מהזכויות הנתונות לצד השני בהתאם להוראות הסכם זה והוראות כל דין.
13. מבלי לגרוע מהאמור, במשך תקופת ההתקשרות, מתווך הקונה לא יפנה לבעל הנכס, ומתווך המוכר לא יפנה לקונה, בהצעות לעסקאות אחרות.
14. במידה וצד כלשהו יפר הוראות הסכם זה, יהא חייב הצד המפר לשלם לצד הנפגע פיצויים מוסכמים בסך העמלה שהצד הנפגע היה צריך לקבל כאמור בסעיף 3 לעיל.
15. מסמך זה יביא לסיומה של כל התחייבות קודמת/קיימת בין הצדדים הסותרת התחייבויותיהם עפ"י הסכם זה.
16. בהסכם זה לשון יחיד משמעותה גם לשון רבים ולהיפך ולשון זכר משמעותה גם לשון נקבה ולהיפך, הכל לפי העניין.$body$,
'ליאה ארז', '3156857', 'פריים לוקיישן', true)
on conflict (kind, version) do nothing;

-- ── requests: kind, cooperation terms, broker licence, the lead it belongs to, notification log ──
alter table public.signing_requests add column if not exists kind text not null default 'client_order';
alter table public.signing_requests drop constraint if exists signing_requests_kind_check;
alter table public.signing_requests add constraint signing_requests_kind_check check (kind in ('client_order', 'broker_coop'));
alter table public.signing_requests add column if not exists coop_type text;
alter table public.signing_requests drop constraint if exists signing_requests_coop_check;
alter table public.signing_requests add constraint signing_requests_coop_check
  check ((kind = 'broker_coop') = (coop_type is not null) and (coop_type is null or coop_type in ('shared', 'each_side', 'referral')));
alter table public.signing_requests add column if not exists coop_notes text;
alter table public.signing_requests add column if not exists signer_license text;
alter table public.signing_requests add column if not exists lead_deal_id uuid references public.lead_deals(id) on delete set null;
alter table public.signing_requests add column if not exists notified_email_at timestamptz;
alter table public.signing_requests add column if not exists notified_whatsapp_at timestamptz;
alter table public.signing_requests add column if not exists notify_error text;

-- the agreement text as the signer reads it (cooperation type + notes in section 3)
create or replace function public.signing_body(r public.signing_requests, t public.agreement_templates) returns text
language sql stable set search_path = public as $$
  select replace(t.body, '{{split}}',
    case r.coop_type when 'shared' then 'קופה משותפת' when 'each_side' then 'כל אחד מהצד שלו' when 'referral' then 'הפניה' else '' end
    || case when nullif(btrim(coalesce(r.coop_notes, '')), '') is not null then E'\nהערות (אחוזים): ' || btrim(r.coop_notes) else '' end)
$$;
create or replace function public.signing_kind_label(k text) returns text language sql immutable as $$
  select case k when 'broker_coop' then 'הסכם שת״פ' else 'הזמנת שירותי תיווך' end
$$;

-- Leah: create a request. Client: p.lead_id (an existing lead) OR p.contact {phone, name} (a new client → a draft lead).
-- Broker: p.kind = 'broker_coop', p.coop_type, p.coop_notes, p.contact {phone, name} (saved as a broker contact).
create or replace function public.signing_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d owner_deals; t agreement_templates; v_contact uuid; v_phone text; v_name text; v_token text; v_no int;
  v_kind text := coalesce(nullif(p->>'kind', ''), 'client_order'); v_coop text := nullif(p->>'coop_type', '');
  v_teaser text := nullif(btrim(coalesce(p->>'teaser_text', '')), ''); v_part text; v_purpose text; r signing_requests;
  v_lead uuid; v_draft boolean := false; v_need uuid; v_lpurp uuid;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  if v_kind not in ('client_order', 'broker_coop') then raise exception 'סוג הסכם לא מוכר' using errcode = '22023'; end if;
  if v_kind = 'broker_coop' and (v_coop is null or v_coop not in ('shared', 'each_side', 'referral')) then
    raise exception 'יש לבחור סוג שת״פ' using errcode = '22023'; end if;
  if v_kind = 'client_order' then v_coop := null; end if;
  select * into d from owner_deals where id = (p->>'owner_deal_id')::uuid;
  if not found then raise exception 'הנכס לא נמצא'; end if;
  select * into t from agreement_templates where is_active and kind = v_kind;
  if not found then raise exception 'אין נוסח הסכם פעיל'; end if;
  select value into v_purpose from option_lists where id = d.purpose_id;
  foreach v_part in array address_parts(d.address) loop
    if position(lower(v_part) in lower(concat_ws(' ', v_teaser, v_purpose))) > 0 then
      raise exception 'טקסט הנכס מכיל את הכתובת: %', v_part using errcode = '22023';
    end if;
  end loop;

  if v_kind = 'client_order' and nullif(p->>'lead_id', '') is not null then
    select id, contact_id into v_lead, v_contact from lead_deals where id = (p->>'lead_id')::uuid;
    if v_lead is null then raise exception 'המתעניין לא נמצא'; end if;
  else
    v_phone := normalize_phone(p->'contact'->>'phone');
    if v_phone is null then raise exception 'מספר נייד לא תקין' using errcode = '22023'; end if;
    select id into v_contact from contacts where phone = v_phone;
    if v_contact is null then
      v_name := nullif(btrim(coalesce(p->'contact'->>'name', '')), '');
      if v_name is null then raise exception 'חסר שם' using errcode = '22023'; end if;
      v_contact := upsert_contact(jsonb_build_object('v', 2, 'phone', v_phone, 'name', v_name,
                                  'entity_type', case when v_kind = 'broker_coop' then 'broker' else 'private' end));
    end if;
    if v_kind = 'client_order' then
      select id into v_lead from lead_deals where contact_id = v_contact order by (status = 'active') desc, created_at desc limit 1;
      if v_lead is null then   -- a new client: a draft lead with what the property already tells us
        select id into v_need from option_lists where list_key = 'lead_need' and not hidden
          and value = case d.deal_kind when 'sale' then 'לקנות' when 'rent' then 'לשכור' end limit 1;
        select id into v_lpurp from option_lists where list_key = 'lead_purpose' and not hidden and value = v_purpose limit 1;
        insert into lead_deals (contact_id, lead_date, need_id, need_ids, purpose_id, purpose_ids, notes, is_draft)
        values (v_contact, current_date, v_need, coalesce(array_remove(array[v_need], null), '{}'), v_lpurp,
                coalesce(array_remove(array[v_lpurp], null), '{}'), 'נוצר מהחתמה על נכס: ' || coalesce(d.address, ''), true)
        returning id into v_lead;
        v_draft := true;
      end if;
    end if;
  end if;

  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_no := nextval('agreement_no_seq');
  insert into signing_requests (token, agreement_no, owner_deal_id, contact_id, template_id, template_version, teaser_snapshot, address_snapshot,
                                kind, coop_type, coop_notes, lead_deal_id)
  values (v_token, v_no, d.id, v_contact, t.id, t.version,
          jsonb_build_object('purpose', v_purpose, 'built_sqm', d.built_sqm, 'plot_sqm', d.plot_sqm, 'deal_kind', d.deal_kind,
                             'sale_price', case when d.deal_kind = 'sale' then d.asking_price end,
                             'monthly_rent', case when d.deal_kind = 'rent' then d.asking_price end,
                             'teaser_text', v_teaser),
          d.address, v_kind, v_coop, nullif(btrim(coalesce(p->>'coop_notes', '')), ''), v_lead)
  returning * into r;
  insert into notifications (type, title, body, link, signing_request_id)
  values ('signing_sent', 'נוצר קישור להחתמה עבור ' || (select name from contacts where id = v_contact),
          concat_ws(' · ', signing_kind_label(v_kind) || ' ' || v_no, v_purpose), '#/m/owner/' || d.id, r.id);
  return jsonb_build_object('id', r.id, 'token', r.token, 'agreement_no', r.agreement_no, 'contact_id', v_contact,
                            'lead_id', v_lead, 'draft_created', v_draft);
end $$;

-- ── public side (service role only) ──
create or replace function public.signing_public_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r signing_requests; t agreement_templates; v_phone jsonb;
begin
  select * into r from signing_requests where token = p_token for update;
  if not found then return jsonb_build_object('state', 'not_found'); end if;
  select value into v_phone from app_settings where key = 'office_phone';
  select * into t from agreement_templates where id = r.template_id;
  if r.status = 'signed' and greatest(r.expires_at, r.signed_at + interval '30 days') < now() then
    return jsonb_build_object('state', 'expired', 'office', jsonb_build_object('broker_name', t.broker_name, 'phone', v_phone));
  end if;
  if r.status in ('sent', 'opened') and r.expires_at < now() then
    update signing_requests set status = 'expired' where id = r.id returning * into r;
  end if;
  if r.status in ('cancelled', 'expired') then
    return jsonb_build_object('state', r.status, 'office', jsonb_build_object('broker_name', t.broker_name, 'phone', v_phone));
  end if;
  if r.status = 'sent' then
    update signing_requests set status = 'opened', first_opened_at = now() where id = r.id returning * into r;
  end if;
  return jsonb_build_object(
    'state', case when r.status = 'signed' then 'signed' else 'open' end, 'kind', r.kind,
    'office', jsonb_build_object('office_name', t.office_name, 'broker_name', t.broker_name, 'broker_license', t.broker_license, 'phone', v_phone),
    'agreement_no', r.agreement_no, 'title', t.title, 'body', signing_body(r, t),
    'teaser', r.teaser_snapshot,
    'request_id', r.id, 'pdf_path', case when r.status = 'signed' then r.pdf_path end,
    'address', case when r.status = 'signed' then r.address_snapshot end);
end $$;

create or replace function public.signing_public_begin(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r signing_requests; t agreement_templates;
begin
  select * into r from signing_requests where token = p_token for update;
  if not found then return jsonb_build_object('state', 'not_found'); end if;
  if r.status in ('sent', 'opened') and r.expires_at < now() then
    update signing_requests set status = 'expired' where id = r.id returning * into r;
  end if;
  if r.status <> 'opened' and r.status <> 'sent' then return jsonb_build_object('state', r.status); end if;
  if r.attempts_window_at is null or r.attempts_window_at < now() - interval '1 hour' then
    update signing_requests set submit_attempts = 1, attempts_window_at = now() where id = r.id;
  elsif r.submit_attempts >= 10 then
    return jsonb_build_object('state', 'rate_limited');
  else
    update signing_requests set submit_attempts = submit_attempts + 1 where id = r.id;
  end if;
  select * into t from agreement_templates where id = r.template_id;
  return jsonb_build_object('state', 'ok', 'request', to_jsonb(r) - 'token', 'template', to_jsonb(t),
                            'body', signing_body(r, t), 'now', now());
end $$;

create or replace function public.signing_public_complete(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r signing_requests; v_name text;
begin
  update signing_requests set
    status = 'signed', signed_at = (p->>'signed_at')::timestamptz,
    signer_full_name = p->>'full_name', signer_id_number = p->>'id_number', signer_home_address = p->>'home_address',
    signer_license = nullif(p->>'license', ''),
    consent_accepted = true, signature_png_path = p->>'signature_png_path', pdf_path = p->>'pdf_path', pdf_sha256 = p->>'pdf_sha256',
    signer_ip = p->>'ip', signer_user_agent = left(p->>'user_agent', 400)
  where id = (p->>'id')::uuid and status in ('sent', 'opened') and expires_at >= now()
  returning * into r;
  if not found then return jsonb_build_object('state', 'already'); end if;
  select name into v_name from contacts where id = r.contact_id;
  if r.kind = 'broker_coop' and r.signer_license is not null then   -- remember the broker's licence on the contact
    update contacts set broker_license = r.signer_license where id = r.contact_id and entity_type = 'broker' and broker_license is null;
  end if;
  insert into notifications (type, title, body, link, signing_request_id)
  values ('signing_signed', r.signer_full_name || ' חתם/ה על ' || case when r.kind = 'broker_coop' then 'הסכם שת״פ' else 'הזמנת התיווך' end,
          concat_ws(' · ', 'הסכם ' || r.agreement_no, r.teaser_snapshot->>'purpose', 'נשלח ל' || v_name), '#/m/owner/' || r.owner_deal_id, r.id);
  return jsonb_build_object('state', 'signed', 'address', r.address_snapshot, 'pdf_path', r.pdf_path);
end $$;

-- what the Edge Function needs to tell Leah about a signature, and where to send it
create or replace function public.signing_public_notify_info(p_id uuid) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('request', to_jsonb(r) - 'token', 'contact_name', c.name, 'contact_phone', c.phone,
    'kind_label', signing_kind_label(r.kind),
    'email', (select value #>> '{}' from app_settings where key = 'notify_email'),
    'whatsapp', (select value #>> '{}' from app_settings where key = 'notify_whatsapp'),
    'app_url', (select value #>> '{}' from app_settings where key = 'app_url'))
  from signing_requests r join contacts c on c.id = r.contact_id where r.id = p_id
$$;
create or replace function public.signing_public_notified(p_id uuid, p_channel text, p_error text) returns void
language sql security definer set search_path = public as $$
  update signing_requests set
    notified_email_at    = case when p_channel = 'email'    and p_error is null then now() else notified_email_at end,
    notified_whatsapp_at = case when p_channel = 'whatsapp' and p_error is null then now() else notified_whatsapp_at end,
    notify_error = case when p_error is null then notify_error else left(concat_ws(' | ', notify_error, p_channel || ': ' || p_error), 1000) end
  where id = p_id
$$;

revoke execute on function public.signing_body(public.signing_requests, public.agreement_templates), public.signing_kind_label(text),
  public.signing_public_notify_info(uuid), public.signing_public_notified(uuid, text, text),
  public.signing_public_get(text), public.signing_public_begin(text), public.signing_public_complete(jsonb) from public, anon, authenticated;
revoke execute on function public.signing_create(jsonb) from public, anon;
grant execute on function public.signing_create(jsonb) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.signing_public_get(text), public.signing_public_begin(text), public.signing_public_complete(jsonb),
      public.signing_public_notify_info(uuid), public.signing_public_notified(uuid, text, text),
      public.signing_body(public.signing_requests, public.agreement_templates), public.signing_kind_label(text) to service_role;
  end if;
end $$;
-- signing_create (security definer) calls signing_kind_label as its owner, so authenticated needs no grant on it

-- saving a lead from the form completes a draft (same function as 008, plus is_draft = false)
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
  return jsonb_build_object('id', v_id, 'contact_id', v_contact);
end $$;

revoke execute on function public.save_lead_deal(jsonb) from public, anon;
grant execute on function public.save_lead_deal(jsonb) to authenticated;
