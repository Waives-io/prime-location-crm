// QA only: in-memory stand-in for the Supabase data layer, injected by Playwright (window.PL_TEST_DB).
// Mirrors the RPC semantics in supabase/schema.sql (phone upsert, atomic save, idempotent id, yield).
(() => {
  const TEST_USER = { email: 'qa@prime.test', password: 'qa-pass-1234' };
  const now = () => new Date().toISOString();
  const id = () => crypto.randomUUID();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const norm = (raw) => {
    let d = String(raw || '').replace(/[\s\-().]/g, '').replace(/^\+/, '');
    if (d.startsWith('00972')) d = '0' + d.slice(5); else if (d.startsWith('972')) d = '0' + d.slice(3);
    if (!/^05\d{8}$/.test(d)) throw new Error('מספר נייד צריך להכיל 10 ספרות ולהתחיל ב-05');
    return d.slice(0, 3) + '-' + d.slice(3);
  };
  const seedOpts = { lead_need: ['לקנות', 'לשכור', 'להשכיר', 'להשקעה'],
    lead_purpose: ['תעשייה קלה', 'תעשייה כבדה', 'משרדים', 'מסחר / חנות', 'פרטי', 'מרלוג', 'מחסן'],
    owner_purpose: ['מחסן', 'תעשייה', 'מסחר', 'חנות'] };
  const db = { options: [], fields: [], contacts: [], lead: [], owner: [] };
  for (const [k, vs] of Object.entries(seedOpts)) vs.forEach((v, i) => db.options.push({ id: id(), list_key: k, value: v, sort: (i + 1) * 10, created_at: now() }));
  const opt = (k, v) => db.options.find(o => o.list_key === k && o.value === v).id;
  const contact = (phone, name, entity_type, company_name = null) => { const c = { id: id(), phone, name, entity_type, company_name, created_at: now() }; db.contacts.push(c); return c.id; };
  const c1 = contact('054-1110001', 'יוסי אברהם', 'company', 'אברהם לוגיסטיקה בע"מ');
  const c2 = contact('052-1110002', 'מירב כהן', 'private');
  const c3 = contact('050-1110003', 'דוד לוי', 'company', 'לוי מתכות');
  db.lead.push(
    { id: id(), contact_id: c1, lead_date: '2026-09-14', need_id: opt('lead_need', 'לשכור'), purpose_id: opt('lead_purpose', 'מרלוג'), size_value: 1200, size_unit: 'sqm', lat: 31.61, lng: 34.7642, radius_m: 5000, height_m: 9, notes: 'רמפת פריקה', budget_value: 45, budget_kind: 'per_sqm', needed_by: '2026-12-01', status: 'active', closed_at: null, custom: {}, created_at: '2026-09-14T08:00:00Z' },
    { id: id(), contact_id: c1, lead_date: '2026-10-02', need_id: opt('lead_need', 'להשקעה'), purpose_id: opt('lead_purpose', 'מסחר / חנות'), size_value: 300, size_unit: 'sqm', lat: 31.668, lng: 34.574, radius_m: 8000, height_m: 4, notes: null, budget_value: 4500000, budget_kind: 'total', needed_by: '2027-03-01', status: 'active', closed_at: null, custom: {}, created_at: '2026-10-02T08:00:00Z' },
    { id: id(), contact_id: c3, lead_date: '2026-07-12', need_id: opt('lead_need', 'לשכור'), purpose_id: opt('lead_purpose', 'משרדים'), size_value: 60, size_unit: 'sqm', lat: 31.665, lng: 34.578, radius_m: 3000, height_m: 3, notes: null, budget_value: 3500, budget_kind: 'total', needed_by: '2026-09-01', status: 'closed', closed_at: '2026-08-28T07:00:00Z', custom: {}, created_at: '2026-07-12T08:00:00Z' });
  db.owner.push(
    { id: id(), contact_id: c2, purpose_id: opt('owner_purpose', 'חנות'), built_sqm: 120, plot_sqm: 150, lat: 31.609, lng: 34.771, address: 'שדרות לכיש 40, קריית גת', description: 'חנות ברחוב ראשי', deal_kind: 'rent', asking_price: 2400000, is_rented: true, monthly_rent: 13000, yield_pct: 6.5, ai_price_per_sqm: null, status: 'active', closed_at: null, custom: {}, created_at: '2026-09-01T08:00:00Z' });

  let session = null;
  try { if (sessionStorage.getItem('pl-qa-session')) session = { user: { id: 'qa' } }; } catch {}
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
  const delay = () => new Promise(r => setTimeout(r, 60));
  window.PL_TEST_DB = {
    calls: [],
    async session() { return session; },
    onAuth() {},
    async signIn(email, password) { await delay();
      if (email !== TEST_USER.email || password !== TEST_USER.password) throw new Error('Invalid login credentials');
      session = { user: { id: 'qa' } }; try { sessionStorage.setItem('pl-qa-session', '1'); } catch {} },
    async signOut() { session = null; try { sessionStorage.removeItem('pl-qa-session'); } catch {} },
    async isMember() { return true; },
    async loadAll() { await delay(); return { options: clone(db.options), fields: clone(db.fields), lead: join(db.lead), owner: join(db.owner) }; },
    async findContact(phone) { return clone(db.contacts.find(c => c.phone === phone) || null); },
    async saveDeal(module, p) {
      await delay(); this.calls.push({ module, p: clone(p) });
      if (window.PL_TEST_FAIL_NEXT_SAVE) { window.PL_TEST_FAIL_NEXT_SAVE = false; throw new Error('network'); }
      const snapshot = clone(db.contacts);
      try {
        const contact_id = upsertContact(p.contact);
        const table = db[module];
        let row = table.find(r => r.id === p.id);
        const { contact, ...fields } = p;
        if (!row) { row = { id: p.id, status: 'active', closed_at: null, created_at: now() }; table.push(row); }
        Object.assign(row, fields, { contact_id });
        if (module === 'owner') row.yield_pct = row.monthly_rent ? Math.round(row.monthly_rent * 12 / row.asking_price * 10000) / 100 : null;
        return { id: p.id, contact_id };
      } catch (e) { db.contacts = snapshot; throw e; }
    },
    async addOption(list_key, value) {
      let o = db.options.find(x => x.list_key === list_key && x.value === value.trim());
      if (!o) { o = { id: id(), list_key, value: value.trim(), sort: 999, created_at: now() }; db.options.push(o); }
      return clone(o);
    },
    async addField(f) { const row = { id: id(), key: 'f_' + Math.random().toString(16).slice(2, 12), created_at: now(), ...f }; db.fields.push(row); return clone(row); },
    async setStatus(module, did, status) { const r = db[module].find(x => x.id === did); r.status = status; r.closed_at = status === 'active' ? null : now(); },
    _db: db,
  };
})();
