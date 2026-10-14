# PLAN – deal photos (Leah's live app + demo)

## Goal
Optional photos (up to 5) on every lead and owner deal, added in the "מיקום" section of the form.
First photo = thumbnail on the card and on the list row; tap opens all photos large.

## Approach
- **Leah (main branch, live Supabase):** migration `supabase/004_photos.sql`
  - `photos jsonb not null default '[]'` on `lead_deals` and `owner_deals`, CHECK array length ≤ 5.
    Each item `{ path, thumb, w, h }` – storage paths, never URLs.
  - Private Storage bucket `deal-photos` (2 MB per file, image/jpeg + image/webp only).
  - `storage.objects` policies for bucket `deal-photos`: select / insert / delete only when `is_member()`. anon nothing.
  - `save_lead_deal` / `save_owner_deal` replaced to also save `photos` (validated: array, ≤ 5, every path starts with `<deal id>/`).
- **Client (index.html):** pick from gallery/camera (`accept="image/*"`, multiple), drag-and-drop and Ctrl+V on desktop.
  Compress in the browser: full 1600px JPEG ~0.8, thumb 400px. Upload on pick to `<deal id>/<uuid>.jpg` + `_t.jpg`
  (deal id already exists before the first save), show preview + progress, remove (×), reorder by "make first".
  Files removed in the form are deleted from storage only after a successful save. Leaving a new form unsaved deletes
  what was uploaded in it (best effort). Display through signed URLs (1 h), batched per screen, cached.
- **Demo (demo-dashboard branch):** same UI; `demo-db.js` keeps photos as Blobs in IndexedDB; adapter returns object URLs.
- **Order of release:** run 004 on the live project → deploy main → merge main into demo-dashboard → rebuild demo.

## Files
`supabase/004_photos.sql`, `index.html`, `qa/local-db.js`, `qa/db.test.mjs`, `qa/e2e.test.mjs`; later `demo/demo-db.js`.

## Risks
1. Storage policy mistakes expose client photos → test anon + non-member cannot list/read/upload/delete.
2. Orphan files (upload then abandon / failed save) → cleanup on leave; acceptable leftovers on crashes.
3. Free tier: 1 GB storage, egress 5 GB/month → compression keeps ~300 KB per photo.
4. Big phone photos (HEIC on iPhone) → browser decodes via `<img>`/canvas; HEIC unsupported in some browsers → clear Hebrew error.
5. Merge conflict main ↔ demo-dashboard in index.html.
