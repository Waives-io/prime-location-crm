// Demo data layer: same API as supabaseDB() in index.html, kept in this browser only (localStorage).
// Every key starts with "nadlan-demo:v1:" – the live app on the same origin (waives-io.github.io) is never read or touched.
// Mirrors the RPC semantics of supabase/schema.sql: phone upsert, atomic save, idempotent client id, yield.
(() => {
  const NS = 'nadlan-demo:v1:', KEY = NS + 'data', SESSION = NS + 'session';
  const LOGIN = window.PL_APP?.demo || {};
  const store = {
    mem: {},
    get(k) { try { return localStorage.getItem(k); } catch { return this.mem[k] ?? null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { this.mem[k] = v; } },
    del(k) { try { localStorage.removeItem(k); } catch { delete this.mem[k]; } },
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

  const fresh = () => ({ anchor: today(), dirty: false, ...window.PL_DEMO_SEED(today()) });
  // A new month: an untouched demo is re-seeded; a demo the visitor changed moves all its dates forward,
  // so "this month" and "needed soon" stay meaningful.
  const DATE_FIELDS = { lead: ['lead_date', 'needed_by', 'created_at', 'updated_at', 'closed_at'], owner: ['created_at', 'updated_at', 'closed_at'] };
  function rebase(db) {
    if (db.anchor.slice(0, 7) === today().slice(0, 7)) return db;
    if (!db.dirty) return fresh();
    const shift = Math.round((new Date(today()) - new Date(db.anchor)) / 86400000);
    const move = (v) => { if (!v) return v; const d = new Date(v.length === 10 ? v + 'T00:00:00Z' : v); d.setUTCDate(d.getUTCDate() + shift);
      return v.length === 10 ? d.toISOString().slice(0, 10) : d.toISOString(); };
    for (const m of ['lead', 'owner']) for (const r of db[m]) for (const f of DATE_FIELDS[m]) r[f] = move(r[f]);
    db.anchor = today();
    return db;
  }
  let db;
  try { db = JSON.parse(store.get(KEY)); } catch { db = null; }
  db = db && db.lead && db.anchor ? rebase(db) : fresh();
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
    async reset() { db = fresh(); save(false); },
  };
})();
