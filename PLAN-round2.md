# PLAN – Leah's feedback round 2 (live app first, demo after)

## Goal
1. Both modules: only **phone + name** are required; every other field becomes optional.
2. Contact type: פרטי / חברה / **מתווך**. Company → company name (required) + ח.פ. (optional). Broker → the contact name is the broker; add מס' רישיון תיווך (optional).
3. Leads: size **range** (from / to, either one is enough); no photos in leads; "נדרש עד" renamed "דדליין"; **exact address incl. house number**.
4. Owners: "is it rented?" + monthly rent + yield for **sale too**; new "הערות" in כסף ותזמון; video infrastructure behind a flag (off).
5. iPhone: no contact picker (Safari has none); pasting a number copied from Contacts always works (hidden marks, +972, spaces, names).

## Approach
- **Migration `005_round2.sql` (additive, keeps all rows):**
  - contacts: `company_number`, `broker_license`; entity_type adds `broker`.
  - lead_deals: drop NOT NULL on every field except contact_id/status; add `size_min`, `size_max` (+ normalized `size_min_sqm`/`size_max_sqm`), backfilled from `size_value` (min = max = old value); CHECK min ≤ max.
  - owner_deals: drop NOT NULL except contact_id/status; add `notes`; replace rent-only checks with: rent fields allowed for rent **and** sale, `monthly_rent` only when `is_rented`.
  - Constraints found by definition (auto-named) and replaced in a DO block.
  - `save_lead_deal` / `save_owner_deal` / `upsert_contact` replaced: nulls allowed, new fields; **keys missing from an older client keep the stored value** (no erase); size_value from an old client fills min = max.
  - `set_deal_photos`: items get `kind` ('image' | 'video'); video paths allowed in the RPC; the bucket keeps image-only MIME types until Pro (one SQL line documented).
- **Client:** validation only for phone + name; conditional company/broker fields; size from/to inputs; photos only in the owner form; label "דדליין"; address: keep the user's typed house number when the search result has none, search Nominatim + Photon when the text contains a number, pin zoom 17; sale shows rented → rent → yield; owner notes. Cards, lists, search and the price estimate cope with empty fields (no "NaN", no "₪ 0").
- **Phone paste:** strip bidi marks (U+200E/F, U+202A–E, U+2066–9), NBSP, letters, and keep +972 / 00972 normalisation.

## Files
`supabase/005_round2.sql`, `index.html`, `qa/local-db.js`, `qa/db.test.mjs`, `qa/e2e.test.mjs`. Demo afterwards (demo-db.js, seed, dashboard matching on ranges / nulls).

## Risks
1. Constraint names differ on the live DB → drop by definition, test on a copy built from schema + 002 + 004.
2. Old PWA versions keep saving → RPCs must not wipe fields the old client doesn't send.
3. Existing rows: size_value → min/max backfill; nothing else changes.
4. Empty fields everywhere (cards, list rows, map without a pin, yield without price) → tests for a deal saved with phone + name only.
5. Demo dashboard/matching assumes required fields → handled in the demo step.
