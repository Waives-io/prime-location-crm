# Prompt for the demo session: bring Leah's rounds 2 + 3 into the demo

Paste everything below the line into the demo session (worktree `WAIVES Projects/Prime Location demo`, branch `demo-dashboard`).

---

Bring all the changes made to Leah's app (branch `main`) since the demo last took main (`3b1473a`) into the demo, then deploy the demo and check it on the live URL.

## Where things are
- Leah's app: branch `main`. Changes to take: commits `3470838` to `0008cc8`. See them with `git log --oneline 3b1473a..main`.
- Demo: branch `demo-dashboard` in this worktree. `demo-site/` is the clone of `Waives-io/nadlan-demo`. Live URL: https://waives-io.github.io/nadlan-demo/
- Leah's plan for these rounds: `PLAN-round2.md` on main.

## Rules
- **Leah's app:** never change `main`, its design or its database from this session.
- **Demo look:** keep it exactly as it is (plum / copper / stone, split login, module dashboards, side panel, photo cards). Take the behaviour, fields and labels from main, not main's look.
- **No real backend:** the demo stays on `demo/demo-db.js`. No Supabase and no SQL. The 005 and 006 migrations become matching changes in the demo adapter and the demo seed data.

## What to bring in

### Required fields and form
1. Only **phone** and **name** are required. A company also needs the company name. Every other field is optional and may be empty or null. Typed numbers must be > 0. The size range must be valid (min ≤ max).
2. **Entity type** has three choices: private / company / broker.
   - Company → company name (required) + company number (ח.פ.).
   - Broker → broker licence. The broker's name is the contact name.
   - **Owners** show only "פרטי / חברה". "מתווך" appears there only when the contact is already a broker.
3. **Phone:**
   - Strip bidi marks and NBSP, and pull the phone out of the pasted text.
   - Clean the number right on paste.
   - Add the Android contact picker button (`navigator.contacts.select`). It shows only where the browser supports it.

### Leads (מתעניינים)
4. **Size:** a range (`size_min` / `size_max`) with a unit selector instead of one number. Display it with `fmt.sizeRange` / `leadSize(d)`.
5. Rename the date field to **"דדליין"**.
6. **No photos field for leads.** Photos are for owners only.

### Owners (בעלים)
7. The rent block (rented → monthly rent → yield) shows for **rent and for sale**.
8. New **owner notes** field (`owner_notes`).
9. The property card shows **"הערכת מחיר"** right after the areas: the total plus the per-m² estimate.

### Media
10. Field name: **"תמונות / סרטונים"**, with the hint "(עד 5 קבצים, תמונה עד 30MB)". No "לא חובה".
11. Button: **"+ הוספת תמונה / סרטון"**, with the text centered (main's CSS rule `.field label.btn.photo-add{display:flex;margin-bottom:0}`).
12. Video upload stays **off** (`ALLOW_VIDEO`). Photo items get `kind`.

### Added fields
13. **"הסרת השדה"** link under each added field. It asks for confirmation, then calls `DB.hideField(id)`, which sets `hidden: true`.
    - `fieldsOf` skips hidden fields.
    - On save, keep the values of hidden fields: start `custom` from `src.custom`.
    - Add `hideField` to `demo-db.js`.

### Address and map
14. **House numbers:**
    - Use main's `Geo.typedNumber`: "רמת הגולן 11 חולון" reads as 11, "15א" keeps the letter.
    - A result counts as exact only when the house number is the same **and** the result is in the same city (`isExact`, `score`).
15. **Approximate pin:**
    - Tapping the map or dragging the pin clears the "approximate" note.
    - The approximate zoom is 17.
    - Use the new note text from main.
16. **GovMap:**
    - Search tries GovMap first: exact Israeli house numbers, ITM coordinates → WGS84 via proj4.
    - It has a 6-second timeout and falls back to OSM.
    - The key is bound to the domain `waives-io.github.io`, so it also works for `/nadlan-demo/`. Main already has it in `GOVMAP_TOKEN`.
    - Tests must set `window.PL_APP = { govmapToken: '' }`, as main's e2e does.

### Data shape in the demo
17. **Demo adapter and seed:** bring `demo/demo-db.js` and the fake seed data to the new shape:
    - `size_min` / `size_max` instead of a single size.
    - Nullable fields.
    - The broker / company fields.
    - `owner_notes`.
    - Rent + yield on some sale properties.
    - Custom fields with `hidden`.
    - Payload `v: 2`.
    - Bump the seed version, so old browser copies load the new data.
18. **Dashboards and matching:**
    - Lead ↔ property matching works with size **ranges**: a property matches when its size falls inside the lead's range.
    - Matching treats empty or null fields as "no limit", not as 0.
    - Check every dashboard number and badge with empty fields. No NaN and no "undefined".

## Process
- **Merge:** merge `main` into `demo-dashboard`. Resolve conflicts by keeping the demo's look and taking main's behaviour.
- **Tests:**
  - Run main's QA (`qa/e2e.test.mjs`, `qa/govmap.test.mjs`) and the demo tests (`demo.e2e.mjs`, `match.test.mjs`, `contrast.mjs`).
  - Add demo tests for: size range matching, an empty optional field, "הסרת השדה", and owners without the broker choice.
- **Review:** Codex reviews the diff (adversarial review). Fix what it finds.
- **Deploy:**
  - Build into `demo-site/`, push `Waives-io/nadlan-demo`, then wait for the live URL to show the new build.
  - On the live demo, check that it loads with 0 JS errors. Then add a lead with a size range and an owner, and check both cards and the dashboard.
- **Report to Galli:** short plain Hebrew. Say what changed, what you checked on the live URL, and what is still open.
