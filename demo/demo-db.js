// Demo data layer: same API as supabaseDB() in index.html, kept in this browser only (localStorage).
// Every key starts with "nadlan-demo:v1:" – the live app on the same origin (waives-io.github.io) is never read or touched.
// Mirrors the RPC semantics of supabase/schema.sql: phone upsert, atomic save, idempotent client id, yield.
(() => {
  const NS = 'nadlan-demo:v1:', KEY = NS + 'data', SESSION = NS + 'session';
  const LOGIN = window.PL_APP?.demo || {};
  const store = {
    // a failed write (private mode, full storage) keeps the value in memory, and memory wins from then on
    mem: {},
    get(k) { if (k in this.mem) return this.mem[k]; try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); delete this.mem[k]; } catch { this.mem[k] = v; } },
    del(k) { delete this.mem[k]; try { localStorage.removeItem(k); } catch {} },
  };
  const now = () => new Date().toISOString();
  const id = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const norm = (raw) => {
    let d = String(raw || '').replace(/[\s\-().]/g, '').replace(/^\+/, '');
    if (d.startsWith('00972')) d = '0' + d.slice(5); else if (d.startsWith('972')) d = '0' + d.slice(3);
    if (!/^05\d{8}$/.test(d)) throw new Error('מספר נייד צריך להכיל 10 ספרות ולהתחיל ב-05');
    return d.slice(0, 3) + '-' + d.slice(3);
  };

  // bump when demo/seed.js changes: visitors who did not change anything get the new data on their next visit
  const SEED_VERSION = 3;
  const fresh = () => ({ anchor: today(), dirty: false, seed: SEED_VERSION, ...window.PL_DEMO_SEED(today()) });
  // A new month: an untouched demo is re-seeded; a demo the visitor changed moves all its dates forward,
  // so "this month" and "needed soon" stay meaningful.
  const DATE_FIELDS = { lead: ['lead_date', 'needed_by', 'created_at', 'updated_at', 'closed_at'], owner: ['created_at', 'updated_at', 'closed_at'] };
  function rebase(db) {
    if (db.anchor.slice(0, 7) === today().slice(0, 7)) return db;
    if (!db.dirty) return fresh();
    const shift = Math.round((new Date(today()) - new Date(db.anchor)) / 86400000);
    const move = (v) => { if (!v) return v; const d = new Date(v.length === 10 ? v + 'T00:00:00Z' : v); d.setUTCDate(d.getUTCDate() + shift);
      return v.length === 10 ? d.toISOString().slice(0, 10) : d.toISOString(); };
    // past events never move into the future (a visitor's edit from last week stays in the past); deadlines may
    const PAST = ['lead_date', 'created_at', 'updated_at', 'closed_at'], nowISO = new Date().toISOString(), day = today();
    const cap = (f, v) => !v || !PAST.includes(f) ? v : v.length === 10 ? (v > day ? day : v) : (v > nowISO ? nowISO : v);
    for (const m of ['lead', 'owner']) for (const r of db[m]) {
      for (const f of DATE_FIELDS[m]) r[f] = cap(f, move(r[f]));
      (r.tasks || []).forEach(t => { t.due = move(t.due); });                 // tasks and meetings keep their distance from today
      (r.log || []).forEach(n => { n.at = cap('created_at', move(n.at)); });
    }
    db.anchor = today();
    return db;
  }
  let db;
  try { db = JSON.parse(store.get(KEY)); } catch { db = null; }
  db = db && db.lead && db.anchor && (db.dirty || db.seed === SEED_VERSION) ? rebase(db) : fresh();
  const save = (changed = true) => { if (changed) db.dirty = true; store.set(KEY, JSON.stringify(db)); };
  save(false);

  const join = (rows) => rows.map(r => ({ ...clone(r), contact: clone(db.contacts.find(c => c.id === r.contact_id)) }));
  const upsertContact = (c) => {
    const phone = norm(c.phone);
    if (!c.name?.trim()) throw new Error('name required');
    if (c.entity_type === 'company' && !c.company_name?.trim()) throw new Error('company required');
    let row = db.contacts.find(x => x.phone === phone);
    if (!row) { row = { id: id(), phone, created_at: now() }; db.contacts.push(row); }
    Object.assign(row, { name: c.name.trim(), entity_type: c.entity_type, company_name: c.entity_type === 'company' ? c.company_name.trim() : null });
    return row.id;
  };
  const delay = () => new Promise(r => setTimeout(r, 40));

  // Photos: blobs in this browser's IndexedDB ("nadlan-demo-photos"; localStorage is too small). Memory if IndexedDB fails.
  const files = new Map(), urls = new Map();
  let idbP;
  const idb = () => idbP ||= new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('no indexedDB'));
    const r = indexedDB.open('nadlan-demo-photos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const run = async (mode, fn) => {
    try {
      const d = await idb();
      return await new Promise((res, rej) => {
        const t = d.transaction('files', mode), req = fn(t.objectStore('files'));
        t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error);
      });
    } catch (e) { console.warn('demo photos: memory only', e); return undefined; }
  };
  const forget = (path) => { const u = urls.get(path); if (u) URL.revokeObjectURL(u); urls.delete(path); files.delete(path); };
  const PHOTO_RE = (did, thumb) => new RegExp(`^${did}/[0-9a-f-]+${thumb ? '_t' : ''}\\.(jpg|webp)$`);

  window.PL_DEMO_DB = {
    async session() { return store.get(SESSION) ? { user: { id: 'demo' } } : null; },
    onAuth() {},
    async signIn(email, password) {
      await delay();
      if (email !== String(LOGIN.email).toLowerCase() || password !== LOGIN.password) throw new Error('Invalid login credentials');
      store.set(SESSION, '1');
    },
    async signOut() { store.del(SESSION); },
    async changePassword() { throw new Error('not in demo'); },
    async isMember() { return true; },
    async loadAll() { await delay(); return { options: clone(db.options), fields: clone(db.fields), lead: join(db.lead), owner: join(db.owner) }; },
    async findContact(phone) { return clone(db.contacts.find(c => c.phone === phone) || null); },
    async saveDeal(module, p) {
      await delay();
      const snapshot = clone(db.contacts);
      try {
        const contact_id = upsertContact(p.contact);
        const table = db[module];
        let row = table.find(r => r.id === p.id);
        const { contact, ...fields } = p;
        if (!row) { row = { id: p.id, status: 'active', closed_at: null, created_at: now() }; table.push(row); }
        Object.assign(row, fields, { contact_id, updated_at: now() });
        if (module === 'owner') row.yield_pct = row.monthly_rent ? Math.round(row.monthly_rent * 12 / row.asking_price * 10000) / 100 : null;
        save();
        return { id: p.id, contact_id };
      } catch (e) { db.contacts = snapshot; throw e; }
    },
    async addOption(list_key, value) {
      let o = db.options.find(x => x.list_key === list_key && x.value === value.trim());
      if (!o) { o = { id: id(), list_key, value: value.trim(), match_group: null, sort: 999, created_at: now() }; db.options.push(o); }
      o.hidden = false; save();
      return clone(o);
    },
    async updateOption(oid, patch) {
      const o = db.options.find(x => x.id === oid);
      if (patch.value && db.options.some(x => x.id !== oid && x.list_key === o.list_key && x.value === patch.value)) { const e = new Error('duplicate key'); e.code = '23505'; throw e; }
      Object.assign(o, patch); save(); return clone(o);
    },
    async addField(f) { const row = { id: id(), key: 'f_' + Math.random().toString(16).slice(2, 12), created_at: now(), ...f }; db.fields.push(row); save(); return clone(row); },
    async setStatus(module, did, status) {
      const r = db[module].find(x => x.id === did);
      r.status = status; r.closed_at = status === 'active' ? null : now(); r.updated_at = now(); save();
    },
    async uploadPhoto(path, blob) { await delay(); files.set(path, blob); await run('readwrite', st => st.put(blob, path)); },
    async photoUrls(paths) {
      const out = {};
      for (const p of paths) {
        if (!urls.has(p)) {
          const blob = files.get(p) || await run('readonly', st => st.get(p));
          if (blob) { files.set(p, blob); urls.set(p, URL.createObjectURL(blob)); }
        }
        if (urls.has(p)) out[p] = urls.get(p);
      }
      return out;
    },
    // like the live delete policy: a file still used by a deal is kept
    async deletePhotos(paths) {
      const used = new Set(['lead', 'owner'].flatMap(m => db[m].flatMap(r => (r.photos || []).flatMap(x => [x.path, x.thumb]))));
      const gone = paths.filter(p => !used.has(p));
      gone.forEach(forget);
      if (gone.length) await run('readwrite', st => { let r; gone.forEach(p => { r = st.delete(p); }); return r; });
    },
    // same checks as set_deal_photos in supabase/004_photos.sql
    async setPhotos(module, did, photos) {
      await delay();
      if (!Array.isArray(photos)) throw new Error('רשימת תמונות לא תקינה');
      if (photos.length > 5) throw new Error('אפשר לשמור עד 5 תמונות');
      if (photos.some(x => !PHOTO_RE(did, false).test(x?.path || '') || !PHOTO_RE(did, true).test(x?.thumb || ''))) throw new Error('נתיב תמונה לא תקין');
      const row = db[module].find(r => r.id === did); if (!row) throw new Error('העסקה לא נמצאה');
      const previous = row.photos || [];
      row.photos = photos.map(x => ({ path: x.path, thumb: x.thumb, w: Math.max(0, Math.min(20000, x.w | 0)), h: Math.max(0, Math.min(20000, x.h | 0)) }));
      row.updated_at = now(); save();
      return { id: did, previous };
    },
    // demo-only activity on a deal: tasks / meetings (text + date/time + done) and a notes log (d.log – d.notes is the form's own text field)
    async addTask(module, did, t) {
      await delay();
      const row = db[module].find(r => r.id === did); if (!row) throw new Error('העסקה לא נמצאה');
      if (!String(t.text || '').trim() || !t.due) throw new Error('חסר טקסט או מועד');
      const task = { id: id(), kind: t.kind === 'meeting' ? 'meeting' : 'task', text: String(t.text).trim(), due: t.due, done: false };
      (row.tasks ||= []).push(task); row.updated_at = now(); save();
      return clone(task);
    },
    async setTaskDone(module, did, tid, done) {
      const row = db[module].find(r => r.id === did), t = row?.tasks?.find(x => x.id === tid); if (!t) throw new Error('המשימה לא נמצאה');
      t.done = !!done; row.updated_at = now(); save();
    },
    async addNote(module, did, text) {
      await delay();
      const row = db[module].find(r => r.id === did); if (!row) throw new Error('העסקה לא נמצאה');
      if (!String(text || '').trim()) throw new Error('הערה ריקה');
      const note = { id: id(), text: String(text).trim(), at: now() };
      (row.log ||= []).push(note); row.updated_at = now(); save();
      return clone(note);
    },
    async reset() { db = fresh(); save(false); [...files.keys(), ...urls.keys()].forEach(forget); await run('readwrite', st => st.clear()); },
  };
})();
