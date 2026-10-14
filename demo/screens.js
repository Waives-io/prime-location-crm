// Demo screens for "נדל״ן בע״מ" (Galli's mockups, 2026-10-14): split login, a dashboard per module
// (מתעניינים: KPIs + filters + table + side panel; נכסים: KPIs + advanced filters + photo cards + side panel)
// and an icon side menu. Loaded before index.html's script; index.html calls window.PL_VIEWS[route] when present.
// Uses the app's globals (deals, optText, matchesFor, DB, S, …) at call time. Leah's app never loads this file.
(() => {
  /* ── icons (Lucide, ISC licence) ── */
  const P = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
    sliders: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z"/>',
    chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    arrow: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    reset: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    gauge: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    fileplus: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  };
  const I = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

  /* ── small helpers ── */
  const cf = (d, k) => d.custom?.[k] ?? '';
  const STAGE = { 'חם': 'hot', 'בתהליך': 'progress', 'חדש': 'new', 'לא פעיל': 'idle' };
  const PSTATUS = { 'פעיל': 'active', 'פנוי': 'vacant', 'מושכר': 'rented', 'בתהליך שיווק': 'marketing' };
  const stageChip = (s) => s ? `<span class="stage stage-${STAGE[s] || 'idle'}">${s === 'חם' ? I('flame', 'sm') : ''}${esc(s)}</span>` : '';
  const pChip = (s) => s ? `<span class="pstatus ps-${PSTATUS[s] || 'active'}"><i aria-hidden="true"></i>${esc(s)}</span>` : '';
  const initials = (name) => String(name || '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('');
  const money = (n, cur) => fmt.ltr(fmt.money(n, cur));
  const short = (n) => n >= 1e6 ? `₪${fmt.num(Math.round(n / 1e5) / 10)}M` : `₪${fmt.num(Math.round(n))}`;
  const budgetText = (d) => d.budget_kind === 'per_sqm' ? `${fmt.money(d.budget_value, d.budget_currency)} למ״ר` : `${d.budget_currency === 'USD' ? '$' : '₪'}${fmt.num(d.budget_value >= 1e6 ? Math.round(d.budget_value / 1e5) / 10 : d.budget_value)}${d.budget_value >= 1e6 ? 'M' : ''}`;
  const lastContact = (d) => [d.updated_at, ...(d.log || []).map(n => n.at)].filter(Boolean).sort().at(-1);
  const when = (iso) => {
    const n = daysFrom(iso), t = new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
    return n === 0 ? `היום <bdi dir="ltr">${t}</bdi>` : n === -1 ? `אתמול <bdi dir="ltr">${t}</bdi>` : n === 1 ? `מחר <bdi dir="ltr">${t}</bdi>` : n < 0 ? `לפני ${-n} ימים` : `${fmt.ltr(fmt.date(iso).slice(0, 5))} <bdi dir="ltr">${t}</bdi>`;
  };
  const bestMatch = (d) => matchesFor('lead', d).filter(m => !m.near)[0] || null;
  const pct = (v) => `<bdi class="num">${v}%</bdi>`;
  const trend = (now, prev, unit = '', lowerIsBetter = false) => {
    if (!prev) return '';
    const ch = Math.round((now - prev) / prev * 100), good = lowerIsBetter ? ch < 0 : ch > 0;
    return `<span class="trend ${ch === 0 ? '' : good ? 'up' : 'down'}">${ch > 0 ? '▲' : ch < 0 ? '▼' : '='} <bdi class="num">${Math.abs(ch)}%</bdi></span> מהחודש הקודם`;
  };
  const coverOf = (d) => d.photos?.length ? { photo: d.photos[0].thumb } : { src: d.cover || 'assets/photos/p-office-2.jpg' };
  const img = (d, cls, big = false) => { const c = coverOf(d), path = big && d.photos?.length ? d.photos[0].path : c.photo;
    return path ? `<img class="${cls}" data-photo="${esc(path)}" alt="">` : `<img class="${cls}" src="${esc(c.src)}" alt="">`; };
  const kpi = (icon, label, value, foot, href, extra = '') => `<a class="kpi-card" href="${href}">
    <span class="kpi-ic">${I(icon)}</span><span class="kpi-txt"><span class="kpi-label">${label}</span>
    <strong class="kpi-value">${value}</strong>${extra}<span class="kpi-foot">${foot}</span></span></a>`;
  const opt = (v, t, cur) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(t)}</option>`;
  const sel = (id, label, cur, pairs) => `<label class="fsel"><span class="sr-only">${label}</span><select class="input" id="${id}" aria-label="${label}">${pairs.map(([v, t]) => opt(v, t, cur)).join('')}</select></label>`;
  const inMonth = (iso, off = 0) => inMonthOf(iso, monthOf(off));
  const hero = (img, title, sub) => `<header class="mod-hero"><div class="mod-title"><h1>${title}</h1><p>${sub}</p></div>
    <div class="mod-banner" style="background-image:url('${img}')" role="img" aria-label="מבני משרדים ותעשייה"></div></header>`;

  /* ── shell: plum side menu with icons (desktop), tabs at the top + "+ חדש" at the bottom (phone) ── */
  const NAV = [['lead', 'מתעניינים', 'users', '#/m/lead'], ['owner', 'נכסים', 'building', '#/m/owner'], ['matches', 'התאמות', 'link', '#/matches']];
  const navOf = (r) => r.module || (['matches', 'kpi'].includes(r.name) ? 'matches' : 'lead');
  function shell(r, html) {
    const cur = navOf(r);
    const items = (cls) => NAV.map(([k, t, ic, href]) => `<a class="${cls}" href="${href}" ${cur === k ? 'aria-current="page"' : ''}>${I(ic)}<span>${t}</span>${cls === 'mod' && cur === k ? I('arrow', 'cur-arrow') : ''}</a>`).join('');
    const addBottom = r.module && r.name === 'list';
    return `${demoBanner()}<div class="shell v3-shell ${addBottom ? 'has-bottom-new' : ''}">
      <nav class="side-nav" aria-label="עמודים">
        <a href="#/m/lead" class="brand-side"><img src="${APP.logoOnDark}" alt="${APP.name} – לדף הבית"></a>
        ${items('mod')}
        <div class="spacer"></div>
        <button class="link side-act" data-act="demo-reset">${I('reset')}<span>איפוס הדמו</span></button>
        <button class="link side-act" data-act="logout">${I('logout')}<span>יציאה</span></button>
      </nav>
      <div class="main">${r.name !== 'form' ? `<nav class="top-nav" aria-label="עמודים">${items('')}</nav>` : ''}${html}</div>
      ${addBottom ? `<div class="bottom-new"><a class="nav-new" href="#/m/${r.module}/new">+ חדש</a></div>` : ''}
    </div>`;
  }

  /* ── login: photo half + form half ── */
  function login(app) {
    renderLogin(app);
    document.body.dataset.screen = 'login';
    const form = $('#login'), main = app.querySelector('main');
    main.classList.add('login-split');
    main.insertAdjacentHTML('afterbegin', `<aside class="login-photo" style="background-image:url('assets/photos/login-hero.jpg')">
      <h2 class="sr-only">ניהול נדל״ן במקום אחד – תכנון, מעקב ובקרה על כל הנכסים, הפרויקטים והמשימות שלכם</h2></aside>`);
    form.querySelector('img').insertAdjacentHTML('afterend', `<h1 class="login-title">ברוכים הבאים</h1>
      <p class="login-sub">התחברו למערכת לניהול הנכסים והפרויקטים</p>`);
    $('label[for=email]').textContent = 'כתובת אימייל';
    $('#login-err').insertAdjacentHTML('beforebegin', `<div class="login-row">
      <label class="remember"><input type="checkbox" checked> זכור אותי</label>
      <button type="button" class="link" data-demo-msg="בדמו אין צורך – הסיסמה כבר מולאה עבורך">שכחת סיסמה?</button></div>`);
    form.insertAdjacentHTML('beforeend', `<p class="login-foot">אין לכם חשבון? <button type="button" class="link" data-demo-msg="זו סביבת הדגמה. לגישה למערכת אמיתית: contact@waives.io">צור קשר לקבלת גישה</button></p>`);
    main.addEventListener('click', (e) => { const b = e.target.closest('[data-demo-msg]'); if (b) toast(b.dataset.demoMsg); });
  }

  /* ── side panel helpers (tasks + notes) ── */
  const openTasks = (d) => (d.tasks || []).filter(t => !t.done).sort((a, b) => a.due.localeCompare(b.due));
  const taskList = (m, d, title, addLabel) => `<section class="dp-sec"><div class="dp-sec-head"><h3>${title}</h3>
      <button type="button" class="btn sm" data-dp="task">${I('plus', 'sm')} ${addLabel}</button></div>
    ${openTasks(d).length ? `<ul class="tasks">${openTasks(d).slice(0, 4).map(t => `<li class="${daysFrom(t.due) < 0 ? 'late' : ''}">
      <label><input type="checkbox" data-task="${t.id}"> <span class="t-ic">${I(t.kind === 'meeting' ? 'calendar' : 'check', 'sm')}</span>
      <span class="t-txt">${esc(t.text)}</span></label><span class="t-due">${when(t.due)}</span></li>`).join('')}</ul>`
      : '<p class="hint">אין משימות פתוחות.</p>'}</section>`;
  function activityDialog(m, d, kind) {
    const dlg = $('#dlg'), title = kind === 'note' ? 'הוספת הערה' : kind === 'meeting' ? 'קביעת פגישה' : 'הוספת משימה';
    const now = new Date(Date.now() + 864e5); now.setMinutes(0, 0, 0);
    const local = new Date(now - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    dlg.innerHTML = `<form id="act-form" novalidate><h2>${title}</h2>
      <div class="field"><label for="act-text">${kind === 'note' ? 'ההערה' : kind === 'meeting' ? 'נושא הפגישה' : 'המשימה'}</label>
        ${kind === 'note' ? '<textarea class="input" id="act-text"></textarea>' : `<input class="input" id="act-text" value="${kind === 'meeting' ? 'פגישה עם ' + esc(d.contact?.name || '') : ''}">`}
        <p class="err" id="act-err" aria-live="polite"></p></div>
      ${kind === 'note' ? '' : `<div class="field"><label for="act-due">מועד</label><input class="input num" type="datetime-local" id="act-due" value="${local}"></div>`}
      <div class="stack"><button class="btn primary" type="submit">שמירה</button><button class="link" type="button" data-x>ביטול</button></div></form>`;
    dlg.onclick = (e) => { if (e.target === dlg || e.target.closest('[data-x]')) dlg.close(); };
    $('#act-form').onsubmit = async (e) => {
      e.preventDefault();
      const text = $('#act-text').value.trim(); if (!text) { $('#act-err').textContent = 'יש לכתוב משהו'; $('#act-text').focus(); return; }
      const btn = $('button[type=submit]', dlg); btn.disabled = true;
      try {
        if (kind === 'note') await DB.addNote(m, d.id, text);
        else await DB.addTask(m, d.id, { kind, text, due: new Date($('#act-due').value).toISOString() });
        dlg.close(); await reload(); render(); toast(kind === 'note' ? 'ההערה נשמרה' : kind === 'meeting' ? 'הפגישה נקבעה' : 'המשימה נוספה');
      } catch (ex) { console.error(ex); $('#act-err').textContent = 'השמירה נכשלה. נסי שוב.'; btn.disabled = false; }
    };
    dlg.showModal(); $('#act-text').focus();
  }
  function wirePanel(m, d, root) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dp]'); if (!b) return;
      if (b.dataset.dp === 'close') { st[m].sel = null; draw[m]?.(); return; }
      if (b.dataset.dp === 'deal-close') return closeDialog(m, d);
      activityDialog(m, d, b.dataset.dp);
    });
    root.addEventListener('change', async (e) => {
      const c = e.target.closest('[data-task]'); if (!c) return;
      try { await DB.setTaskDone(m, d.id, c.dataset.task, c.checked); await reload(); toast('המשימה סומנה כבוצעה', { label: 'ביטול', run: async () => { await DB.setTaskDone(m, d.id, c.dataset.task, false); await reload(); render(); } }); render(); }
      catch (ex) { console.error(ex); toast('הפעולה נכשלה. נסי שוב.'); }
    });
    Photos.hydrate(root);
  }

  /* ── state per module (filters, page, selection) ── */
  const st = {
    lead: { q: '', quick: 'active', stage: '', g: '', budget: '', city: '', page: 1, size: 10, sort: 'created', sel: undefined },
    owner: { q: '', city: '', g: '', size: '', price: '', pstatus: '', sort: 'updated', view: 'cards', sel: undefined },
  };
  const draw = {};
  const cities = (list) => [...new Set(list.map(cityOf))].sort((a, b) => a.localeCompare(b, 'he'));

  /* ═════════ מתעניינים ═════════ */
  const QUICK = { all: 'כל המתעניינים', active: 'פעילים', overdue: 'באיחור', week: 'נדרש השבוע', stale: 'לא עודכנו 30+ יום', new: 'חדשים החודש', archive: 'ארכיון' };
  const BUDGETS = { sqm: 'לפי מ״ר', t2: 'סה״כ עד ₪2M', t6: 'סה״כ ₪2M–₪6M', tmax: 'סה״כ מעל ₪6M' };
  function leadRows() {
    const s = st.lead, q = s.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    const ils = (d) => d.budget_value * (d.budget_currency === 'USD' ? USD_RATE : 1);
    let rows = deals('lead').filter(d => {
      if (q) return dealSearchText(d).includes(q) || (qd.length >= 3 && dealSearchText(d).includes(qd)) || String(cf(d, 'f_email')).includes(q);
      const ok = { all: true, active: d.status === 'active', archive: d.status !== 'active', overdue: isOverdue(d), week: isThisWeek(d), stale: isStale(d), new: inMonth(d.lead_date) }[s.quick];
      return ok;
    }).filter(d => (!s.stage || cf(d, 'f_stage') === s.stage) && (!s.g || optGroup(d.purpose_id) === s.g) && (!s.city || cityOf(d) === s.city)
      && (!s.budget || (s.budget === 'sqm' ? d.budget_kind === 'per_sqm' : d.budget_kind === 'total' && (s.budget === 't2' ? ils(d) <= 2e6 : s.budget === 't6' ? ils(d) > 2e6 && ils(d) <= 6e6 : ils(d) > 6e6))));
    const key = { created: (d) => d.lead_date + d.created_at, contact: (d) => lastContact(d) || '', score: (d) => String(bestMatch(d)?.score ?? -1).padStart(3, '0') }[s.sort];
    return rows.sort((a, b) => key(b).localeCompare(key(a)));
  }
  function leadPanel(d) {
    const c = d.contact || {}, soon = d.status === 'active' && d.needed_by && daysFrom(d.needed_by) <= 7;
    return `<div class="dp" data-id="${d.id}">
      <div class="dp-head"><h2>פרטי מתעניין</h2><button type="button" class="icon-btn" data-dp="close" aria-label="סגירת הפרטים">${I('x')}</button></div>
      <div class="who"><span class="avatar" aria-hidden="true">${esc(initials(c.name))}</span>
        <div><strong>${esc(c.name)}</strong><small>${c.entity_type === 'company' ? esc(c.company_name) : 'לקוח פרטי'}</small></div>${stageChip(cf(d, 'f_stage'))}</div>
      <ul class="contact-lines">
        <li>${I('phone', 'sm')}<a href="${Phone.tel(c.phone)}">${fmt.ltr(c.phone)}</a><a class="wa" href="${Phone.wa(c.phone)}" target="_blank" rel="noopener">${I('chat', 'sm')} שלח הודעה</a></li>
        ${cf(d, 'f_email') ? `<li>${I('mail', 'sm')}<a href="mailto:${esc(cf(d, 'f_email'))}">${fmt.ltr(cf(d, 'f_email'))}</a></li>` : ''}
        <li>${I('pin', 'sm')}<span>${esc(d.address || cityOf(d))}</span></li>
      </ul>
      ${cf(d, 'f_source') ? `<p class="source"><b>מקור הגעה:</b> ${esc(cf(d, 'f_source'))}</p>` : ''}
      <section class="dp-sec prefs"><div class="dp-sec-head"><h3>העדפות וחיפוש</h3>${I('building', 'muted')}</div><dl>
        <dt>צורך</dt><dd>${esc(optText(d.need_id))}</dd>
        <dt>סוג נכס</dt><dd>${esc(optText(d.purpose_id))}</dd>
        <dt>אזור</dt><dd>${esc(cityOf(d))} · רדיוס ${fmt.bi(fmt.num(d.radius_m / 1000) + ' ק״מ')}</dd>
        <dt>תקציב</dt><dd>${fmt.ltr(budgetText(d))}</dd>
        <dt>שטח מבוקש</dt><dd>${fmt.bi(fmt.size(d.size_value, d.size_unit))}</dd>
        <dt>מועד כניסה</dt><dd>${soon ? dateBadge(d.needed_by, dueTone(d), dueWord(daysFrom(d.needed_by))) : fmt.ltr(fmt.date(d.needed_by))}</dd>
        ${d.notes ? `<dt>הערות</dt><dd>${esc(d.notes)}</dd>` : ''}
      </dl></section>
      <section class="dp-sec"><h3>פעולות מהירות</h3><div class="quick">
        <a class="btn wa-btn" href="${Phone.wa(c.phone)}" target="_blank" rel="noopener">${I('chat', 'sm')} שלח וואטסאפ</a>
        <a class="btn dark" href="${Phone.tel(c.phone)}">${I('phone', 'sm')} התקשר</a>
        <button type="button" class="btn" data-dp="note">${I('note', 'sm')} הוסף הערה</button>
        <button type="button" class="btn accent" data-dp="meeting">${I('calendar', 'sm')} קבע פגישה</button></div></section>
      ${taskList('lead', d, 'משימות קרובות', 'הוסף משימה')}
      ${(d.log || []).length ? `<section class="dp-sec"><h3>יומן הערות</h3><ul class="notes">${[...d.log].reverse().slice(0, 3).map(n => `<li><p>${esc(n.text)}</p><small>${when(n.at)}</small></li>`).join('')}</ul></section>` : ''}
      ${matchSection('lead', d)}
      <div class="dp-actions"><a class="btn" href="#/m/lead/${d.id}/edit">עריכה</a><a class="btn" href="#/m/lead/${d.id}">כרטיס מלא</a>
        ${d.status === 'active' ? '<button type="button" class="btn" data-dp="deal-close">סגירת עסקה</button>' : ''}</div></div>`;
  }

  function leadsView() {
    const all = deals('lead'), act = all.filter(d => d.status === 'active');
    const newNow = all.filter(d => inMonth(d.lead_date)), newPrev = all.filter(d => inMonth(d.lead_date, -1));
    const hot = act.filter(d => cf(d, 'f_stage') === 'חם'), stale = act.filter(isStale);
    const avg = (list) => list.length ? Math.round(list.reduce((a, d) => a + (d.response_h || 0), 0) / list.length * 10) / 10 : 0;
    const rNow = avg(newNow), rPrev = avg(newPrev);
    const html = `${hero('assets/photos/banner-leads.jpg', 'מתעניינים', 'ניהול לידים, מעקב וטיפול בהזדמנויות')}
      <div class="content mod">
        <section class="mod-kpis" aria-label="מדדים">
          ${kpi('userPlus', 'מתעניינים חדשים', `<bdi class="num">${newNow.length}</bdi>`, trend(newNow.length, newPrev.length), '#/m/lead?k=new')}
          ${kpi('flame', 'מתעניינים חמים', `<bdi class="num">${hot.length}</bdi>`, `${hot.filter(isThisWeek).length} נדרשים השבוע`, '#/m/lead?k=hot')}
          ${kpi('users', 'מתעניינים לא פעילים', `<bdi class="num">${stale.length}</bdi>`, 'ללא פעילות 30+ יום', '#/m/lead?k=stale')}
          ${kpi('clock', 'זמן תגובה ממוצע', `<bdi class="num">${fmt.num(rNow)}</bdi> שעות`, trend(rNow, rPrev, '', true), '#/m/lead?k=new')}
        </section>
        <div class="mod-body">
          <section class="mod-main panel">
            <div class="filters"><h2>חיפוש וסינון</h2>
              <label class="search-box">${I('search', 'sm')}<span class="sr-only">חיפוש</span><input class="input" id="lq" type="search" placeholder="חפש לפי שם, טלפון, מייל או הערה…" value="${esc(st.lead.q)}"></label>
              <div class="frow">
                ${sel('l-quick', 'הצגה', st.lead.quick, Object.entries(QUICK))}
                ${sel('l-stage', 'סטטוס', st.lead.stage, [['', 'סטטוס – הכול'], ...Object.keys(STAGE).map(s => [s, s])])}
                ${sel('l-g', 'סוג נכס', st.lead.g, [['', 'סוג נכס – הכול'], ...Object.entries(MATCH_GROUPS)])}
                ${sel('l-budget', 'תקציב', st.lead.budget, [['', 'תקציב – הכול'], ...Object.entries(BUDGETS)])}
                ${sel('l-city', 'ערים', st.lead.city, [['', 'ערים – הכול'], ...cities(all).map(c => [c, c])])}
                <button type="button" class="btn ghost" id="l-clear">${I('filter', 'sm')} נקה סינון</button>
              </div></div>
            <div class="table-wrap"><table class="lead-table">
              <thead><tr><th scope="col">שם מלא</th><th scope="col">סוג לקוח</th><th scope="col">ערים מועדפות</th><th scope="col">תקציב</th><th scope="col">סוג נכס</th>
                <th scope="col">ציון התאמה</th><th scope="col">סטטוס</th><th scope="col">מקור הגעה</th><th scope="col">יצירת קשר אחרונה</th></tr></thead>
              <tbody id="l-rows"></tbody></table></div>
            <div class="pager" id="l-pager"></div>
          </section>
          <aside class="mod-side panel" id="l-panel" aria-live="polite"></aside>
        </div>
      </div>`;
    const mount = () => {
      const s = st.lead;
      const apply = () => { s.page = 1; draw.lead(); };
      $('#lq').oninput = (e) => { s.q = e.target.value; apply(); };
      [['l-quick', 'quick'], ['l-stage', 'stage'], ['l-g', 'g'], ['l-budget', 'budget'], ['l-city', 'city']].forEach(([id, k]) => $('#' + id).onchange = (e) => { s[k] = e.target.value; apply(); });
      $('#l-clear').onclick = () => { Object.assign(s, { q: '', quick: 'active', stage: '', g: '', budget: '', city: '', page: 1 }); render(); };
      draw.lead = () => {
        const rows = leadRows(), pages = Math.max(1, Math.ceil(rows.length / s.size)); s.page = Math.min(s.page, pages);
        const slice = rows.slice((s.page - 1) * s.size, s.page * s.size);
        if (s.sel === undefined) s.sel = slice[0]?.id || null;
        const tb = $('#l-rows'); if (!tb) return;
        tb.innerHTML = slice.length ? slice.map(d => { const c = d.contact || {}, bm = bestMatch(d), due = d.status === 'active' && d.needed_by && daysFrom(d.needed_by) <= 7;
          return `<tr data-id="${d.id}" tabindex="0" ${s.sel === d.id ? 'aria-selected="true"' : ''}>
            <th scope="row"><span class="avatar sm" aria-hidden="true">${esc(initials(c.name))}</span><span class="nm">${esc(c.name)}</span>${due ? dateBadge(d.needed_by, dueTone(d), dueWord(daysFrom(d.needed_by))) : ''}</th>
            <td>${c.entity_type === 'company' ? 'חברה' : 'לקוח פרטי'}</td><td>${esc(cityOf(d))}</td><td>${fmt.ltr(budgetText(d))}</td>
            <td>${esc(MATCH_GROUPS[optGroup(d.purpose_id)] || optText(d.purpose_id))}</td>
            <td>${bm ? `<span class="score lvl-${bm.level}">${pct(bm.score)}</span>` : '<span class="score none">—</span>'}</td>
            <td>${stageChip(cf(d, 'f_stage'))}</td><td>${esc(cf(d, 'f_source'))}</td><td class="when">${lastContact(d) ? when(lastContact(d)) : ''}</td></tr>`; }).join('')
          : `<tr><td colspan="9" class="state">${s.q ? `לא נמצאו תוצאות ל־"${esc(s.q)}"` : 'אין מתעניינים בסינון הזה.'}</td></tr>`;
        const from = rows.length ? (s.page - 1) * s.size + 1 : 0, to = Math.min(rows.length, s.page * s.size);
        $('#l-pager').innerHTML = `<label class="fsel">הצגה: <select class="input" id="l-size">${[10, 20, 50].map(n => opt(n, n, s.size)).join('')}</select></label>
          <label class="fsel">מיון: <select class="input" id="l-sort">${opt('created', 'לפי תאריך פנייה', s.sort)}${opt('contact', 'לפי קשר אחרון', s.sort)}${opt('score', 'לפי ציון התאמה', s.sort)}</select></label>
          <span class="count"><bdi class="num">${from}–${to}</bdi> מתוך <bdi class="num">${rows.length}</bdi> מתעניינים</span>
          <span class="pages"><button type="button" class="pg" data-pg="${s.page - 1}" ${s.page <= 1 ? 'disabled' : ''} aria-label="הקודם">›</button>
          ${Array.from({ length: pages }, (_, i) => `<button type="button" class="pg" data-pg="${i + 1}" ${i + 1 === s.page ? 'aria-current="page"' : ''}>${i + 1}</button>`).join('')}
          <button type="button" class="pg" data-pg="${s.page + 1}" ${s.page >= pages ? 'disabled' : ''} aria-label="הבא">‹</button></span>`;
        $('#l-size').onchange = (e) => { s.size = +e.target.value; s.page = 1; draw.lead(); };
        $('#l-sort').onchange = (e) => { s.sort = e.target.value; draw.lead(); };
        $('#l-pager').onclick = (e) => { const b = e.target.closest('[data-pg]'); if (b && !b.disabled) { s.page = +b.dataset.pg; draw.lead(); } };
        const d = s.sel && findDeal('lead', s.sel), pane = $('#l-panel');
        pane.hidden = !d; pane.innerHTML = d ? leadPanel(d) : '';
        document.querySelector('.mod-body')?.classList.toggle('has-side', !!d);
        if (d) { wirePanel('lead', d, pane.firstElementChild); }
      };
      $('#l-rows').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) { s.sel = tr.dataset.id; draw.lead(); if (matchMedia('(max-width: 899px)').matches) $('#l-panel').scrollIntoView({ behavior: 'smooth' }); } });
      $('#l-rows').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-id]')) e.target.click(); });
      draw.lead();
    };
    return { html, mount };
  }

  /* ═════════ נכסים ═════════ */
  const SIZES = { s1: 'עד 200 מ״ר', s2: '200–1,000 מ״ר', s3: '1,000–3,000 מ״ר', s4: 'מעל 3,000 מ״ר' };
  const PRICES = { rent: 'להשכרה', s5: 'למכירה עד ₪5M', s20: 'למכירה ₪5M–₪20M', smax: 'למכירה מעל ₪20M' };
  const priceText = (d) => d.deal_kind === 'rent'
    ? (d.asking_rent ? `${fmt.money(Math.round(d.asking_rent / d.built_sqm))} למ״ר` : 'שכירות לפי בקשה')
    : `${fmt.money(Math.round(d.asking_price / d.built_sqm))} למ״ר`;
  function propRows() {
    const s = st.owner, q = s.q.trim().toLowerCase();
    const rows = deals('owner').filter(d => {
      if (q) return dealSearchText(d).includes(q) || String(d.description || '').toLowerCase().includes(q) || optText(d.purpose_id).includes(q);
      if (s.pstatus === 'archive') return d.status !== 'active';
      return d.status === 'active' && (!s.pstatus || cf(d, 'f_pstatus') === s.pstatus);
    }).filter(d => (!s.city || cityOf(d) === s.city) && (!s.g || optGroup(d.purpose_id) === s.g)
      && (!s.size || ({ s1: d.built_sqm <= 200, s2: d.built_sqm > 200 && d.built_sqm <= 1000, s3: d.built_sqm > 1000 && d.built_sqm <= 3000, s4: d.built_sqm > 3000 })[s.size])
      && (!s.price || (s.price === 'rent' ? d.deal_kind === 'rent' : d.deal_kind === 'sale' && ({ s5: d.asking_price <= 5e6, s20: d.asking_price > 5e6 && d.asking_price <= 2e7, smax: d.asking_price > 2e7 })[s.price])));
    const key = { updated: (d) => lastTouch(d), size: (d) => String(d.built_sqm).padStart(8, '0'), price: (d) => String(Math.round(d.asking_price)).padStart(12, '0'), occ: (d) => String(cf(d, 'f_occ') || 0).padStart(3, '0') }[s.sort];
    return rows.sort((a, b) => String(key(b)).localeCompare(String(key(a))));
  }
  const tags = (d) => [MATCH_GROUPS[optGroup(d.purpose_id)] || optText(d.purpose_id), d.deal_kind === 'rent' ? 'להשכרה' : 'למכירה', d.is_rented ? `מושכר · תשואה ${fmt.pct(d.yield_pct)}` : '', d.plot_sqm > d.built_sqm * 1.3 ? 'חצר תפעולית' : '']
    .filter(Boolean).map(t => `<span class="tag">${esc(t)}</span>`).join('');
  const stats = (d) => { const occ = +cf(d, 'f_occ') || 0;
    return `<div class="pstats"><div><span>שטח</span><b>${fmt.bi(fmt.size(d.built_sqm, 'sqm'))}</b></div>
      <div><span>מחיר</span><b>${fmt.ltr(priceText(d))}</b></div>
      <div><span>תפוסה</span><b>${pct(occ)}</b><i class="occ" aria-hidden="true"><i style="width:${occ}%"></i></i></div></div>`; };
  const updated = (d) => { const n = -daysFrom(lastTouch(d)); return n <= 0 ? 'עודכן היום' : n === 1 ? 'עודכן אתמול' : `עודכן לפני ${n} ימים`; };
  function propPanel(d) {
    const c = d.contact || {};
    return `<div class="dp" data-id="${d.id}">
      <div class="dp-photo">${img(d, 'dp-img', true)}${pChip(cf(d, 'f_pstatus'))}<button type="button" class="icon-btn on-photo" data-dp="close" aria-label="סגירת הפרטים">${I('x')}</button></div>
      <h2 class="dp-title">${esc(optText(d.purpose_id))}, ${esc(cityOf(d))}</h2>
      <p class="addr">${I('pin', 'sm')} ${esc(d.address)}</p>
      ${stats(d)}<div class="tags">${tags(d)}</div>
      ${d.description ? `<p class="desc">${esc(d.description)}</p>` : ''}
      <section class="dp-sec"><div class="dp-sec-head"><h3>פרטי בעלות / איש קשר</h3>${I('users', 'muted')}</div>
        <div class="owner-box"><strong>${esc(c.name)}</strong>${c.company_name ? `<small>${esc(c.company_name)}</small>` : ''}
          <span class="ob-line">${I('phone', 'sm')}<a href="${Phone.tel(c.phone)}">${fmt.ltr(c.phone)}</a></span>
          ${cf(d, 'f_email') ? `<span class="ob-line">${I('mail', 'sm')}<a href="mailto:${esc(cf(d, 'f_email'))}">${fmt.ltr(cf(d, 'f_email'))}</a></span>` : ''}</div></section>
      ${taskList('owner', d, 'פעולות קרובות', 'הוסף פעולה')}
      ${matchSection('owner', d)}
      <div class="dp-actions"><a class="btn primary block" href="#/m/owner/${d.id}">${I('arrow', 'sm')} צפייה בפרטי נכס מלאים</a>
        <a class="btn" href="#/m/owner/${d.id}/edit">עריכה</a>${d.status === 'active' ? '<button type="button" class="btn" data-dp="deal-close">סגירת עסקה</button>' : ''}</div></div>`;
  }
  function propsView() {
    const all = deals('owner'), act = all.filter(d => d.status === 'active');
    const newNow = all.filter(d => inMonth(d.created_at)), newPrev = all.filter(d => inMonth(d.created_at, -1));
    const vacant = act.filter(d => cf(d, 'f_pstatus') === 'פנוי');
    const occAvg = act.length ? Math.round(act.reduce((a, d) => a + (+cf(d, 'f_occ') || 0), 0) / act.length) : 0;
    const html = `${hero('assets/photos/banner-props.jpg', 'נכסים', 'ניהול נכסי החברה, שיווק והשכרה')}
      <div class="content mod">
        <section class="mod-kpis" aria-label="מדדים">
          ${kpi('building', 'סה״כ נכסים', `<bdi class="num">${act.length}</bdi>`, `<span class="trend up">+${newNow.length}</span> החודש`, '#/m/owner?k=all')}
          ${kpi('building', 'נכסים פנויים', `<bdi class="num">${vacant.length}</bdi>`, `מתוך ${act.length} נכסים`, '#/m/owner?k=vacant')}
          ${kpi('fileplus', 'נכסים חדשים החודש', `<bdi class="num">${newNow.length}</bdi>`, newPrev.length ? `<span class="trend ${newNow.length >= newPrev.length ? 'up' : 'down'}">${newNow.length >= newPrev.length ? '+' : '−'}${Math.abs(newNow.length - newPrev.length)}</span> מהחודש הקודם` : '', '#/m/owner?k=new')}
          ${kpi('gauge', 'שיעור תפוסה ממוצע', pct(occAvg), `ממוצע על ${act.length} נכסים פעילים`, '#/m/owner?k=all', `<span class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${occAvg}"><span style="width:${occAvg}%"></span></span>`)}
        </section>
        <section class="panel filters adv"><div class="adv-head"><h2>${I('sliders', 'sm')} סינון מתקדם</h2>
            <label class="search-box">${I('search', 'sm')}<span class="sr-only">חיפוש</span><input class="input" id="pq" type="search" placeholder="חיפוש נכסים לפי מיקום, גודל, תיאור…" value="${esc(st.owner.q)}"></label>
            <a class="btn accent" href="#/m/owner/new">${I('plus', 'sm')} הוסף נכס חדש</a></div>
          <div class="frow labeled">
            <label class="fsel"><span>עיר</span><select class="input" id="p-city">${[['', 'הכל'], ...cities(all).map(c => [c, c])].map(([v, t]) => opt(v, t, st.owner.city)).join('')}</select></label>
            <label class="fsel"><span>סוג נכס</span><select class="input" id="p-g">${[['', 'הכל'], ...Object.entries(MATCH_GROUPS)].map(([v, t]) => opt(v, t, st.owner.g)).join('')}</select></label>
            <label class="fsel"><span>שטח (מ״ר)</span><select class="input" id="p-size">${[['', 'הכל'], ...Object.entries(SIZES)].map(([v, t]) => opt(v, t, st.owner.size)).join('')}</select></label>
            <label class="fsel"><span>טווח מחיר</span><select class="input" id="p-price">${[['', 'הכל'], ...Object.entries(PRICES)].map(([v, t]) => opt(v, t, st.owner.price)).join('')}</select></label>
            <label class="fsel"><span>סטטוס</span><select class="input" id="p-status">${[['', 'הכל (פעילים)'], ...Object.keys(PSTATUS).map(s => [s, s]), ['archive', 'ארכיון']].map(([v, t]) => opt(v, t, st.owner.pstatus)).join('')}</select></label>
          </div></section>
        <div class="mod-body">
          <section class="mod-main">
            <div class="sortbar"><label class="fsel"><span>מיון לפי</span><select class="input" id="p-sort">${opt('updated', 'תאריך עדכון', st.owner.sort)}${opt('size', 'שטח', st.owner.sort)}${opt('price', 'מחיר', st.owner.sort)}${opt('occ', 'תפוסה', st.owner.sort)}</select></label>
              <span class="count" id="p-count"></span>
              <div class="seg view-seg" role="radiogroup" aria-label="תצוגה">
                <label><input type="radio" name="pview" value="cards" ${st.owner.view === 'cards' ? 'checked' : ''}><span>${I('grid', 'sm')} כרטיסים</span></label>
                <label><input type="radio" name="pview" value="list" ${st.owner.view === 'list' ? 'checked' : ''}><span>${I('list', 'sm')} רשימה</span></label></div></div>
            <div id="p-items"></div>
          </section>
          <aside class="mod-side panel" id="p-panel" aria-live="polite"></aside>
        </div>
      </div>`;
    const mount = () => {
      const s = st.owner;
      $('#pq').oninput = (e) => { s.q = e.target.value; draw.owner(); };
      [['p-city', 'city'], ['p-g', 'g'], ['p-size', 'size'], ['p-price', 'price'], ['p-status', 'pstatus'], ['p-sort', 'sort']].forEach(([id, k]) => $('#' + id).onchange = (e) => { s[k] = e.target.value; draw.owner(); });
      $$('input[name=pview]').forEach(r => r.onchange = () => { s.view = r.value; draw.owner(); });
      draw.owner = () => {
        const rows = propRows(); if (s.sel === undefined) s.sel = rows[0]?.id || null;
        $('#p-count').innerHTML = `מציג <bdi class="num">${rows.length}</bdi> נכסים`;
        const box = $('#p-items'); if (!box) return;
        box.className = s.view === 'cards' ? 'pgrid' : 'plist';
        box.innerHTML = rows.length ? rows.map(d => s.view === 'cards'
          ? `<article class="pcard" data-id="${d.id}" tabindex="0" ${s.sel === d.id ? 'aria-selected="true"' : ''}>
              <div class="pc-photo">${img(d, 'pc-img')}${pChip(d.status === 'active' ? cf(d, 'f_pstatus') : 'מושכר')}</div>
              <div class="pc-body"><h3>${esc(optText(d.purpose_id))}, ${esc(cityOf(d))}</h3><p class="addr">${I('pin', 'sm')} ${esc(d.address)}</p>
                ${stats(d)}<div class="tags">${tags(d)}</div><p class="pc-foot">${updated(d)}</p></div></article>`
          : `<article class="prow" data-id="${d.id}" tabindex="0" ${s.sel === d.id ? 'aria-selected="true"' : ''}>${img(d, 'row-thumb')}
              <div><h3>${esc(optText(d.purpose_id))}, ${esc(cityOf(d))}</h3><p class="addr">${esc(d.address)}</p></div>
              ${pChip(cf(d, 'f_pstatus'))}<span>${fmt.bi(fmt.size(d.built_sqm, 'sqm'))}</span><span>${fmt.ltr(priceText(d))}</span><span>${pct(+cf(d, 'f_occ') || 0)}</span><span class="pc-foot">${updated(d)}</span></article>`).join('')
          : `<p class="state">${s.q ? `לא נמצאו נכסים ל־"${esc(s.q)}"` : 'אין נכסים בסינון הזה.'}</p>`;
        Photos.hydrate(box);
        const d = s.sel && findDeal('owner', s.sel), pane = $('#p-panel');
        pane.hidden = !d; pane.innerHTML = d ? propPanel(d) : '';
        document.querySelector('.mod-body')?.classList.toggle('has-side', !!d);
        if (d) wirePanel('owner', d, pane.firstElementChild);
      };
      const pick = (e) => { const el = e.target.closest('[data-id]'); if (!el) return; s.sel = el.dataset.id; draw.owner(); if (matchMedia('(max-width: 899px)').matches) $('#p-panel').scrollIntoView({ behavior: 'smooth' }); };
      $('#p-items').addEventListener('click', pick);
      $('#p-items').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-id]')) pick(e); });
      draw.owner();
    };
    return { html, mount };
  }

  // a metric tile or a link from elsewhere sets the module's filter (?k=…), then the URL goes back to the plain module
  function applyK(module, query) {
    const k = new URLSearchParams(query || '').get('k'); if (!k) return;
    if (module === 'lead') Object.assign(st.lead, { q: '', stage: '', g: '', budget: '', city: '', page: 1, sel: undefined,
      quick: k === 'new' ? 'new' : k === 'stale' ? 'stale' : k === 'overdue' ? 'overdue' : k === 'week' ? 'week' : 'active', ...(k === 'hot' ? { stage: 'חם' } : {}) });
    else Object.assign(st.owner, { q: '', city: '', g: '', size: '', price: '', sel: undefined, pstatus: k === 'vacant' ? 'פנוי' : '' }, k === 'new' ? { sort: 'updated' } : {});
    history.replaceState(null, '', `#/m/${module}`);
  }

  window.PL_VIEWS = {
    login, shell,
    home: () => { location.replace('#/m/lead'); return { html: '' }; },
    list: (r) => {
      applyK(r.module, location.hash.split('?')[1]);
      return r.module === 'lead' ? leadsView() : propsView();
    },
  };
})();
