# PLAN – Prime Location CRM, phase 1

## Goal
Mobile-first Hebrew RTL CRM for one user (Leah, Prime Location, commercial real estate, Kiryat Gat area).
Two modules: leads ("מתעניינים") and owners/landlords ("בעלים/משכיר"). Working end to end on real data.
Out of scope: dashboards, matching, real AI, automations, alerts, integrations, more users.
Data must serve phase 2 (matching, dashboards, Make/n8n) with no migration of existing rows.

## Approach
- One `index.html`, vanilla JS, no build. CDN: supabase-js v2, Leaflet. Font: Heebo. PWA manifest + icons.
- Supabase free tier (WAIVES account): Postgres + Auth (email/password, Leah only, sign-ups off).
- RLS on every table: only users listed in `crm_members` (Leah's auth uid) can read/write; `anon` and any other
  logged-in account get nothing. Every row has `created_by uuid default auth.uid()`. Only URL + anon key in the client.
- Saves go through one transactional RPC per module (`save_lead_deal`, `save_owner_deal`): normalize phone,
  upsert contact, insert/update the deal, all or nothing. The client creates the deal id up front, so a retry after a
  timeout updates the same row instead of creating a duplicate.
- GitHub Pages, repo `prime-location-crm` in the WAIVES org.
- Map: Leaflet + OSM tiles, Nominatim search (he, countrycodes=il, debounced ≥1s, min 3 chars).
- Price estimate: client-side heuristic by purpose × size, labelled "הערכה". Phase 2 → Edge Function.

## Data model (`supabase/schema.sql`)
- `contacts`: phone UNIQUE NOT NULL (`05X-XXXXXXX`), name, entity_type, company_name (CHECK: required when company).
- `lead_deals`: contact_id, lead_date, need, purpose, size_value+size_unit, size_sqm (normalized), lat, lng, radius_m, height_m, notes (optional), budget_value+budget_kind, needed_by, status, closed_at, custom jsonb.
- `owner_deals`: contact_id, purpose, built_sqm, plot_sqm, lat, lng, address, description, deal_kind, asking_price, is_rented, monthly_rent, yield_pct, ai_price_per_sqm, status, closed_at, custom jsonb.
- `option_lists` (id, list_key, value, sort, match_group nullable; UNIQUE pair) seeded with `lead_need`, `lead_purpose`, `owner_purpose`.
  Deals store the option **id** (FK), not the text, so renaming a value never breaks history. `match_group`
  (empty now) lets phase 2 map lead purposes to owner purposes without touching deal rows.
- `crm_members` (user_id) – the allowlist used by RLS.
- `custom_fields` (module, key slug, label, type, options, sort). Values in `custom` jsonb; always optional.
- CHECK constraints for enums; indexes on contact_id, status, phone; `updated_at` triggers.
- Demo data: 10 leads + 8 owner deals (2 archived each), one contact in both modules, one with two leads.

## Behaviour (key points)
Phone first → existing contact prefills (name edit updates the contact). "+ חדש" in every dropdown.
Duplicate = prefilled unsaved form. Close with reason → archive → restore. No hard delete.
Rent → rented? → monthly rent → live yield. Sale → asking ₪/sqm + estimate.

## Files
`index.html`, `manifest.json`, `icons/`, `assets/` (logo, photos), `supabase/schema.sql`, `qa/` (Playwright tests).

## Risks (after Codex critique)
1. RLS: test that anon AND a second logged-in non-member read nothing.
2. Atomic save: test deal-validation failure leaves no orphan contact; retry with same id makes no duplicate.
3. Editing the name on a deal changes the contact for all its deals (by design; the form says so).
4. Custom fields in jsonb: fine for phase 2 filtering at this scale; field keys never change after creation.
5. Nominatim usage policy and OSM tile limits: debounce, cache, attribution.
6. Phone as identity: number change = edit the contact's phone (not in phase 1 UI; documented as open).
