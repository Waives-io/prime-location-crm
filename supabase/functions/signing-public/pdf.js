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

export async function buildAgreementPdf({ pdfLib, fontkit, fonts, signaturePng, office, agreementNo, title, body, teaser, address, signer, audit }) {
  const { PDFDocument, rgb } = pdfLib;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const reg = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  doc.setTitle(`הזמנת שירותי תיווך ${agreementNo}`); doc.setAuthor(office.office_name); doc.setLanguage('he');
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
    need(40); y -= 6; right(text, { font: bold, size: 12.5 });
    page.drawRectangle({ x: R - bold.widthOfTextAtSize(text, 12.5), y: y - 5, width: bold.widthOfTextAtSize(text, 12.5), height: 2, color: YELLOW });
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
  right(office.office_name, { font: bold, size: 20 }); y -= 22;
  right(`${office.broker_name} · רשיון תיווך: ${office.broker_license}`, { size: 11, color: GREY }); y -= 30;
  right(title, { font: bold, size: 15.5 }); y -= 20;
  right(`מספר הסכם: ${agreementNo}`, { size: 11.5 }); y -= 18;

  heading('פרטי הנכס');
  for (const [k, v] of teaserLines(teaser)) kv(k, v);
  if (teaser?.teaser_text) kv('תיאור', teaser.teaser_text);
  kv('כתובת הנכס', address || '—');

  heading('נוסח ההזמנה');
  String(body || '').split(/\n+/).forEach(p => para(p, { size: 10, gap: 5 }));

  heading('פרטי הלקוח');
  kv('שם מלא', signer.full_name);
  kv('תעודת זהות', signer.id_number);
  kv('כתובת מגורים', signer.home_address);
  kv('אישור', 'קראתי ואני מאשר/ת את הסכם הזמנת שירותי התיווך');

  heading('חתימת הלקוח');
  const png = await doc.embedPng(signaturePng);
  const sc = Math.min(230 / png.width, 95 / png.height, 1);
  const sw = png.width * sc, sh = png.height * sc;
  need(sh + 30);
  page.drawRectangle({ x: R - sw - 16, y: y - sh - 8, width: sw + 16, height: sh + 16, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1 });
  page.drawImage(png, { x: R - sw - 8, y: y - sh, width: sw, height: sh });
  y -= sh + 30;

  heading('תיעוד');
  const a = (k, v) => kv(k, v, 9);
  a('נשלח', ilTime(audit.sent_at)); a('נפתח', ilTime(audit.opened_at)); a('נחתם', ilTime(audit.signed_at));
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
