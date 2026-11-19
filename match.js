// Matches between a lead (מתעניין) and an owner property (בעלים): one score 0–100 from weighted criteria.
// Pure functions, no DOM: the app and the QA tests (qa/match.test.mjs) use the same code.
// Weights and must-conditions come from app_settings.match_settings (הגדרות → התאמות), see supabase/011_matches.sql.
(function () {
  const DEFAULTS = Object.freeze({
    version: 1,
    weights: { category: 25, area: 25, purpose: 20, size: 15, budget: 15, height: 0 },
    must: { deal_type: true, category: false, area: false, purpose: false },
  });
  const CRITERIA = [
    ['category', 'קטגוריה'], ['area', 'אזור'], ['purpose', 'ייעוד'], ['size', 'גודל'], ['budget', 'תקציב'], ['height', 'גובה'],
  ];
  const LABEL = Object.fromEntries(CRITERIA);
  const MUSTS = [['deal_type', 'סוג עסקה (שכירות / קנייה)'], ['category', 'קטגוריה'], ['area', 'אזור'], ['purpose', 'ייעוד']];

  // lead need text → owner deal kind
  const NEED_KIND = { 'לשכור': 'rent', 'לקנות': 'sale', 'להשקעה': 'sale' };
  const num = (v) => (v === null || v === undefined || v === '' || !isFinite(+v) ? null : +v);
  const ids = (a, single) => (Array.isArray(a) && a.length ? a : single ? [single] : []);
  const words = (t) => String(t || '').replace(/[״"'׳]/g, '').split(/[\s/,\-–]+/).filter(w => w.length >= 3);
  const km = (a, b) => {
    const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  const oneDec = (x) => (Math.round(x * 10) / 10).toLocaleString('he-IL');
  const pct = (x) => Math.round(x * 100);

  // settings from the database, completed with defaults (an older or partial value never breaks the screen)
  function settingsOf(v) {
    const s = v && typeof v === 'object' ? v : {};
    const weights = {}, must = {};
    for (const [k] of CRITERIA) weights[k] = Number.isInteger(s.weights?.[k]) ? s.weights[k] : DEFAULTS.weights[k];
    for (const [k] of MUSTS) must[k] = typeof s.must?.[k] === 'boolean' ? s.must[k] : DEFAULTS.must[k];
    if (Object.values(weights).reduce((a, b) => a + b, 0) !== 100) return { version: 1, weights: { ...DEFAULTS.weights }, must };
    return { version: 1, weights, must };
  }

  function dealType(lead, owner, text) {
    const want = new Set(ids(lead.need_ids, lead.need_id).map(id => NEED_KIND[text(id)]).filter(Boolean));
    if (!want.size || !owner.deal_kind) return null;
    return want.has(owner.deal_kind);
  }

  // each criterion: { value: 0..1 | null (unknown), why }
  const crit = {
    category(lead, owner, text) {
      const lc = ids(lead.category_ids), oc = new Set(ids(owner.category_ids));
      if (!lc.length || !oc.size) return { value: null, why: 'קטגוריה לא מולאה' };
      const both = lc.filter(c => oc.has(c));
      return both.length
        ? { value: both.length / lc.length, why: `קטגוריה: ${both.map(text).join(', ')}` }
        : { value: 0, why: 'קטגוריה שונה' };
    },
    purpose(lead, owner, text) {
      const lp = ids(lead.purpose_ids, lead.purpose_id).map(text).filter(Boolean), op = text(owner.purpose_id);
      if (!lp.length || !op) return { value: null, why: 'ייעוד לא מולא' };
      const ow = new Set(words(op));
      const hit = lp.find(t => t === op || words(t).some(w => ow.has(w)));
      return hit ? { value: 1, why: `ייעוד: ${op}` } : { value: 0, why: `ייעוד שונה (${op})` };
    },
    area(lead, owner) {
      const r = num(lead.radius_m), a = { lat: num(lead.lat), lng: num(lead.lng) }, b = { lat: num(owner.lat), lng: num(owner.lng) };
      if (a.lat === null || a.lng === null || b.lat === null || b.lng === null || !(r > 0)) return { value: null, why: 'מיקום לא מולא' };
      const d = km(a, b), rk = r / 1000;
      const value = d <= rk ? 1 : d >= 2 * rk ? 0 : 1 - (d - rk) / rk;
      return { value, why: d <= rk ? `${oneDec(d)} ק״מ, בתוך האזור` : `${oneDec(d)} ק״מ, מחוץ לאזור (${oneDec(rk)} ק״מ)` };
    },
    size(lead, owner) {
      const dunam = lead.size_unit === 'dunam', f = dunam ? 1000 : 1;
      const min = num(lead.size_min ?? lead.size_value), max = num(lead.size_max ?? lead.size_value);
      const have = num(dunam ? owner.plot_sqm : owner.built_sqm);
      if ((min === null && max === null) || !(have > 0)) return { value: null, why: dunam ? 'שטח מגרש לא מולא' : 'גודל לא מולא' };
      const lo = min !== null ? min * f : null, hi = max !== null ? max * f : null;
      const dev = lo !== null && have < lo ? (lo - have) / lo : hi !== null && have > hi ? (have - hi) / hi : 0;
      const value = dev <= 0.2 ? 1 - dev * 2.5 : Math.max(0, 0.5 - (dev - 0.2) * 2.5);   // 20% off → 0.5, 40% off → 0
      const shown = `${Math.round(have).toLocaleString('he-IL')} מ״ר${dunam ? ' מגרש' : ''}`;
      return { value, why: dev ? `${shown}, ${have < lo ? 'קטן' : 'גדול'} ב־${pct(dev)}%` : `${shown}, בטווח` };
    },
    budget(lead, owner) {
      const b = num(lead.budget_value), price = num(owner.asking_price);
      if (owner.deal_kind === 'rent') return { value: null, why: 'השכרה: יושווה אחרי שנדייק' };
      if (!(b > 0) || !(price > 0) || owner.deal_kind !== 'sale') return { value: null, why: 'תקציב או מחיר לא מולאו' };
      if (lead.budget_currency && lead.budget_currency !== 'ILS') return { value: null, why: 'תקציב בדולרים' };
      let cost = price;
      if (lead.budget_kind === 'per_sqm') {
        const built = num(owner.built_sqm); if (!(built > 0)) return { value: null, why: 'אין שטח בנוי לחישוב מחיר למ״ר' };
        cost = price / built;
      }
      const over = cost / b - 1;
      return over <= 0 ? { value: 1, why: 'בתוך התקציב' } : { value: Math.max(0, 1 - over / 0.3), why: `מעל התקציב ב־${pct(over)}%` };
    },
    height() { return { value: null, why: 'אין שדה גובה בנכסים' }; },
  };

  // → { status: 'ok' | 'blocked' | 'missing', score, parts, partial, missing: [labels], reasons: [3 short lines] }
  function score(lead, owner, settings, text) {
    const s = settingsOf(settings), missing = [];
    const dt = dealType(lead, owner, text);
    if (s.must.deal_type) {
      if (dt === false) return { status: 'blocked', reason: 'סוג עסקה' };
      if (dt === null) missing.push('סוג עסקה');
    }
    const parts = CRITERIA.map(([key, label]) => { const c = crit[key](lead, owner, text);
      return { key, label, weight: s.weights[key], why: c.why, value: c.value === null ? null : Math.round(c.value * 1000) / 1000 }; });
    for (const k of ['category', 'area', 'purpose']) {
      if (!s.must[k]) continue;
      const p = parts.find(x => x.key === k);
      if (p.value === 0) return { status: 'blocked', reason: p.label };
      if (p.value === null) missing.push(p.label);
    }
    const weighted = parts.filter(p => p.weight > 0), known = weighted.filter(p => p.value !== null);
    const total = weighted.reduce((a, p) => a + p.weight, 0), W = known.reduce((a, p) => a + p.weight, 0);
    if (!missing.length && (!total || W / total < 0.5)) missing.push(...weighted.filter(p => p.value === null).map(p => p.label));
    if (missing.length) return { status: 'missing', parts, missing };
    const value = Math.round(100 * known.reduce((a, p) => a + p.weight * p.value, 0) / W);
    const good = known.filter(p => p.value >= 0.5).sort((a, b) => b.weight * b.value - a.weight * a.value);
    const bad = known.filter(p => p.value < 0.5).sort((a, b) => b.weight - a.weight);
    const reasons = [...good.slice(0, bad.length ? 2 : 3), ...bad.slice(0, 1)].map(p => (p.value >= 0.5 ? '✓ ' : '✗ ') + p.why);
    return { status: 'ok', score: value, parts, partial: W < total, reasons };
  }

  // all pairs that pass, best first; dismissed: Set of "leadId|ownerId"
  function all(leads, owners, settings, text, { dismissed = new Set(), showDismissed = false } = {}) {
    const out = [];
    for (const l of leads) for (const o of owners) {
      const key = `${l.id}|${o.id}`;
      if (dismissed.has(key) !== showDismissed) continue;
      const r = score(l, o, settings, text);
      if (r.status === 'ok') out.push({ key, lead: l, owner: o, ...r });
      else if (showDismissed) out.push({ key, lead: l, owner: o, ...r, score: null, reasons: r.missing ? ['חסרים פרטים: ' + r.missing.join(', ')] : ['לא עומד בתנאי חובה: ' + r.reason] });
    }
    return out.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || Number(!!a.partial) - Number(!!b.partial));
  }

  const Match = { DEFAULTS, CRITERIA, LABEL, MUSTS, settingsOf, score, all, km };
  if (typeof module !== 'undefined' && module.exports) module.exports = Match; else window.Match = Match;
})();
