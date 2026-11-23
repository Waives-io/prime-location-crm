// Signed brokerage order → PDF (A4, Hebrew, right to left). pdf-lib draws glyphs left to right in the order given,
// so every line is first put into visual order here (a small bidi: Hebrew runs reversed, numbers / Latin kept LTR).

const RTL = /[֐-׿יִ-ﭏ]/;
const LTR = /[A-Za-z0-9À-ɏ]/;
const DIGIT = /[0-9]/;
const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' };

/** logical (typed) order → visual order for a right-to-left line */
export function visual(line) {
  const ch = [...line];
  const cls = ch.map((c, i) => RTL.test(c) ? 'R' : LTR.test(c) ? 'L'
    : /[%₪$]/.test(c) && (DIGIT.test(ch[i - 1] || '') || DIGIT.test(ch[i + 1] || '')) ? 'L' : 'N');
  // a neutral (space, punctuation) between two LTR characters belongs to them ("1,500,000", "12:30:05", "1.2.3.4")
  for (let i = 0; i < ch.length; i++) {
    if (cls[i] !== 'N') continue;
    let p = i - 1; while (p >= 0 && cls[p] === 'N') p--;
    let n = i + 1; while (n < ch.length && cls[n] === 'N') n++;
    cls[i] = p >= 0 && n < ch.length && cls[p] === 'L' && cls[n] === 'L' ? 'l' : 'R';
  }
  const runs = [];
  for (let i = 0; i < ch.length; i++) {
    const ltr = cls[i] === 'L' || cls[i] === 'l', last = runs[runs.length - 1];
    if (last && last.ltr === ltr) last.c.push(ch[i]); else runs.push({ ltr, c: [ch[i]] });
  }
  return runs.reverse().map(r => r.ltr ? r.c.join('') : r.c.reverse().map(c => MIRROR[c] || c).join('')).join('');
}

// fontkit (pdf-lib's text engine) lays out a string that contains Hebrew as one right-to-left run: it reverses the
// whole string. So such a line is handed over reversed visual order, and fontkit turns it back into visual order.
// A line without Hebrew (a browser user-agent, an IP) is plain left to right and is drawn as typed.
export const toGlyphOrder = (line) => RTL.test(line) ? [...visual(line)].reverse().join('') : line;

/** split a paragraph into lines that fit `width` (logical order); very long words are cut */
export function wrap(text, font, size, width) {
  const out = [];
  for (const para of String(text ?? '').split(/\n/)) {
    let line = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (font.widthOfTextAtSize(word, size) > width) {          // e.g. a long user-agent string
        let k = word.length; while (k > 1 && font.widthOfTextAtSize(word.slice(0, k), size) > width) k--;
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, k)); word = word.slice(k);
      }
      const next = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(next, size) <= width) line = next; else { if (line) out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}

export const ilTime = (iso) => {
  if (!iso) return '—';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
};
const num = (n) => n == null || n === '' ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const money = (n) => n == null || n === '' ? '' : '₪ ' + Math.round(Number(n)).toLocaleString('en-US');

export function teaserLines(t = {}) {
  const rows = [];
  if (t.purpose) rows.push(['ייעוד', t.purpose]);
  const size = [t.built_sqm ? `${num(t.built_sqm)} מ״ר בנוי` : '', t.plot_sqm ? `${num(t.plot_sqm)} מ״ר מגרש` : ''].filter(Boolean).join(' · ');
  if (size) rows.push(['שטח', size]);
  if (t.deal_kind === 'sale') rows.push(['סוג עסקה', `מכירה${t.sale_price ? ' | ' + money(t.sale_price) : ''}`]);
  if (t.deal_kind === 'rent') rows.push(['סוג עסקה', `השכרה${t.monthly_rent ? ' | ' + money(t.monthly_rent) + ' לחודש' : ''}`]);
  return rows;
}

export async function buildAgreementPdf({ pdfLib, fontkit, fonts, signaturePng, office, agreementNo, title, body, teaser, address, signer, audit, kind }) {
  const coop = kind === 'broker_coop';
  const { PDFDocument, rgb } = pdfLib;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  const head = fonts.heading ? await doc.embedFont(fonts.heading, { subset: true }) : bold;   // Fredoka for headings
  doc.setTitle(`${title} ${agreementNo}`); doc.setAuthor(office.office_name); doc.setLanguage('he');
  const W = 595.28, H = 841.89, M = 46, R = W - M, INK = rgb(0.1, 0.1, 0.1), GREY = rgb(0.38, 0.38, 0.38), YELLOW = rgb(1, 0.83, 0);
  let page, y;
  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const need = (h) => { if (y - h < M + 20) newPage(); };
  const right = (text, { font = reg, size = 10.5, color = INK, x = R } = {}) => {
    const v = toGlyphOrder(text); page.drawText(v, { x: x - font.widthOfTextAtSize(v, size), y, size, font, color });
  };
  const para = (text, { font = reg, size = 10.5, color = INK, gap = 4, width = R - M, x = R } = {}) => {
    for (const line of wrap(text, font, size, width)) { need(size + 3); right(line, { font, size, color, x }); y -= size * 1.45; }
    y -= gap;
  };
  const heading = (text) => {
    need(40); y -= 6; right(text, { font: head, size: 13 });
    page.drawRectangle({ x: R - head.widthOfTextAtSize(text, 13), y: y - 5, width: head.widthOfTextAtSize(text, 13), height: 2, color: YELLOW });
    y -= 22;
  };
  const kv = (label, value, size = 10.5) => {
    const lab = label + ': ', lw = bold.widthOfTextAtSize(lab, size);
    const lines = wrap(String(value ?? '—'), reg, size, R - M - lw);
    need(size + 3); right(lab, { font: bold, size });
    lines.forEach((l, i) => { if (i) { need(size + 3); } right(l, { size, x: R - lw }); y -= size * 1.5; });
  };

  newPage();
  // header
  page.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: YELLOW });
  right(office.office_name, { font: head, size: 20 }); y -= 22;
  right(`${office.broker_name} · רשיון תיווך: ${office.broker_license}`, { size: 11, color: GREY }); y -= 30;
  right(title, { font: head, size: 16 }); y -= 20;
  right(`מספר הסכם: ${agreementNo}`, { size: 11.5 }); y -= 18;

  heading('פרטי הנכס');
  for (const [k, v] of teaserLines(teaser)) kv(k, v);
  if (teaser?.teaser_text) kv('תיאור', teaser.teaser_text);
  kv('כתובת הנכס', address || '—');

  heading(coop ? 'נוסח ההסכם' : 'נוסח ההזמנה');
  String(body || '').split(/\n+/).forEach(p => para(p, { size: 10, gap: 5 }));

  heading(coop ? 'פרטי המתווך' : 'פרטי הלקוח');
  kv('שם מלא', signer.full_name);
  kv('ת״ז / ח.פ.', signer.id_number);
  if (coop) kv('רשיון תיווך', signer.license);
  kv(coop ? 'כתובת' : 'כתובת מגורים', signer.home_address);
  kv('אישור', coop ? 'קראתי ואני מאשר/ת את הסכם שיתוף הפעולה בין המתווכים' : 'קראתי ואני מאשר/ת את הסכם הזמנת שירותי התיווך');

  heading(coop ? 'חתימת המתווך' : 'חתימת הלקוח');
  const png = await doc.embedPng(signaturePng);
  const sc = Math.min(230 / png.width, 95 / png.height, 1);
  const sw = png.width * sc, sh = png.height * sc;
  need(sh + 30);
  page.drawRectangle({ x: R - sw - 16, y: y - sh - 8, width: sw + 16, height: sh + 16, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1 });
  page.drawImage(png, { x: R - sw - 8, y: y - sh, width: sw, height: sh });
  y -= sh + 30;

  heading('תיעוד');
  const a = (k, v) => kv(k, v, 9);
  a('קישור נוצר', ilTime(audit.sent_at)); a('נפתח', ilTime(audit.opened_at)); a('נחתם', ilTime(audit.signed_at));
  a('אזור זמן', 'שעון ישראל (Asia/Jerusalem)');
  a('כתובת IP', audit.ip || '—'); a('דפדפן', audit.ua || '—');
  a('גרסת נוסח', String(audit.template_version)); a('מזהה בקשה', audit.request_id);

  // page numbers
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    const t = toGlyphOrder(`עמוד ${i + 1} מתוך ${pages.length} · הסכם ${agreementNo}`);
    pg.drawText(t, { x: W / 2 - reg.widthOfTextAtSize(t, 8.5) / 2, y: 24, size: 8.5, font: reg, color: GREY });
  });
  return await doc.save();
}

const shortTime = (iso) => { const s = ilTime(iso); return s === '—' ? s : s.slice(0, 16); };   // DD/MM/YYYY HH:mm

/**
 * The owner's agreement, in the layout of Leah's previous system: two pages (brokerage order, exclusivity), each with the
 * broker line, the title and agreement number, the client and property boxes, the sections, and the one signature + date.
 * body: page 1 text, then a line "## <title of page 2>", then page 2 text.
 */
export async function buildOwnerPdf({ pdfLib, fontkit, fonts, signaturePng, office, agreementNo, title, body, teaser, address, signer, audit }) {
  const { PDFDocument, rgb } = pdfLib;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  const head = fonts.heading ? await doc.embedFont(fonts.heading, { subset: true }) : bold;
  doc.setTitle(`${title} ${agreementNo}`); doc.setAuthor(office.office_name); doc.setLanguage('he');
  const W = 595.28, H = 841.89, M = 42, R = W - M, INK = rgb(0.1, 0.1, 0.1), GREY = rgb(0.42, 0.42, 0.42),
    BOX = rgb(0.95, 0.95, 0.94), ACCENT = rgb(0.86, 0.33, 0.42), YELLOW = rgb(1, 0.83, 0);
  const png = await doc.embedPng(signaturePng);
  let page, y;
  const text = (t, { font = reg, size = 9.5, color = INK, x = R, align = 'right' } = {}) => {
    const v = toGlyphOrder(String(t ?? '')), w = font.widthOfTextAtSize(v, size);
    page.drawText(v, { x: align === 'right' ? x - w : align === 'center' ? x - w / 2 : x, y, size, font, color });
  };
  const fit = (t, font, size, width) => {
    let s = String(t ?? ''); if (font.widthOfTextAtSize(s, size) <= width) return s;
    while (s.length > 1 && font.widthOfTextAtSize(s + '...', size) > width) s = s.slice(0, -1);
    return s + '...';
  };
  const pages = String(body || '').split(/\n(?=## )/);
  const p1 = pages[0], p2 = pages[1] ? pages[1].replace(/^## /, '') : null;
  const sections = (txt) => txt.split('\n').filter(l => l.trim());

  const header = (pageTitle) => {
    page = doc.addPage([W, H]); y = H - 10;
    page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: YELLOW });
    y = H - 46;
    text(office.office_name, { font: head, size: 15 });
    text(`${office.broker_name} • רשיון תיווך: ${office.broker_license}${office.phone ? ` • טלפון: ${office.phone}` : ''}`, { size: 9.5, color: GREY, x: R - head.widthOfTextAtSize(toGlyphOrder(office.office_name), 15) - 14 });
    y -= 44;
    text('מספר ההסכם', { size: 8.5, color: GREY, x: M, align: 'left' }); y -= 16;
    text(pageTitle, { font: head, size: 15 });
    text(String(agreementNo), { font: bold, size: 14, x: M, align: 'left' });
    y -= 30;
  };
  // a grey box of label / value columns, right to left (widths: parts of the full width)
  const box = (heading, cols) => {
    text(heading, { font: bold, size: 10, color: ACCENT }); y -= 10;
    const h = 44, top = y;
    page.drawRectangle({ x: M, y: top - h, width: R - M, height: h, color: BOX });
    let x = R - 10; const inner = R - M - 20;
    for (const [label, value, part] of cols) {
      const w = inner * part;
      y = top - 15; text(label, { size: 8.5, color: GREY, x });
      y = top - 32; text(fit(value || '—', bold, 10, w - 8), { font: bold, size: 10, x });
      x -= w;
    }
    y = top - h - 14;
  };
  const details = () => {
    box('פרטי לקוח', [['שם לקוח', signer.full_name, 0.25], ['ת.ז. / ח.פ.', signer.id_number, 0.2], ['כתובת', signer.home_address, 0.35], ['טלפון', signer.phone, 0.2]]);
    const money = (n) => n == null || n === '' ? '-' : '₪ ' + Math.round(Number(n)).toLocaleString('en-US');
    box('פרטי הנכס', [['כתובת', address, 0.5], ['מחיר מכירה מבוקש', teaser?.deal_kind === 'sale' ? money(teaser.sale_price) : '-', 0.25],
      ['מחיר שכירות מבוקש', teaser?.deal_kind === 'rent' ? money(teaser.monthly_rent) : '-', 0.25]]);
  };
  const SIG_H = 92, FOOT = 50;
  const paragraphs = (lines, pageTitle) => {
    for (const para of lines) {
      for (const line of wrap(para, reg, 9.2, R - M)) {
        if (y - 13 < FOOT + 10) { header(pageTitle); }
        text(line, { size: 9.2 }); y -= 12.9;
      }
      y -= 1.2;
    }
  };
  const signature = (pageTitle) => {
    if (y - SIG_H < FOOT) header(pageTitle);
    y -= 14;
    const bw = 170, bh = 52, top = y;
    // signature box on the right, date and time on the left (as in the example)
    page.drawRectangle({ x: R - bw, y: top - bh, width: bw, height: bh, color: BOX });
    page.drawLine({ start: { x: R - bw, y: top - bh }, end: { x: R, y: top - bh }, thickness: 1.2, color: INK });
    const sc = Math.min((bw - 20) / png.width, (bh - 8) / png.height, 1), sw = png.width * sc, sh = png.height * sc;
    page.drawImage(png, { x: R - bw / 2 - sw / 2, y: top - bh / 2 - sh / 2, width: sw, height: sh });
    page.drawRectangle({ x: M, y: top - bh, width: bw, height: bh, color: BOX });
    page.drawLine({ start: { x: M, y: top - bh }, end: { x: M + bw, y: top - bh }, thickness: 1.2, color: INK });
    y = top - bh / 2 - 5; text(shortTime(audit.signed_at), { font: bold, size: 12, x: M + bw / 2, align: 'center' });
    y = top - bh - 16;
    text('חתימה', { size: 10, x: R - bw / 2, align: 'center' }); text('תאריך ושעה', { size: 10, x: M + bw / 2, align: 'center' });
    y -= 10;
  };

  header(title); details(); paragraphs(sections(p1), title); signature(title);
  if (p2) { const lines = sections(p2); const t2 = lines.shift(); header(t2); details(); paragraphs(lines, t2); signature(t2); }

  // every page: how it was signed + page numbers; the full record on the last page
  const all = doc.getPages();
  all.forEach((pg, i) => {
    page = pg;
    y = 38; text(`נחתם דיגיטלית באמצעות אפליקציית ${office.office_name} · עמוד ${i + 1} מתוך ${all.length} · הסכם ${agreementNo}`, { size: 8, color: GREY, x: W / 2, align: 'center' });
    if (i === all.length - 1) {
      y = 26; text(`קישור נוצר ${ilTime(audit.sent_at)} · נפתח ${ilTime(audit.opened_at)} · נחתם ${ilTime(audit.signed_at)} (שעון ישראל) · IP ${audit.ip || '—'} · נוסח ${audit.template_version}`, { size: 6.8, color: GREY, x: W / 2, align: 'center' });
      y = 16; page.drawText(fit(`${audit.request_id} · ${audit.ua || ''}`, reg, 6.3, W - 2 * M), { x: M, y, size: 6.3, font: reg, color: GREY });
    }
  });
  return await doc.save();
}
