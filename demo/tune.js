// Owner tool (demo only): pick the dashboard background colours live. Opens only with ?tune in the URL
// (e.g. https://waives-io.github.io/nadlan-demo/?tune), never for visitors. The choice is kept on this device
// ("nadlan-demo:v1:tune"); "העתקת הצבעים" copies the values so they can be fixed for everyone.
(() => {
  const KEY = 'nadlan-demo:v1:tune';
  const ITEMS = [
    { k: 'kpis', label: 'פאנל המדדים', sel: '#dash-kpis', def: '#092b3b', text: '#dash-kpis :is(.kpi-label,.kpi-value,.kpi-foot:not(.trend))' },
    { k: 'overdue', label: 'באיחור', sel: '.alert-tile.red', def: '#c62020' },
    { k: 'week', label: 'נדרש השבוע', sel: '.alert-tile.yellow', def: '#ffca00' },
    { k: 'stale', label: 'לא עודכנו', sel: ':is(.alert-tile.grey,.alert-tile.zero)', def: '#405861' },
  ];
  const INK = '#071c26', WHITE = '#ffffff';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };
  const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = (h) => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  // the text colour follows the background: white or ink, whichever reads better
  const textFor = (bg) => ratio(bg, WHITE) >= ratio(bg, INK) ? WHITE : INK;

  let colors = read();
  const style = document.createElement('style'); style.id = 'tune-style'; document.head.append(style);
  const apply = () => {
    style.textContent = ITEMS.filter(it => colors[it.k]).map(it => {
      const bg = colors[it.k], fg = textFor(bg);
      return `${it.sel}{background:${bg}!important;color:${fg}!important}${it.sel} *:not(.trend){color:${fg}!important}`
        + (it.text ? `${it.text}{color:${fg}!important}` : '');
    }).join('\n');
  };
  apply();
  if (!/[?&]tune\b/.test(location.search)) return;

  const panel = document.createElement('div');
  panel.id = 'tune-panel'; panel.dir = 'rtl';
  panel.style.cssText = 'position:fixed;z-index:1000;inset-inline-start:12px;bottom:12px;width:min(320px,calc(100vw - 24px));background:#fff;color:#071c26;border:2px solid #071c26;border-radius:12px;padding:14px;font:15px Rubik,Heebo,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25)';
  const draw = () => {
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="font-size:17px">צבעי רקע בדשבורד</strong>
        <button type="button" data-t="min" style="min-height:44px;min-width:44px;border:0;background:none;font:inherit;cursor:pointer" aria-label="מזעור">—</button></div>
      <div data-body>${ITEMS.map(it => { const v = colors[it.k] || it.def, r = ratio(v, textFor(v));
        return `<label style="display:flex;align-items:center;gap:10px;min-height:44px">
          <input type="color" data-k="${it.k}" value="${v}" style="width:44px;height:36px;border:1px solid #71858c;border-radius:6px;padding:0;background:none">
          <span style="flex:1">${it.label}</span>
          <span dir="ltr" style="font-size:13px;color:${r >= 4.5 ? '#087a4d' : '#a9141d'}">${v.toUpperCase()} · ${r.toFixed(1)}</span></label>`; }).join('')}
        <p style="margin:6px 0 10px;font-size:13px;color:#405861">צבע הטקסט מתחלף לבד ללבן או לכהה, לפי מה שקריא יותר. המספר הוא הניגודיות (צריך 4.5 ומעלה).</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" data-t="copy" style="flex:1;min-height:44px;border:0;border-radius:8px;background:#007b76;color:#fff;font:inherit;font-weight:700;cursor:pointer">העתקת הצבעים</button>
          <button type="button" data-t="reset" style="min-height:44px;padding:0 12px;border:1px solid #071c26;border-radius:8px;background:#fff;color:#071c26;font:inherit;cursor:pointer">ברירת מחדל</button>
        </div></div>`;
  };
  panel.addEventListener('input', (e) => {
    const k = e.target.dataset.k; if (!k) return;
    colors = { ...colors, [k]: e.target.value }; write(colors); apply();
    const it = ITEMS.find(x => x.k === k), r = ratio(e.target.value, textFor(e.target.value)), out = e.target.parentElement.lastElementChild;
    out.textContent = `${e.target.value.toUpperCase()} · ${r.toFixed(1)}`; out.style.color = r >= 4.5 ? '#087a4d' : '#a9141d';
  });
  panel.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-t]')?.dataset.t; if (!t) return;
    if (t === 'min') { const b = panel.querySelector('[data-body]'); b.hidden = !b.hidden; return; }
    if (t === 'reset') { colors = {}; write(colors); apply(); draw(); return; }
    const text = 'צבעי דשבורד: ' + ITEMS.map(it => `${it.label} ${(colors[it.k] || it.def).toUpperCase()}`).join(' · ');
    try { await navigator.clipboard.writeText(text); e.target.textContent = 'הועתק ✓'; }
    catch { prompt('להעתקה:', text); }
    setTimeout(() => { e.target.textContent = 'העתקת הצבעים'; }, 1800);
  });
  draw();
  const mount = () => document.body.append(panel);
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
