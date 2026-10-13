# Prime Location CRM – phase 1 master prompt

Build phase 1 of the Prime Location CRM, as specified below. Level 3 (architecture + auth + new database).

Work in the current folder. It contains the Prime Location logo files and business images. Talk to me (Galli) in short, plain Hebrew.
Follow the galli-app-studio skill for UX, forms, RTL, mobile and delivery rules.

## 0. Council flow (fusion-project, level 3)
1. If this folder is not a git repo: `git init`, add a `.gitignore`, and make a baseline commit.
2. Write `PLAN.md` from section 2 below (keep it under one screen).
3. Run the Codex critique on the plan only:
   `/codex:adversarial-review --background review PLAN.md only: challenge the approach, hidden assumptions and risks`
4. Update the plan from the critique. Show me the changes in 3-5 Hebrew lines and wait for my OK.
5. After my OK, build everything to the end without stopping for approvals.
6. Design pass: before finalizing the visuals, send the design tokens (section 5) and phone-width screenshots of the home, list, form and card screens to Codex for a design critique. Apply what fits the brand.
7. Run `/codex:adversarial-review --background` on the implementation, focused on the plan's risks. One fix round, then finish.

## 1. What this is
A simple, mobile-first Hebrew RTL CRM for Leah, owner of Prime Location (commercial real estate, Kiryat Gat area).
One user only: Leah. Simplicity matters more than features.
Phase 1 = a working end-to-end system with two modules: "מתעניינים" (leads) and "בעלים/משכיר" (owners/landlords).
NOT in phase 1: dashboards, lead-to-property matching, real AI, automations, alerts, integrations, more users.
Design the data so phase 2 (matching, dashboards, Make/n8n automations) needs no migration of existing data.

## 2. Architecture decisions (already made – do not reopen unless Codex finds a real problem)
- **Stack:** one self-contained `index.html`, vanilla JS, no build step. Libraries from CDN only: supabase-js v2, Leaflet. Google Font: Heebo.
- **Data:** Supabase, free tier, in the WAIVES account. Real database from day one: same data on phone and desktop.
- **Hosting:** GitHub Pages. Repo `prime-location-crm` in the WAIVES GitHub organization.
- **PWA:** `manifest.json` + icons (192, 512, maskable) made from the logo pin. Installable on Android and iPhone.
- **Login now, even in phase 1:** Supabase Auth, email + password, Leah only. Public sign-ups disabled. RLS on every table: authenticated users only. Reason: a public URL + the anon key without RLS exposes client phone numbers.
- **Map:** Leaflet + OpenStreetMap tiles, Nominatim address search (Hebrew, limited to Israel, debounced, respect the usage policy). No paid API key.
- **AI price estimate:** simulated in phase 1 (a simple heuristic by purpose and size), always labelled "הערכה". Phase 2 will move it to a Supabase Edge Function, so no API key ever lives in the client.
- **Supabase keys:** only the URL and the anon (public) key go in `index.html`. Never the service role key.

### Data model (`supabase/schema.sql`)
- `contacts`: id uuid, phone text UNIQUE NOT NULL (normalized `05X-XXXXXXX`), name, entity_type ('company' | 'private'), company_name (required when company), created_at, updated_at.
  One phone = one contact. The same contact can have deals in both modules.
- `lead_deals` (מתעניינים) – one row per deal:
  contact_id, lead_date (manual date, defaults to today), need (from list `lead_need`), purpose (from list `lead_purpose`), size_value + size_unit ('sqm' | 'dunam'), size_sqm (stored, normalized: dunam × 1000, for phase 2 matching), lat, lng, radius_m, height_m, notes (OPTIONAL), budget_value + budget_kind ('total' | 'per_sqm'), needed_by (date), status ('active' | 'closed' | 'irrelevant'), closed_at, custom jsonb default '{}', created_at, updated_at.
- `owner_deals` (בעלים/משכיר) – one row per deal:
  contact_id, purpose (from list `owner_purpose`), built_sqm, plot_sqm, lat, lng, address, description, deal_kind ('rent' | 'sale'), asking_price (required, label "מחיר מבוקש / שווי הנכס" ₪), is_rented (only for rent), monthly_rent (when rented), yield_pct (computed in the app = monthly_rent × 12 ÷ asking_price × 100, also stored for phase 2 dashboards), ai_price_per_sqm (estimate, sale only), status, closed_at, custom jsonb, created_at, updated_at.
- `option_lists`: id, list_key, value, sort, created_at. UNIQUE (list_key, value).
  Seed exactly (two separate purpose lists, by the client's choice):
  - `lead_need`: לקנות, לשכור, להשכיר, להשקעה
  - `lead_purpose`: תעשייה קלה, תעשייה כבדה, משרדים, מסחר / חנות, פרטי, מרלוג, מחסן
  - `owner_purpose`: מחסן, תעשייה, מסחר, חנות
- `custom_fields`: id, module ('lead' | 'owner'), key (generated slug), label, type ('text' | 'number' | 'date' | 'list'), options jsonb (for list type), sort, created_at. Values live in each deal's `custom` jsonb under `key`.
- Indexes on contact_id, status, phone. `updated_at` trigger on all tables.

## 3. Behaviour
- **All fields are required** except: lead `notes`, and every custom field (custom fields are always optional, because older records have no value).
- **New deal = phone first.** Normalize the phone on blur. If it already exists, attach the deal to that contact and prefill name, private/company and company name, with a one-line note: "לקוח קיים – הפרטים מולאו". Editing the name in a deal updates the contact.
- **Every dropdown has "+ חדש" inline:** adds the value to `option_lists` on the spot, selects it, and keeps everything already typed.
- **Duplicate (שכפל):** opens a new form prefilled with all fields of the source deal, same contact, lead_date = today, status = active. Nothing is saved until "שמירה".
- **Add a field (+ שדה חדש):** inside each module (a small link at the bottom of the form, not a main button). Label + type. Appears immediately in the form and card of every record in that module.
- **Archive:** "סגירת עסקה" asks for a reason: "נסגרה" or "לא רלוונטית". The deal moves to the archive. In the archive, "החזרה לפעילות" restores it. No hard delete in phase 1.
- **Owners – rent vs sale:**
  - rent → "האם המבנה מושכר כרגע?" yes/no. Yes → "שכירות חודשית (₪)" → live yield: "תשואה: 6.4%".
  - sale → show "מחיר למ"ר מבוקש" (asking_price ÷ built_sqm) and "הערכת מחיר למ"ר" (simulated, labelled "הערכה").
- **Map field:** address search + tap on the map to place a pin. Leads also get a radius slider (0.5-20 km) drawn as a circle. Owners: a pin only, plus the address field (filled from the search, editable).
- **Lead size:** number + unit toggle מ"ר / דונם.
- **Lead budget:** number + toggle "סה"כ" / "למ"ר".
- **Search** in each list: name, phone, company, address.
- **Card actions:** עריכה, שכפול, סגירת עסקה, חיוג (`tel:`), WhatsApp (`https://wa.me/972XXXXXXXXX` with the phone converted to international format).

## 4. Screens
1. **כניסה** – logo, email, password (eye icon), "כניסה". Remember the session on the device.
2. **בית** – logo top-left, two big buttons in the center: "מתעניינים" and "בעלים / משכיר", each with its count of active deals underneath in small text.
3. **רשימת מודול** – title, search at the top, segmented control "פעילות | ארכיון", deal rows (name, company, need/purpose, size, date), a big yellow floating "+ חדש" at the bottom within thumb reach.
4. **טופס עסקה** (new / edit / duplicate) – one scrolling form, grouped in sections: פרטי לקוח → הנכס → מיקום → כסף ותזמון → שדות נוספים. Sticky "שמירה" button at the bottom. Back = "חזרה" with text.
5. **כרטיס עסקה** – all details, a small map, and the actions from section 3.

Navigation: on desktop, a right-side menu with the two modules (the active one highlighted). On mobile, a bottom bar with the same two modules. Each screen covers empty, loading, error and full states.

## 5. Visual direction (from Leah's ads and logo in this folder)
White app with yellow and black brand touches. Clean, confident, not generic.
- Logo: use the white-background version with the tagline "נדל"ן במרכז העניינים". Use the yellow pin with buildings alone for the app icon and small header spots.
- Colour tokens (sample the exact values from the logo files and adjust if needed):
  - `--yellow: #FFD400` (brand yellow – primary buttons, "+ חדש", active tab)
  - `--ink: #1A1A1A` (text, black outlines)
  - `--charcoal: #3C3C3B` (logo grey, secondary text and icons)
  - `--bg: #FFFFFF`, `--surface: #F6F6F4`, `--line: #E6E6E2`
  - status: active = ink on yellow chip, archive = charcoal on surface. Never use yellow for errors; errors = `#C62828`.
- Shapes from the references: pill buttons with a 2px black outline (like the yellow phone bar in her business card), rounded cards (16px), a thin yellow underline under titles (like the line under the logo name).
- The ads use a diagonal yellow sweep. Use it once only, as the background accent of the home and login screens, not on working screens.
- Type: Heebo. Headings 700-800, body 400, numbers with `font-variant-numeric: tabular-nums`.
- Home buttons may use the business photos (building / warehouse) as a dimmed background behind the label, if it stays readable.

## 6. Hebrew, RTL, formats
- `dir="rtl" lang="he"`, `translate="no"`, `<meta name="google" content="notranslate">`, logical CSS properties.
- Phones, amounts, URLs in `<bdi>` / `dir="ltr"`.
- Phone: `type="tel" inputmode="tel" autocomplete="tel"`, placeholder `050-0000000`. Strip spaces, dashes, brackets; `+972` / `00972` / `972` → `0`. Valid = `^05\d{8}$`. Store as `05X-XXXXXXX`. Error: "מספר נייד צריך להכיל 10 ספרות ולהתחיל ב-05".
- Dates DD/MM/YYYY, week starts Sunday, money "₪ 1,250,000".
- Validate on blur, then on every keystroke once an error shows. Inline Hebrew errors with `aria-live`. On save, scroll to the first invalid field. Save button shows loading and blocks double submit. On failure, keep everything typed.
- Tap targets ≥ 44px. RTL back arrow points right.

## 7. Demo data
Seed realistic demo data around Kiryat Gat, Sderot, Ashkelon and Karmei Gat: 10 leads and 8 owner deals, 2 of each already in the archive. One contact must appear in both modules, and one contact must have two lead deals (e.g. rent for himself + investment). Use fake 05X numbers only.

## 8. Setup steps that need my login
Do everything you can yourself (repo, commits, push, Pages, schema if the Supabase MCP/CLI is connected).
Where my login is required, give me ONE step at a time in plain Hebrew, with the exact screen and button, and full blocks to paste:
1. Create the Supabase project in the WAIVES account and give you the Project URL + anon key.
2. If you can't run SQL yourself: paste `supabase/schema.sql` in SQL Editor → Run.
3. Create Leah's user: Authentication → Users → Add user. Turn off sign-ups: Authentication → Sign In / Providers → Allow new users to sign up → off.
4. Enable GitHub Pages if you can't.

## 9. Definition of done
- `node --check` on the extracted JS.
- Headless QA (Playwright) of: login, new lead, new owner (rent + rented → yield; sale → estimate), existing-phone prefill, "+ חדש" in a dropdown, duplicate, add custom field, archive + restore, search, WhatsApp/tel links, map pin + radius.
- Phone validation tests: valid, invalid, +972, 00972, with spaces and dashes.
- Screenshots at 390px width of every screen. Check RTL and arrow directions.
- Verify on the live GitHub Pages URL with the real Supabase, including RLS: without login, the anon key reads nothing.
- Finish with the fusion-project summary in Hebrew: what changed, which Codex calls ran, what was skipped or left open, plus the live link and Leah's login steps.
