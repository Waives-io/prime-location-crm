# PLAN – Prime Location CRM, phase 1

## Goal
Working end-to-end mockup of a mobile-first, Hebrew RTL CRM for one user (Leah, owner of Prime Location, commercial real estate).
Two modules: Leads ("מתעניינים") and Owners/Landlords ("בעלים/משכיר"). Phase 2 (not now): dashboards, integrations, automations, alerts, lead-to-property matching, more users.

## Approach
- Stack: single self-contained HTML file, vanilla JS, no build step. Supabase (free tier, WAIVES account) for DB + auth. Hosted on GitHub Pages, repo in the WAIVES GitHub org. PWA manifest so it installs on phone.
- Auth now, even in phase 1: Supabase email+password for Leah only. RLS = authenticated users only. Reason: real DB from day one + public Pages URL + anon key = data exposed without RLS.
- Map: Leaflet + OpenStreetMap tiles, Nominatim for address search. Store lat/lng (+ radius_m for leads). Owners store an exact point + address.
- AI price-per-sqm estimate: simulated in phase 1, clearly labelled "הערכה". Real AI in phase 2 via a Supabase Edge Function (API key never in the client).

## Data model
- `contacts` – id, phone (UNIQUE, normalized 05X-XXXXXXX), name, entity_type (company/private), company_name, created_at, created_by.
  One phone = one contact. The same contact can have deals in both modules.
- `lead_deals` – one row per deal. contact_id, lead_date (manual), need (option list), purpose (option list), size_value + size_unit (sqm/dunam), lat, lng, radius_m, height_m, notes (optional), budget_value + budget_kind (total / per sqm), needed_by, status (active/closed/irrelevant), closed_at, custom jsonb.
- `owner_deals` – one row per deal. contact_id, purpose (separate option list), built_sqm, plot_sqm, lat, lng, address, description, deal_kind (rent/sale), asking_price_or_value, is_rented, monthly_rent, yield_pct (computed = monthly_rent*12 / asking_price_or_value), ai_price_per_sqm (estimate), status, closed_at, custom jsonb.
- `option_lists` – list_key (lead_need, lead_purpose, owner_purpose), value, sort. "+ חדש" inline in every dropdown.
- `custom_fields` – module, key, label, type (text/number/date/list), sort. New fields are optional (existing rows have no value). Values live in each deal's `custom` jsonb.

## Behaviour
- New deal: phone first. Existing phone → attach to that contact and prefill name/company.
- Duplicate: copies a deal (all fields) into a prefilled new form.
- Close: deal moves to archive with reason (closed / no longer relevant); can be restored.
- Screens: login → home with 2 big module buttons → module list (search, active/archive, big "+ חדש") → deal form → deal card (edit, duplicate, archive, call, WhatsApp). Module switcher: right sidebar on desktop, bottom bar on mobile.

## Files touched
index.html, manifest.json, icons, supabase/schema.sql (tables + RLS + seed lists + demo data).

## Risks to challenge
1. Contact-per-phone + deals split into two tables vs one generic deals table – right for phase 2 matching and dashboards?
2. Custom fields in jsonb – OK for filtering/dashboards later, or should custom fields be typed columns?
3. Two separate purpose lists (client's choice) make automatic matching harder in phase 2 – need a mapping table?
4. Supabase anon key in a static page + RLS – sufficient for a single-user CRM with client contact data?
5. Phone as the business identifier: what about a contact who changes number, or one company with several phones?
