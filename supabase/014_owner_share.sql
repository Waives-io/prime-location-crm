-- Prime Location CRM – migration 014. Run AFTER 013. Safe to run twice. Additive: nothing is deleted.
--  • "החתמת בעלים": the property owner signs a brokerage order + 3 months exclusivity (Leah's previous wording, 2 pages).
--    Same document for sale or rent; Leah fills the brokerage fee; the owner fills ת.ז. / ח.פ. and address, and signs once.
--  • "שיתוף נכס": a link for a lead to a small property page (chosen photos, purpose, size, deal type, price).
--    Never the address, the owner's name or the description.
--  • A lead's search radius: up to 40 km (was 20).

-- ── 1. the owner agreement ──
alter table public.agreement_templates drop constraint if exists agreement_templates_kind_check;
alter table public.agreement_templates add constraint agreement_templates_kind_check check (kind in ('client_order', 'broker_coop', 'owner_order'));

-- {{deal_l}} להשכרת/למכירת · {{deal_n}} השכרה/מכירה · {{deal_c}} השכרת/מכירת · {{buyers}} שוכרים/קונים · {{buyer}} השוכר/הקונה
-- {{fee_line}} the fee Leah fills · {{agreement_no}} · {{order_date}} signing date · {{excl_end}} signing date + 3 months
-- A line starting with "## " starts the second page (the exclusivity agreement).
insert into public.agreement_templates (kind, version, title, body, broker_name, broker_license, office_name, is_active)
values ('owner_order', 1, 'הסכם הזמנת שירותי תיווך {{deal_l}} נכס', $body$1. הלקוח מזמין בזאת שרותי תיווך מקרקעין מחברת פריים לוקיישן הידועה בשם פריים לוקיישן (להלן: "משרד התיווך") באמצעות המתווך שפרטיו מפורטים לעיל ו/או כל מתווך מורשה אחר מטעם משרד התיווך (כולם ביחד יקראו להלן: "המתווך"), על מנת לקבל שרותי תיווך לצורך {{deal_n}} של הנכס המפורט לעיל (להלן: "הנכס").
2. הלקוח מצהיר בזאת כי הוא המחזיק החוקי ובעל מלוא הזכויות בנכס ו/או שהינו מוסמך מטעם בעלי הזכויות בנכס לצורך {{deal_c}} הנכס.
3. הלקוח מצהיר בזאת כי ביקש מהמתווך לפעול למציאת {{buyers}} לנכס ומתחייב לשלם למתווך את דמי התיווך מיד עם חתימת הסכם מחייב ו/או התחייבות אחרת לביצוע עסקה (המוקדם מבניהם), בינו לבין כל גורם אשר הנכס הוצג בפניו ו/או שנודע לו עליו מהמתווך (או ממי מטעמו, בין ישירות ובין ע"י צד ג'), או שהגיע ללקוח כתוצאה מפעולות המתווך, וזאת לכל המאוחר בתוך 7 (שבעה) ימים מיום חתימת ההסכם או ההתחייבות כאמור.
4. דמי התיווך המוסכמים הם כדלקמן:
{{fee_line}}
לכל תשלום כאמור לעיל יתווסף מע״מ לפי שיעורו כחוק (להלן: "דמי התיווך").
5. מוסכם כי די במסירת פרטי הנכס ללקוחות המתווך על מנת שהמתווך יחשב הגורם היעיל בעסקה ויהיה זכאי לדמי התיווך.
6. הלקוח מתחייב ליידע ולשתף את המתווך בכל התפתחות בעסקה או במשא ומתן שיתבצע בינו לבין כל גורם אשר הנכס הוצג בפניו ו/או שנודע לו עליו מהמתווך ו/או מי מטעמו (בין ישירות ובין ע"י צד ג'). מובהר בזאת, כי גם אם הלקוח בחר שלא לשתף את המתווך במהלכי העסקה כאמור, הלקוח יחויב בתשלום דמי התיווך.
7. הזמנת שירותי התיווך מתייחסת לכל עסקה שתעשה ביחס לנכס ו/או לחלקים ממנו גם אם תבוצע עסקה במחיר שונה מהמחיר המבוקש, ולכל עסקה שתתפתח מהזמנה זו.
8. הלקוח מאשר שהומלץ לו על ידי המתווך להסתייע בשירותי עורך דין ו/או כל גורם מקצועי אחר לפי העניין והצורך במהלך העסקה.
9. הלקוח מצהיר כי כל הפרטים של הנכס שהועברו למתווך, נמסרו על ידו והם מלאים ונכונים.
10. ככל שדמי התיווך לא ישולמו במועד כמפורט לעיל, ישלם הלקוח למתווך בנוסף הפרשי הצמדה בהתאם למדד המחירים לצרכן בצירוף ריבית מצטברת של 2% לחודש מיום ביצוע העסקה ועד ליום התשלום בפועל. זאת בצירוף כל ההוצאות שיהיו למתווך עקב אי-תשלום במועד.
11. בהסכם זה לשון יחיד משמעותה גם לשון רבים ולהיפך, ולשון זכר משמעותה גם לשון נקבה ולהיפך, הכל לפי העניין.
## הסכם הזמנת שירותי תיווך בבלעדיות
1. הסכם זה מתייחס לנכס שפרטיו רשומים בהזמנת שירותי התיווך מספר {{agreement_no}} מיום {{order_date}} ואשר מהווה חלק בלתי נפרד מהסכם זה (להלן: "הזמנת שירותי התיווך").
2. הלקוח מסמיך את המתווך לפעול עבורו באופן בלעדי לשיווק הנכס כדי למצוא {{buyers}} לתקופה מיום {{order_date}} ועד ליום {{excl_end}} (להלן: "תקופת הבלעדיות"), כך שהמתווך יהיה הגורם היחיד שיפעל לקידום {{deal_c}} הנכס, ובהתאם כל פנייה ו/או עסקה שתבוצע ביחס לנכס תחשב כתוצאה של פעילות ויעילות המתווך בלבד.
3. בתקופת הבלעדיות פרסום הנכס ייעשה על ידי המתווך ו/או מי מטעמו בלבד ועל חשבונו תוך הפעלת 2 או יותר מהאמצעים הבאים, לפי הצורך: (1) פרסום באמצעות שילוט באחת או יותר מן הדרכים שלהלן: הצבת שלט על הנכס או בקרבתו; הצבת שלט על גבי לוח מודעות ציבורי; הצבת שלט במרכז קהילתי; כל שלט אחר כפי שיוסכם בין המתווך ללקוח; (2) פרסום בקרב קהל לקוחות מסוים, המופיע במאגר של המתווך, באמצעי אלקטרוני, באמצעות דיוור ישיר או באמצעי אחר כפי שיוסכם, או פרסום מודעה באתר אינטרנט או באמצעי ממוחשב אחר אשר יועדו לשיווק נכסי מקרקעין; (3) פרסום בעיתון יומי נפוץ אחד לפחות; (4) פרסום בעיתון מקומי או בעיתון המיועד לקהל יעד מסוים בהתאם לבחירתו של הלקוח; (5) הזמנת {{buyers}} פוטנציאלים או מתווכים נוספים לביקור בנכס במועד שיוסכם עליו; (6) הזמנתם של חמישה מתווכים אחרים לפחות, הפעילים ביישוב שבו מצוי הנכס, לשתף פעולה לשם {{deal_c}} הנכס; (7) כל פעילות שיווק שאינה מנויה בפסקאות (1) עד (6), כפי שתוסכם בין הצדדים.
4. עם ביצוע שתי פעולות שיווקיות מהרשומות לעיל חזקה כי המתווך ייחשב כגורם היעיל ויהיה זכאי לדמי התיווך במלואם, בין אם {{buyer}} הגיע באמצעותו ובין אם בדרך אחרת כלשהי.
5. דמי התיווך המסוכמים הם כדלקמן:
{{fee_line}}
לכל תשלום כאמור לעיל יתווסף מע"מ לפי שיעורו בחוק (להלן: "דמי התיווך").
6. דמי התיווך ישולמו ככל שתבוצע עסקה בתקופת הבלעדיות, וכן ככל שתבוצע עסקה לאחר תום תקופת הבלעדיות, בנסיבות בהן נודע ללקוח אודות הנכס במהלך תקופת הבלעדיות, או שהלקוח הגיע בעקבות פעולות שיווקיות של המתווך שנעשו במהלך תקופת הבלעדיות (הכל, בין אם הלקוח הגיע על ידי המתווך או מי מטעמו ובין אם הלקוח הגיע באופן אחר).
7. בתקופת הבלעדיות הלקוח לא יבקש או יקבל שירותי תיווך ממתווכים אחרים או מכל גורם אחר לצורך ביצוע עסקה כלשהי ביחס לנכס או לצורך ביצוע פעולות שיווקיות ולא יפעל כך בעצמו, וכל קשר כאמור (לרבות מו"מ לגבי עסקה) יעשה רק דרך המתווך ובאמצעותו (אף אם {{buyer}} הגיע לא דרך המתווך). בפרט, הלקוח יפנה אל המתווך כל לקוח או מתווך שיפנו אליו בתקופת הבלעדיות או לאחר תקופת הבלעדיות כתוצאה מפעולות שנעשו על ידי המתווך.
8. הלקוח יביא לידיעת כל מתווך קודם (ככל שקיים) את דבר התקשרותו עם המתווך בהסכם זה ויביא לסיומה המיידי של כל התחייבות סותרת. כמו כן הלקוח מתחייב להסיר פרסומים בנוגע לנכס ככל וקיימים כאלה.
9. מובהר כי לאחר תום תקופת הבלעדיות, המתווך יהיה מוסמך להמשיך ולפעול בהתאם להזמנת שירותי התיווך, כך שככל שתבוצע עסקה ביחס לנכס כמפורט בהזמנה כאמור, אזי המתווך יהיה זכאי לדמי התיווך.
10. בהסכם זה לשון יחיד משמעותה גם לשון רבים ולהיפך, ולשון זכר משמעותה גם לשון נקבה ולהיפך, הכל לפי העניין.$body$,
'ליאה ארז', '3156857', 'פריים לוקיישן', true)
on conflict (kind, version) do nothing;

alter table public.signing_requests drop constraint if exists signing_requests_kind_check;
alter table public.signing_requests add constraint signing_requests_kind_check check (kind in ('client_order', 'broker_coop', 'owner_order'));
alter table public.signing_requests add column if not exists fee_value numeric;
alter table public.signing_requests drop constraint if exists signing_requests_fee_check;
alter table public.signing_requests add constraint signing_requests_fee_check
  check (kind <> 'owner_order' or (fee_value > 0 and fee_value <= 100));

-- the owner wording for this request: sale or rent words, the fee, the dates (the signing date once signed)
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
    '{{fee_line}}', case when sale then 'במכירה: סך של ' || fee || '% מהמחיר הכולל של הנכס' else 'בהשכרה: סך של ' || fee || ' חודשי שכירות' end),
    '{{agreement_no}}', r.agreement_no::text),
    '{{order_date}}', to_char(d, 'DD/MM/YYYY')),
    '{{excl_end}}', to_char((d + interval '3 months')::date, 'DD/MM/YYYY'))
  from v
$$;

create or replace function public.signing_body(r public.signing_requests, t public.agreement_templates) returns text
language sql stable set search_path = public as $$
  select case when r.kind = 'owner_order' then owner_text(t.body, r) else replace(t.body, '{{split}}',
    case r.coop_type when 'shared' then 'קופה משותפת' when 'each_side' then 'כל אחד מהצד שלו' when 'referral' then 'הפניה' else '' end
    || case when nullif(btrim(coalesce(r.coop_notes, '')), '') is not null then E'\nהערות (אחוזים): ' || btrim(r.coop_notes) else '' end) end
$$;
create or replace function public.signing_title(r public.signing_requests, t public.agreement_templates) returns text
language sql stable set search_path = public as $$
  select case when r.kind = 'owner_order' then owner_text(t.title, r) else t.title end
$$;
create or replace function public.signing_kind_label(k text) returns text language sql immutable as $$
  select case k when 'broker_coop' then 'הסכם שת״פ' when 'owner_order' then 'הסכם בעלים' else 'הזמנת שירותי תיווך' end
$$;

-- a client's lead: the newest one of this contact, or a new draft with what the property already tells us
create or replace function public.lead_for_contact(p_contact uuid, d public.owner_deals, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_lead uuid; v_need uuid; v_lpurp uuid; v_purpose text;
begin
  select id into v_lead from lead_deals where contact_id = p_contact order by (status = 'active') desc, created_at desc limit 1;
  if v_lead is not null then return jsonb_build_object('id', v_lead, 'draft', false); end if;
  select value into v_purpose from option_lists where id = d.purpose_id;
  select id into v_need from option_lists where list_key = 'lead_need' and not hidden
    and value = case d.deal_kind when 'sale' then 'לקנות' when 'rent' then 'לשכור' end limit 1;
  select id into v_lpurp from option_lists where list_key = 'lead_purpose' and not hidden and value = v_purpose limit 1;
  insert into lead_deals (contact_id, lead_date, need_id, need_ids, purpose_id, purpose_ids, notes, is_draft)
  values (p_contact, current_date, v_need, coalesce(array_remove(array[v_need], null), '{}'), v_lpurp,
          coalesce(array_remove(array[v_lpurp], null), '{}'), p_note || coalesce(d.address, ''), true)
  returning id into v_lead;
  return jsonb_build_object('id', v_lead, 'draft', true);
end $$;

-- a client by phone: the saved contact, or a new one with this name
create or replace function public.contact_for(p jsonb, p_entity text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_phone text := normalize_phone(p->>'phone'); v_id uuid; v_name text := nullif(btrim(coalesce(p->>'name', '')), '');
begin
  if v_phone is null then raise exception 'מספר נייד לא תקין' using errcode = '22023'; end if;
  select id into v_id from contacts where phone = v_phone;
  if v_id is not null then return v_id; end if;
  if v_name is null then raise exception 'חסר שם' using errcode = '22023'; end if;
  return upsert_contact(jsonb_build_object('v', 2, 'phone', v_phone, 'name', v_name, 'entity_type', p_entity));
end $$;

-- Leah: create a request.
--  client_order: p.lead_id (an existing lead) OR p.contact {phone, name} (a new client → a draft lead)
--  broker_coop:  p.coop_type, p.coop_notes, p.contact {phone, name} (saved as a broker contact)
--  owner_order:  the property's owner signs; p.fee_value (months of rent / % of the sale price), p.price (asking price)
create or replace function public.signing_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d owner_deals; t agreement_templates; v_contact uuid; v_token text; v_no int;
  v_kind text := coalesce(nullif(p->>'kind', ''), 'client_order'); v_coop text := nullif(p->>'coop_type', '');
  v_teaser text := nullif(btrim(coalesce(p->>'teaser_text', '')), ''); v_part text; v_purpose text; r signing_requests;
  v_lead uuid; v_draft boolean := false; v_fee numeric; v_price numeric; v_l jsonb;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  if v_kind not in ('client_order', 'broker_coop', 'owner_order') then raise exception 'סוג הסכם לא מוכר' using errcode = '22023'; end if;
  if v_kind = 'broker_coop' and (v_coop is null or v_coop not in ('shared', 'each_side', 'referral')) then
    raise exception 'יש לבחור סוג שת״פ' using errcode = '22023'; end if;
  if v_kind <> 'broker_coop' then v_coop := null; end if;
  select * into d from owner_deals where id = (p->>'owner_deal_id')::uuid;
  if not found then raise exception 'הנכס לא נמצא'; end if;
  select * into t from agreement_templates where is_active and kind = v_kind;
  if not found then raise exception 'אין נוסח הסכם פעיל'; end if;
  select value into v_purpose from option_lists where id = d.purpose_id;
  v_price := d.asking_price;

  if v_kind = 'owner_order' then
    v_fee := nullif(p->>'fee_value', '')::numeric;
    if v_fee is null or v_fee <= 0 or v_fee > 100 then raise exception 'יש למלא דמי תיווך' using errcode = '22023'; end if;
    v_price := coalesce(nullif(p->>'price', '')::numeric, d.asking_price);
    if v_price is null or v_price <= 0 then raise exception 'יש למלא מחיר מבוקש' using errcode = '22023'; end if;
    v_contact := d.contact_id; v_teaser := null;   -- the owner knows the address: no teaser, no address check
  else
    foreach v_part in array address_parts(d.address) loop
      if position(lower(v_part) in lower(concat_ws(' ', v_teaser, v_purpose))) > 0 then
        raise exception 'טקסט הנכס מכיל את הכתובת: %', v_part using errcode = '22023';
      end if;
    end loop;
    if v_kind = 'client_order' and nullif(p->>'lead_id', '') is not null then
      select id, contact_id into v_lead, v_contact from lead_deals where id = (p->>'lead_id')::uuid;
      if v_lead is null then raise exception 'המתעניין לא נמצא'; end if;
    else
      v_contact := contact_for(p->'contact', case when v_kind = 'broker_coop' then 'broker' else 'private' end);
      if v_kind = 'client_order' then
        v_l := lead_for_contact(v_contact, d, 'נוצר מהחתמה על נכס: ');
        v_lead := (v_l->>'id')::uuid; v_draft := (v_l->>'draft')::boolean;
      end if;
    end if;
  end if;

  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_no := nextval('agreement_no_seq');
  insert into signing_requests (token, agreement_no, owner_deal_id, contact_id, template_id, template_version, teaser_snapshot, address_snapshot,
                                kind, coop_type, coop_notes, lead_deal_id, fee_value)
  values (v_token, v_no, d.id, v_contact, t.id, t.version,
          jsonb_build_object('purpose', v_purpose, 'built_sqm', d.built_sqm, 'plot_sqm', d.plot_sqm, 'deal_kind', d.deal_kind,
                             'sale_price', case when d.deal_kind = 'sale' then v_price end,
                             'monthly_rent', case when d.deal_kind = 'rent' then v_price end,
                             'teaser_text', v_teaser),
          d.address, v_kind, v_coop, case when v_kind = 'broker_coop' then nullif(btrim(coalesce(p->>'coop_notes', '')), '') end, v_lead,
          case when v_kind = 'owner_order' then v_fee end)
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
declare r signing_requests; t agreement_templates; v_phone jsonb; c contacts; v_owner boolean;
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
  v_owner := r.kind = 'owner_order';
  select * into c from contacts where id = r.contact_id;
  return jsonb_build_object(
    'state', case when r.status = 'signed' then 'signed' else 'open' end, 'kind', r.kind,
    'office', jsonb_build_object('office_name', t.office_name, 'broker_name', t.broker_name, 'broker_license', t.broker_license, 'phone', v_phone),
    'agreement_no', r.agreement_no, 'title', signing_title(r, t), 'body', signing_body(r, t),
    'teaser', r.teaser_snapshot,
    'request_id', r.id, 'pdf_path', case when r.status = 'signed' then r.pdf_path end,
    -- the owner signs on his own property: he sees its address and his own name / phone from the start
    'address', case when r.status = 'signed' or v_owner then r.address_snapshot end,
    'signer', case when v_owner then jsonb_build_object('name', c.name, 'phone', c.phone) end);
end $$;

create or replace function public.signing_public_begin(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r signing_requests; t agreement_templates; c contacts;
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
  select * into c from contacts where id = r.contact_id;
  return jsonb_build_object('state', 'ok', 'request', to_jsonb(r) - 'token', 'template', to_jsonb(t),
                            'body', signing_body(r, t), 'title', signing_title(r, t), 'now', now(),
                            'contact', jsonb_build_object('name', c.name, 'phone', c.phone),
                            'office_phone', (select value #>> '{}' from app_settings where key = 'office_phone'));
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
  values ('signing_signed', r.signer_full_name || ' חתם/ה על ' || case r.kind when 'broker_coop' then 'הסכם שת״פ' when 'owner_order' then 'הסכם הבעלים' else 'הזמנת התיווך' end,
          concat_ws(' · ', 'הסכם ' || r.agreement_no, r.teaser_snapshot->>'purpose', 'נשלח ל' || v_name), '#/m/owner/' || r.owner_deal_id, r.id);
  return jsonb_build_object('state', 'signed', 'address', r.address_snapshot, 'pdf_path', r.pdf_path);
end $$;

-- ── 2. sharing a property with a lead ──
create table if not exists public.property_shares (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique,                 -- 32 random bytes, base64url: the only thing in the public link
  owner_deal_id   uuid not null references public.owner_deals(id),
  lead_deal_id    uuid references public.lead_deals(id) on delete set null,
  contact_id      uuid not null references public.contacts(id),
  photos          jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 5),
  snapshot        jsonb not null,                       -- purpose, size, deal type, price. Never an address, an owner or a description
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '60 days',
  first_opened_at timestamptz,
  created_by      uuid default auth.uid()
);
create index if not exists property_shares_lead on public.property_shares (lead_deal_id);
create index if not exists property_shares_owner on public.property_shares (owner_deal_id);
alter table public.property_shares enable row level security;
revoke all on public.property_shares from anon, public;
grant select on public.property_shares to authenticated;
drop policy if exists member_read on public.property_shares;
create policy member_read on public.property_shares for select to authenticated using (public.is_member());

-- Leah: p.owner_deal_id, p.lead_id OR p.contact {phone, name} (new → a draft lead), p.photos: storage paths of the deal's photos
create or replace function public.share_create(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d owner_deals; v_lead uuid; v_contact uuid; v_draft boolean := false; v_l jsonb; v_photos jsonb := '[]'::jsonb;
        v_path text; v_ph jsonb; v_token text; v_id uuid;
begin
  if not is_member() then raise exception 'אין הרשאה' using errcode = '42501'; end if;
  select * into d from owner_deals where id = (p->>'owner_deal_id')::uuid;
  if not found then raise exception 'הנכס לא נמצא'; end if;
  if d.status <> 'active' then raise exception 'הנכס בארכיון' using errcode = '22023'; end if;
  if nullif(p->>'lead_id', '') is not null then
    select id, contact_id into v_lead, v_contact from lead_deals where id = (p->>'lead_id')::uuid;
    if v_lead is null then raise exception 'המתעניין לא נמצא'; end if;
  else
    v_contact := contact_for(p->'contact', 'private');
    v_l := lead_for_contact(v_contact, d, 'נוצר משיתוף נכס: ');
    v_lead := (v_l->>'id')::uuid; v_draft := (v_l->>'draft')::boolean;
  end if;
  if jsonb_typeof(p->'photos') = 'array' then
    for v_path in select jsonb_array_elements_text(p->'photos') loop
      select x into v_ph from jsonb_array_elements(d.photos) x where x->>'path' = v_path limit 1;
      if v_ph is null then raise exception 'תמונה לא שייכת לנכס' using errcode = '22023'; end if;
      if not v_photos @> jsonb_build_array(jsonb_build_object('path', v_path)) then
        v_photos := v_photos || jsonb_build_array(jsonb_build_object('path', v_ph->>'path', 'thumb', v_ph->>'thumb'));
      end if;
      v_ph := null;
    end loop;
  end if;
  v_token := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into property_shares (token, owner_deal_id, lead_deal_id, contact_id, photos, snapshot)
  values (v_token, d.id, v_lead, v_contact, v_photos,
          jsonb_build_object('purpose', (select value from option_lists where id = d.purpose_id),
                             'built_sqm', d.built_sqm, 'plot_sqm', d.plot_sqm, 'deal_kind', d.deal_kind, 'price', d.asking_price))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token, 'lead_id', v_lead, 'contact_id', v_contact, 'draft_created', v_draft);
end $$;

-- the public property page (Edge Function, service role): only the snapshot and the chosen photos' paths
create or replace function public.share_public_get(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s property_shares; v_status text; v_office jsonb;
begin
  v_office := jsonb_build_object('broker_name', (select broker_name from agreement_templates where is_active and kind = 'client_order'),
                                 'phone', (select value from app_settings where key = 'office_phone'));
  select * into s from property_shares where token = p_token;
  if not found then return jsonb_build_object('state', 'not_found'); end if;
  select status into v_status from owner_deals where id = s.owner_deal_id;
  if s.expires_at < now() or v_status is distinct from 'active' then return jsonb_build_object('state', 'closed', 'office', v_office); end if;
  if s.first_opened_at is null then update property_shares set first_opened_at = now() where id = s.id; end if;
  return jsonb_build_object('state', 'open', 'office', v_office, 'property', s.snapshot,
                            'photos', (select coalesce(jsonb_agg(x->>'path'), '[]'::jsonb) from jsonb_array_elements(s.photos) x));
end $$;

-- ── grants ──
revoke execute on function public.owner_text(text, public.signing_requests), public.signing_title(public.signing_requests, public.agreement_templates),
  public.signing_body(public.signing_requests, public.agreement_templates), public.signing_kind_label(text),
  public.lead_for_contact(uuid, public.owner_deals, text), public.contact_for(jsonb, text),
  public.signing_public_get(text), public.signing_public_begin(text), public.signing_public_complete(jsonb),
  public.share_public_get(text) from public, anon, authenticated;
revoke execute on function public.signing_create(jsonb), public.share_create(jsonb) from public, anon;
grant execute on function public.signing_create(jsonb), public.share_create(jsonb) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.signing_public_get(text), public.signing_public_begin(text), public.signing_public_complete(jsonb),
      public.share_public_get(text), public.owner_text(text, public.signing_requests),
      public.signing_title(public.signing_requests, public.agreement_templates),
      public.signing_body(public.signing_requests, public.agreement_templates), public.signing_kind_label(text) to service_role;
  end if;
end $$;
-- signing_create / share_create (security definer) call the helpers as their owner, so authenticated needs no grant on them

-- ── 3. a lead's search radius: up to 40 km ──
do $$ declare c record; begin
  for c in select conname from pg_constraint
           where conrelid = 'public.lead_deals'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%radius_m%' loop
    execute format('alter table public.lead_deals drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.lead_deals add constraint lead_deals_radius_m_check check (radius_m is null or radius_m between 500 and 40000);
