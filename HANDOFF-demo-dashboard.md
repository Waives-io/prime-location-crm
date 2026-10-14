/fusion-project Build the Prime Location CRM DEMO + DASHBOARD, as described below. Level 3 (new environment, new screen and concepts).

Work in: C:\Users\PC\OneDrive\מסמכים\Claude\WAIVES\WAIVES Projects\Prime Location (git repo, branch main).
Talk to me (Galli) in short, plain Hebrew. Follow galli-app-studio (UX, RTL, mobile, delivery) and the fusion-project rules
(design work goes to GPT via codex rescue, with the inspiration question first; architecture = my proposal + Codex UX proposal side by side, I decide).

## Where things stand (phase 1 is live)
- Live app (Leah's real CRM): https://waives-io.github.io/prime-location-crm/ — repo Waives-io/prime-location-crm (Waives-io is a GitHub USER, not an org).
  Push with the Waives-io token: T=$(gh auth token --user Waives-io); git -c credential.helper= -c "http.extraheader=Authorization: Basic $(printf 'x-access-token:%s' "$T" | base64 -w0)" push origin main
- Stack: one index.html (vanilla JS), Supabase project tbuhhxcgkxuovbdtebqv (URL + publishable key are in CONFIG in index.html), Leaflet + OSM,
  address search = Photon (lang=default, fuzzy) with Nominatim fallback/reverse, PWA (manifest id /prime-location-crm/, sw.js).
- DB: supabase/schema.sql + supabase/002_feedback.sql (both already run on the live project). RLS = only users in crm_members.
  Saves go through RPCs save_lead_deal / save_owner_deal (atomic, client-generated id). Options referenced by id; "removed" option = hidden.
- Live data was wiped on 2026-10-14 (supabase/reset-data.sql). Accounts: contact@waives.io (member, keep it). Leah (liaherez@gmail.com):
  user may not be created yet; after Galli creates it in Authentication → Users, she runs the crm_members insert line for that email.
- Do NOT touch Leah's live data or break the live app. Never put passwords in files or chat.
- QA: cd qa && node db.test.mjs (PGlite, 24 tests) and node e2e.test.mjs --shots (Playwright with qa/local-db.js as window.PL_TEST_DB, 34 tests).
  index.html uses window.PL_TEST_DB when present instead of Supabase — the in-memory adapter in qa/local-db.js mirrors the RPC semantics.
- Design so far (by GPT): direction "Leah's business card turned into a daily work tool": white, yellow #FFD400 + ink #1A1A1A pills with 2px black
  outline and black offset shadow, Heebo, home = two compact yellow pills (proposal D), bottom yellow wave traced from her ad
  (path M0,614 C150,690 300,718 430,717 C580,716 700,695 800,672 L800,800 L0,800 Z, viewBox 0 600 800 200), "+ חדש" in the middle of the
  phone bottom bar, in the top bar on desktop. Mockups live in design-proposals/ (gitignored), references in design-refs/ (gitignored).
- Rules learned this project were added to the galli-app-studio skill (OneDrive copy + installed copy).

## The new task (my answers to the discovery questions)
1. Brand of the demo: a fictional agency named "נדלן בע"מ" (neutral logo, small "נבנה ע"י WAIVES"). Not Leah's brand, not her phone or photos.
2. Entry: a REAL-looking login screen with a fictional email + password ALREADY FILLED IN, so prospects see there is authentication.
   (Decide with me how the data is stored: my leaning was a per-visitor in-browser copy with a "איפוס דמו" button, so visitors never see
   each other's changes and no second Supabase project is needed; a shared demo Supabase project would need a nightly reset. Present both.)
3. Rich fictional data inside the demo (Israeli cities, realistic leads/owners, both modules, some archived, fake 05X numbers only).
4. A dashboard that "makes sense" to a broker, with all four of:
   - התאמות: for each lead, the matching owner properties (purpose mapping via option_lists.match_group, size, budget, radius/location).
   - היצע מול ביקוש: demand vs supply by purpose and area.
   - קצב עבודה וסגירות: new this month, closed vs irrelevant, time to close.
   - דחוף להיום: leads whose "נדרש עד" is near, deals untouched for a month.
5. Dashboard goes to the DEMO first. Leah's live app stays unchanged until I approve, then it is switched on there too (feature flag).

## Flow
Step 0 per fusion-project → my proposal + Codex UX/architecture proposal (read-only, independent) → show side by side → I decide →
PLAN.md → Codex adversarial critique of the plan → 3-5 line Hebrew summary → my OK → build to the end → design via GPT (ask me for
inspiration first) → tests + screenshots at 390px → Codex adversarial review → one fix round → deploy the demo to its own URL
(not the live app's) and verify there → Hebrew summary with the demo link and the demo login.
