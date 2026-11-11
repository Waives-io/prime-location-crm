-- 009: brokerage-order signing ("הזמנת שירותי תיווך").
-- Leah sends a client a link for one property. Before signing the client sees the teaser only (never the address);
-- after signing the address and a signed PDF. All public traffic goes through the Edge Function "signing-public",
-- which calls the signing_public_* functions below with the service role. anon reaches no table and no function here.
-- Safe to run twice.

create extension if not exists pgcrypto with schema extensions;

-- settings (agreement numbers continue Teaser's: the first one is agreement_no_start)
create table if not exists public.app_settings (key text primary key, value jsonb not null);
insert into public.app_settings (key, value) values
  ('agreement_no_start', '76773'),
  ('office_phone', 'null')            -- Leah's mobile for the signing page (call / WhatsApp). Set with: update app_settings set value = '"050-0000000"' where key = 'office_phone';
on conflict (key) do nothing;
create sequence if not exists public.agreement_no_seq start 76773;

create table if not exists public.agreement_templates (
  id             uuid primary key default gen_random_uuid(),
  version        int  not null unique,
  title          text not null,
  body           text not null,
  broker_name    text not null,
  broker_license text not null,
  office_name    text not null,
  fee_sale_text  text,
  fee_rent_text  text,
  is_active      boolean not null default false,
  created_at     timestamptz not null default now()
);
create unique index if not exists agreement_templates_one_active on public.agreement_templates (is_active) where is_active;

insert into public.agreement_templates (version, title, body, broker_name, broker_license, office_name, fee_sale_text, fee_rent_text, is_active)
values (1, 'הסכם הזמנת שירותי תיווך לקניית והשכרת נכס',
$body$הלקוח מזמין בזאת שרותי תיווך מקרקעין מחברת פריים לוקיישן הידועה בשם פריים לוקיישן (להלן: "משרד התיווך") באמצעות המתווך שפרטיו מפורטים לעיל ו/או כל מתווך מורשה אחר מטעם משרד התיווך (כולם ביחד יקראו להלן: "המתווך"), על מנת לקבל שרותי תיווך לצורך קניה ו/או שכירות של הנכס שפרטיו מפורטים לעיל (להלן: "הנכס").
הלקוח מצהיר בזאת כי ביקש מהמתווך לפעול עבורו למציאת נכס לקניה/להשכרה, ומתחייב לשלם למתווך את דמי התיווך מיד עם חתימת הסכם מחייב ו/או התחייבות אחרת לביצוע עסקה (המוקדם מבניהם) בינו לבין בעל הנכס ו/או בין כל אדם ו/או גוף אחר שהוא קשור אליו, וזאת לכל המאוחר בתוך 7 (שבעה) ימים מיום חתימת ההסכם או ההתחייבות כאמור.
הזמנת שירותי התיווך מתייחסת לכל עסקה שתעשה ביחס לנכס, גם אם תבוצע עסקה במחיר שונה מהמחיר המבוקש, וכן לכל עסקה אחרת שתתפתח מהזמנה זו.
הלקוח מתחייב לא למסור לגורם כלשהו מידע שקיבל מהמתווך ו/או מי מטעמו בנוגע לנכס, אלא לשם ביצוע העסקה שבנדון.
דמי התיווך המוסכמים הם כדלקמן: בקניה: סך של 2% [מהמחיר הכולל של הנכס]. בהשכרה: סך של 1 חודשי שכירות לכל תשלום כאמור לעיל יתווסף מע״מ לפי שיעורו כחוק (להלן: "דמי התיווך").
הלקוח מצהיר כי המתווך הביא לידיעתו אודות הנכס והוא מתחייב לשתף את המתווך בכל התפתחות בעסקה או במשא ומתן שיתבצע בינו או בין מי מטעמו לבין הצד השני בעסקה או מי מטעמו. כמו כן, הלקוח מתחייב לעדכן את המתווך ככל שהוא מייצג גורם אחר המתעניין בנכס.
מוסכם כי די במסירת פרטי הנכס על מנת שהמתווך יחשב הגורם היעיל בעסקה ויהיה זכאי לדמי התיווך. בפרט, הלקוח מסכים כי גם אם יקבל מידע על הנכס ממקור אחר כלשהו, או כי גם אם הייתה לו היכרות קודמת עם הנכס ו/או בעליו, הדבר לא יגרע מזכאות המתווך לדמי התיווך.
ככל שתחתם עסקה כלשהי ביחס לנכס, בכל דרך שהיא, לרבות אם הלקוח פנה בעצמו ו/או באמצעות מי מטעמו (בין ישירות ובין ע״י צד ג׳) לבעל הנכס, הלקוח עדיין יהיה מחויב בתשלום מלוא דמי התיווך למתווך, וזאת אף אם העסקה תבוצע ע"י צדדים אחרים מטעמו ו/או עם כל צד לו מסר הלקוח פרטים בקשר לנכס, ו/או אם הנכס ירשם על שם אחרים מטעמו.
הלקוח מאשר שנמסר לו ע"י המתווך כי בטרם יתקשר בעסקה כלשהי ביחס לנכס, יהיה עליו לבדוק בעצמו את כל הפרטים הנוגעים לנכס, לרבות את כל הפרטים המהותיים, התכנוניים והמשפטיים, וכי הומלץ לו על ידי המתווך להסתייע בשירותי עורך דין ו/או כל גורם מקצועי אחר לפי העניין והצורך במהלך העסקה.
במידה ודמי התיווך לא ישולמו במועד כמפורט לעיל, ישלם הלקוח למתווך בנוסף הפרשי הצמדה בהתאם למדד המחירים לצרכן בצירוף ריבית מצטברת של 2% לחודש מיום ביצוע העסקה ועד ליום התשלום בפועל. זאת בצירוף כל ההוצאות שיהיו למתווך עקב אי-תשלום במועד.
בהזמנה זו לשון יחיד משמעותה גם לשון רבים ולהיפך ולשון זכר משמעותה גם לשון נקבה ולהיפך, הכל לפי העניין.$body$,
'ליאה ארז', '3156857', 'פריים לוקיישן', 'בקניה: 2% מהמחיר הכולל של הנכס, בתוספת מע״מ', 'בהשכרה: חודש שכירות אחד, בתוספת מע״מ', true)
on conflict (version) do nothing;

-- a saved wording never changes (signed PDFs and open links rely on it); a new wording is a new version row
create or replace function public.agreement_templates_frozen() returns trigger language plpgsql as $$
begin
  if (new.version, new.title, new.body, new.broker_name, new.broker_license, new.office_name, new.fee_sale_text, new.fee_rent_text)
     is distinct from (old.version, old.title, old.body, old.broker_name, old.broker_license, old.office_name, old.fee_sale_text, old.fee_rent_text) then
    raise exception 'נוסח הסכם שמור אינו ניתן לשינוי. יש להוסיף גרסה חדשה.';
  end if;
  return new;
end $$;
drop trigger if exists agreement_templates_frozen on public.agreement_templates;
create trigger agreement_templates_frozen before update on public.agreement_templates for each row execute function public.agreement_templates_frozen();

create table if not exists public.signing_requests (
  id                  uuid primary key default gen_random_uuid(),
  token               text not null unique,               -- 32 random bytes, base64url: the only thing in the public link
  agreement_no        int  not null unique,
  owner_deal_id       uuid not null references public.owner_deals(id),
  contact_id          uuid not null references public.contacts(id),
  template_id         uuid not null references public.agreement_templates(id),
  template_version    int  not null,
  teaser_snapshot     jsonb not null,                     -- what the client sees before signing; never an address
  address_snapshot    text,                               -- returned only after signing
  status              text not null default 'sent' check (status in ('sent', 'opened', 'signed', 'cancelled', 'expired')),
  sent_at             timestamptz not null default now(),
  first_opened_at     timestamptz,
  signed_at           timestamptz,
  expires_at          timestamptz not null default now() + interval '30 days',
  signer_full_name    text,
  signer_id_number    text,
  signer_home_address text,
  consent_accepted    boolean,
  signature_png_path  text,
  pdf_path            text,
  pdf_sha256          text,
  signer_ip           text,
  signer_user_agent   text,
  submit_attempts     int not null default 0,
  attempts_window_at  timestamptz,
  created_by          uuid default auth.uid()
);
create index if not exists signing_requests_deal on public.signing_requests (owner_deal_id);
create index if not exists signing_requests_contact on public.signing_requests (contact_id);

create table if not exists public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  type               text not null check (type in ('signing_sent', 'signing_signed')),
  title              text not null,
  body               text,
  link               text,
  signing_request_id uuid references public.signing_requests(id),
  created_at         timestamptz not null default now(),
  read_at            timestamptz
);

-- RLS: members (Leah) read everything here; every change goes through the functions below. anon: nothing.
alter table public.app_settings        enable row level security;
alter table public.agreement_templates enable row level security;
alter table public.signing_requests    enable row level security;
alter table public.notifications       enable row level security;
revoke all on public.app_settings, public.agreement_templates, public.signing_requests, public.notifications from anon, public;
revoke all on sequence public.agreement_no_seq from anon, public;
grant select on public.app_settings, public.agreement_templates, public.signing_requests, public.notifications to authenticated;
do $$ declare t text; begin
  foreach t in array array['app_settings', 'agreement_templates', 'signing_requests', 'notifications'] loop
    execute format('drop policy if exists member_read on public.%I', t);
    execute format('create policy member_read on public.%I for select to authenticated using (public.is_member())', t);
  end loop;
end $$;

-- private bucket for signed PDFs and signature images; members may read (signed URLs), only the service role writes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signed-agreements', 'signed-agreements', false, 5242880, array['application/pdf', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists signed_agreements_member_read on storage.objects;
create policy signed_agreements_member_read on storage.objects for select to authenticated
  using (bucket_id = 'signed-agreements' and public.is_member());

-- the address parts that must not appear in a teaser: each comma part without the house number ("הגפן", "קריית גת"),
-- and each word of 3+ letters except general words ("אזור", "רחוב"...), so a city is caught even without a comma
create or replace function public.address_parts(a text) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(distinct x) filter (where length(x) >= 2), '{}') from (
    select btrim(regexp_replace(part, '[0-9]+[א-ת]?(?![א-ת])', '', 'g')) as x
    from unnest(regexp_split_to_array(coalesce(a, ''), '\s*,\s*')) as part
    union
    select w from regexp_split_to_table(regexp_replace(coalesce(a, ''), '[^א-תA-Za-z"״׳'' -]', ' ', 'g'), '\s+') as w
    where length(w) >= 3 and w not in ('רחוב', 'רח׳', 'שדרות', 'שד׳', 'דרך', 'אזור', 'התעשייה', 'התעשיה', 'תעשייה', 'תעשיה',
                                       'פארק', 'מתחם', 'קומה', 'בניין', 'בנין', 'מרכז', 'שכונת', 'כיכר', 'סמטת', 'מגרש', 'חלקה', 'גוש')
  ) s
$$;

-- Leah: create a request → {id, token, agreement_no}. Contact: an existing phone is used as it is; a new one is created.
create or replace function public.signing_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d owner_deals; t agreement_templates; v_contact uuid; v_phone text; v_name text; v_token text; v_no int;
  v_teaser text := nullif(btrim(coalesce(p->>'teaser_text', '')), ''); v_part text; v_purpose text; r signing_requests;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  select * into d from owner_deals where id = (p->>'owner_deal_id')::uuid;
  if not found then raise exception 'הנכס לא נמצא'; end if;
  select * into t from agreement_templates where is_active;
  if not found then raise exception 'אין נוסח הסכם פעיל'; end if;
  select value into v_purpose from option_lists where id = d.purpose_id;
  foreach v_part in array address_parts(d.address) loop
    if position(lower(v_part) in lower(concat_ws(' ', v_teaser, v_purpose))) > 0 then
      raise exception 'טקסט הנכס מכיל את הכתובת: %', v_part using errcode = '22023';
    end if;
  end loop;
  v_phone := normalize_phone(p->'contact'->>'phone');
  if v_phone is null then raise exception 'מספר נייד לא תקין' using errcode = '22023'; end if;
  select id into v_contact from contacts where phone = v_phone;
  if v_contact is null then
    v_name := nullif(btrim(coalesce(p->'contact'->>'name', '')), '');
    if v_name is null then raise exception 'חסר שם' using errcode = '22023'; end if;
    v_contact := upsert_contact(jsonb_build_object('v', 2, 'phone', v_phone, 'name', v_name, 'entity_type', 'private'));
  end if;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_no := nextval('agreement_no_seq');
  insert into signing_requests (token, agreement_no, owner_deal_id, contact_id, template_id, template_version, teaser_snapshot, address_snapshot)
  values (v_token, v_no, d.id, v_contact, t.id, t.version,
          jsonb_build_object('purpose', v_purpose, 'built_sqm', d.built_sqm, 'plot_sqm', d.plot_sqm, 'deal_kind', d.deal_kind,
                             'sale_price', case when d.deal_kind = 'sale' then d.asking_price end,
                             'monthly_rent', case when d.deal_kind = 'rent' then d.asking_price end,
                             'teaser_text', v_teaser),
          d.address)
  returning * into r;
  insert into notifications (type, title, body, link, signing_request_id)
  values ('signing_sent', 'ההזמנה נשלחה ל' || (select name from contacts where id = v_contact),
          concat_ws(' · ', 'הסכם ' || v_no, v_purpose), '#/m/owner/' || d.id, r.id);
  return jsonb_build_object('id', r.id, 'token', r.token, 'agreement_no', r.agreement_no, 'contact_id', v_contact);
end $$;

create or replace function public.signing_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  update signing_requests set status = 'cancelled' where id = p_id and status in ('sent', 'opened');
end $$;

create or replace function public.notifications_mark_read() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  update notifications set read_at = now() where read_at is null;
end $$;

-- ── public side (service role only, called by the Edge Function) ──
-- Pre-sign payload: office, agreement no, teaser, agreement text. No address, no coordinates.
create or replace function public.signing_public_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r signing_requests; t agreement_templates; v_phone jsonb;
begin
  select * into r from signing_requests where token = p_token for update;
  if not found then return jsonb_build_object('state', 'not_found'); end if;
  select value into v_phone from app_settings where key = 'office_phone';
  if r.status = 'signed' and greatest(r.expires_at, r.signed_at + interval '30 days') < now() then
    return jsonb_build_object('state', 'expired', 'office', jsonb_build_object('broker_name', (select broker_name from agreement_templates where id = r.template_id), 'phone', v_phone));
  end if;
  select * into t from agreement_templates where id = r.template_id;
  if r.status in ('sent', 'opened') and r.expires_at < now() then
    update signing_requests set status = 'expired' where id = r.id returning * into r;
  end if;
  if r.status in ('cancelled', 'expired') then
    return jsonb_build_object('state', r.status, 'office', jsonb_build_object('broker_name', t.broker_name, 'phone', v_phone));
  end if;
  if r.status = 'sent' then
    update signing_requests set status = 'opened', first_opened_at = now() where id = r.id and status = 'sent' returning * into r;
  end if;
  return jsonb_build_object(
    'state', case when r.status = 'signed' then 'signed' else 'open' end,
    'office', jsonb_build_object('office_name', t.office_name, 'broker_name', t.broker_name, 'broker_license', t.broker_license, 'phone', v_phone),
    'agreement_no', r.agreement_no, 'title', t.title, 'body', t.body,
    'teaser', r.teaser_snapshot,
    'request_id', r.id, 'pdf_path', case when r.status = 'signed' then r.pdf_path end,
    'address', case when r.status = 'signed' then r.address_snapshot end);
end $$;

-- before generating the PDF: checks the request can be signed and counts the attempt (max 10 per hour per link)
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
                            'now', now());
end $$;

-- after the PDF is stored: one signature only (a second, parallel submit gets 'already')
create or replace function public.signing_public_complete(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r signing_requests; v_name text;
begin
  update signing_requests set
    status = 'signed', signed_at = (p->>'signed_at')::timestamptz,
    signer_full_name = p->>'full_name', signer_id_number = p->>'id_number', signer_home_address = p->>'home_address',
    consent_accepted = true, signature_png_path = p->>'signature_png_path', pdf_path = p->>'pdf_path', pdf_sha256 = p->>'pdf_sha256',
    signer_ip = p->>'ip', signer_user_agent = left(p->>'user_agent', 400)
  where id = (p->>'id')::uuid and status in ('sent', 'opened') and expires_at >= now()
  returning * into r;
  if not found then return jsonb_build_object('state', 'already'); end if;
  select name into v_name from contacts where id = r.contact_id;
  insert into notifications (type, title, body, link, signing_request_id)
  values ('signing_signed', r.signer_full_name || ' חתם/ה על הזמנת התיווך',
          concat_ws(' · ', 'הסכם ' || r.agreement_no, r.teaser_snapshot->>'purpose', 'נשלח ל' || v_name), '#/m/owner/' || r.owner_deal_id, r.id);
  return jsonb_build_object('state', 'signed', 'address', r.address_snapshot, 'pdf_path', r.pdf_path);
end $$;

revoke execute on function public.signing_create(jsonb), public.signing_cancel(uuid), public.notifications_mark_read(),
  public.signing_public_get(text), public.signing_public_begin(text), public.signing_public_complete(jsonb),
  public.address_parts(text) from public, anon;
grant execute on function public.signing_create(jsonb), public.signing_cancel(uuid), public.notifications_mark_read(),
  public.address_parts(text) to authenticated;
revoke execute on function public.signing_public_get(text), public.signing_public_begin(text), public.signing_public_complete(jsonb) from authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on sequence public.agreement_no_seq to service_role;
    grant execute on function public.signing_public_get(text), public.signing_public_begin(text), public.signing_public_complete(jsonb) to service_role;
  end if;
end $$;
-- signing_create runs as its owner, which may use the sequence
