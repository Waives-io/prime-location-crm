# PLAN – phase 2: demo "דמו נדל"ן בע"מ" + dashboard

## Goal
A public demo for prospect brokers at its own URL, plus a broker dashboard ("לוח עבודה").
Dashboard ships in the demo first. Leah's live app stays unchanged until Galli approves (feature flag).

## Decisions (Galli, 2026-10-14)
- Demo storage: per-visitor copy in the browser (localStorage), "איפוס הדמו" in the menu. No second Supabase.
- Demo URL: separate repo Waives-io/nadlan-demo → waives-io.github.io/nadlan-demo/ (built from the same index.html).
- Module 2 is called "נכסים" in the demo (Leah keeps "בעלים / משכיר").
- Owner rent deals get an optional "שכירות מבוקשת לחודש" (asking_rent).
- Area = nearest city from a fixed list, derived from the map point. No new form field.
- Matches: top 3-5 on the dashboard + inside every card in both directions (lead → נכסים, נכס → מתעניינים).
- Purpose groups are set inside the existing "עריכת הרשימה" dialog (no new settings screen).
- "Untouched" is named honestly: "לא עודכן 30+ יום" (by updated_at).

## Approach
- `index.html` reads `window.PL_APP` (brand, labels, features). Absent = today's live behaviour, byte-for-byte same UX.
- `demo/demo-db.js`: localStorage adapter with the same API as `supabaseDB()` (mirrors the RPCs, like qa/local-db.js),
  seeded from `demo/seed.js` with dates relative to today (so "this month" is never empty). ~30 leads, ~25 נכסים, ~10 archived,
  10+ Israeli cities, fake 05X numbers. Login: fixed demo email + password, prefilled, still checked.
- `tools/build-demo.mjs`: copies index.html into `demo-site/` (its own git repo, gitignored here), injects PL_APP + demo-db.js,
  swaps logo, title, manifest (own id/scope) and service worker. Demo: no tel/WhatsApp (toast), no password change, slim banner
  "סביבת הדגמה – הנתונים נשמרים רק במכשיר הזה".
- Dashboard = home when `features.dashboard`. Sections in order: לטיפול היום → התאמות חמות → היצע מול ביקוש → קצב וסגירות.
  Every tile opens the matching records (list filter via route, with a visible "✕" filter chip).
- Matching (pure function, unit-tested). Gates: both active; לשכור↔השכרה, לקנות/להשקעה↔מכירה; same purpose group.
  Score: location 35, size 25, budget 25, rest 15 → "גבוהה / טובה / אפשרית" + chips ("2.1 ק"מ", "גדול ב-8%", "בתקציב",
  "חסרה שכירות מבוקשת"). One soft miss beyond tolerance → "כמעט מתאים". USD budgets at a fixed rate, stated on the chip.
- Urgent: needed_by overdue/≤2 days red, ≤7 days yellow; active deals not updated 30+ days.
- Pace: new this month (both modules), closed vs not relevant this month, average days lead → closed.
- `supabase/003_dashboard.sql` (additive, NOT run on live until approval): owner_deals.asking_rent, save_owner_deal accepts it,
  default match_group values. Live UI never sends asking_rent while the flag is off.
- Design by GPT after the logic works: dashboard, demo logo, demo login. Logic by Claude.

## Rules fixed after Codex critique
- Isolation (same origin): demo keys all start with `nadlan-demo:v1:`; demo never reads/clears other keys. Demo SW cache
  `nadlan-demo-shell-v1`, deletes only its own prefix. Live sw.js changes to delete only `pl-shell-*` (today it deletes every cache on the origin).
- Matching basis (pure `matchScore(lead, owner)`, table-tested):
  - Transaction from `lead_need.match_group` (stable code, not label): rent→השכרה, buy→מכירה, invest→מכירה, none (להשכיר) → not matched.
  - Purpose: same `match_group` on lead_purpose and owner_purpose. No group → no match.
  - Location: haversine distance vs radius_m. ≤ radius full; ≤ 1.5× = "כמעט". City is display/aggregation only.
  - Size: lead in sqm (dunam ×1000). Compare built_sqm, except group "קרקע/פרטי" → plot_sqm. −10%…+30% full; −25%…+60% partial.
  - Budget (ILS; USD × fixed rate 3.7, shown on chip): buy/invest total vs asking_price, per_sqm vs asking_price/built;
    rent total vs asking_rent (monthly), per_sqm vs asking_rent/built. Missing asking_rent → "חסר מחיר", budget = 0 and max level "טובה".
    ≤ budget full; ≤ +15% partial.
  - Score = location 40 + size 30 + budget 30. ≥80 גבוהה, ≥60 טובה, else אפשרית. Any dimension outside the partial band → not shown;
    exactly one dimension in "כמעט" only → "כמעט מתאים".
- Seed dates: stored with an anchor date; on load, if the month changed, all demo dates shift by the difference (Israel time).
- Filters in the route: `#/m/lead?g=<group>&a=<city>&u=urgent` — survives refresh/back; chip "✕" clears.
- 003: same `save_owner_deal(p jsonb)` signature; missing asking_rent = null. Run 003 before any client that sends it.
- Tests: live e2e unchanged with no PL_APP; demo e2e on the built demo-site; matcher table tests; demo-adapter parity
  with qa/local-db.js; PGlite: old payload + new payload after 003; build check (no Supabase script, no Prime logo in demo).

## Files
index.html, demo/demo-db.js, demo/seed.js, demo/assets/*, tools/build-demo.mjs, supabase/003_dashboard.sql,
qa/match.test.mjs, qa/e2e.test.mjs (+ demo run), qa/db.test.mjs (+003), .gitignore.

## Risks
1. Live regression: e2e suite must pass unchanged with no PL_APP; diff review of every live code path.
2. Same origin (waives-io.github.io): demo storage keys and SW scope must not touch the live app's session/cache.
3. False confidence in matches: missing data shows a warning chip, never a silent high score.
4. Mobile overload: urgent list first, each section capped with "הכול".
5. Seed realism: Hebrew names, real cities and coordinates, prices in plausible ranges.
