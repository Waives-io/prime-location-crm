// signing-public: the only door the client's signing page talks to (no login).
//   GET  ?t=TOKEN  → office, agreement number, teaser, agreement text. Never the address before a signature.
//   POST {token, full_name, id_number, home_address, consent, signature}  → stores signature + signed PDF, returns the address.
// Plain JS with its dependencies passed in, so the same code runs in the Edge Function (Deno) and in the QA tests (Node).
import { buildAgreementPdf, buildOwnerPdf } from './pdf.js';
import { notifyLeah } from './notify.js';

export const ALLOWED_ORIGINS = ['https://waives-io.github.io'];
const BUCKET = 'signed-agreements';
const PHOTOS = 'deal-photos';

// Israeli ID: 9 digits (shorter ones are left-padded with zeros), Luhn-like check digit
export function validIsraeliId(raw) {
  const s = String(raw ?? '').replace(/\D/g, '');
  if (!s || s.length > 9 || String(raw).replace(/[\s-]/g, '') !== s) return false;
  const id = s.padStart(9, '0');
  if (/^0+$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) { let n = +id[i] * ((i % 2) + 1); if (n > 9) n -= 9; sum += n; }
  return sum % 10 === 0;
}
// ת״ז, or a company / non-profit number (ח.פ. / ע״ר: 9 digits starting with 5)
export const validIdOrCompany = (raw) => /^5\d{8}$/.test(String(raw ?? '').replace(/[\s-]/g, '')) || validIsraeliId(raw);

const PNG_PREFIX = 'data:image/png;base64,';
function decodeSignature(dataUrl, b64decode) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PNG_PREFIX) || dataUrl.length > 700_000) return null;
  const bytes = b64decode(dataUrl.slice(PNG_PREFIX.length));
  // a real PNG (the page itself refuses an empty pad)
  if (bytes.length < 100 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), w = dv.getUint32(16), h = dv.getUint32(20);
  if (!w || !h || w > 3000 || h > 2000) return null;   // IHDR: a phone / desktop pad, nothing huge
  return bytes;
}

const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

/**
 * deps: {
 *   rpc(name, args) → data (throws on error)         – service-role database calls
 *   upload(bucket, path, bytes, contentType)          – storage upload (no overwrite)
 *   signedUrl(bucket, path, seconds) → url
 *   remove(bucket, paths)
 *   fonts: { regular: Uint8Array, bold: Uint8Array }, pdfLib, fontkit, b64decode(str) → Uint8Array,
 *   sha256(bytes) → ArrayBuffer, allowedOrigins?: string[]
 * }
 */
export async function handle(req, deps) {
  const origin = req.headers.get('origin') || '';
  const allowed = (deps.allowedOrigins || ALLOWED_ORIGINS).includes(origin);
  const cors = {
    'access-control-allow-origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, apikey, authorization, x-client-info',
    'vary': 'origin',
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    if (req.method === 'GET') {
      const params = new URL(req.url).searchParams;
      // a property shared with a lead (p.html?s=…): the snapshot and the chosen photos, nothing else
      if (params.has('s')) {
        const s = params.get('s') || '';
        if (!/^[A-Za-z0-9_-]{40,60}$/.test(s)) return json({ state: 'not_found' }, 404);
        const r = await deps.rpc('share_public_get', { p_token: s });
        if (r.state !== 'open') return json({ state: r.state, office: r.office }, r.state === 'not_found' ? 404 : 410);
        const { purpose, built_sqm, plot_sqm, deal_kind, price } = r.property || {};
        const photos = [];
        for (const p of (r.photos || []).slice(0, 5)) { try { photos.push(await deps.signedUrl(PHOTOS, p, 3600, { download: false })); } catch (e) { console.error(e); } }
        return json({ state: 'open', office: r.office, property: { purpose, built_sqm, plot_sqm, deal_kind, price }, photos });
      }
      const t = params.get('t') || '';
      if (!/^[A-Za-z0-9_-]{40,60}$/.test(t)) return json({ state: 'not_found' }, 404);
      const r = await deps.rpc('signing_public_get', { p_token: t });
      if (r.state === 'signed') return json(await signedBody(r, deps));
      if (r.state !== 'open') return json({ state: r.state, office: r.office }, r.state === 'not_found' ? 404 : 410);
      // only these fields leave the server before a signature
      const { purpose, built_sqm, plot_sqm, deal_kind, sale_price, monthly_rent, teaser_text } = r.teaser || {};
      const owner = r.kind === 'owner_order';   // the owner signs on his own property: address and his own details are his
      return json({ state: 'open', kind: r.kind, office: r.office, agreement_no: r.agreement_no, title: r.title, body: r.body,
        teaser: { purpose, built_sqm, plot_sqm, deal_kind, sale_price, monthly_rent, teaser_text },
        ...(owner ? { address: r.address, signer: r.signer } : {}) });
    }

    if (req.method === 'POST') {
      let b; try { b = await req.json(); } catch { return json({ state: 'invalid', errors: { form: 'bad_json' } }, 400); }
      const token = String(b?.token || '');
      if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return json({ state: 'not_found' }, 404);
      const full_name = String(b.full_name || '').trim().replace(/\s+/g, ' ');
      const home_address = String(b.home_address || '').trim().replace(/\s+/g, ' ');
      const id_number = String(b.id_number || '').replace(/\D/g, '');
      const errors = {};
      if (full_name.length < 2 || full_name.length > 80) errors.full_name = 'required';
      if (!validIdOrCompany(b.id_number)) errors.id_number = 'invalid';
      if (home_address.length < 3 || home_address.length > 160) errors.home_address = 'required';
      if (b.consent !== true) errors.consent = 'required';
      const sig = decodeSignature(b.signature, deps.b64decode);
      if (!sig) errors.signature = 'required';
      if (Object.keys(errors).length) return json({ state: 'invalid', errors }, 422);

      const begin = await deps.rpc('signing_public_begin', { p_token: token });
      if (begin.state === 'rate_limited') return json({ state: 'rate_limited' }, 429);
      if (begin.state === 'signed') return json(await signedBody(await deps.rpc('signing_public_get', { p_token: token }), deps));
      if (begin.state !== 'ok') return json({ state: begin.state }, begin.state === 'not_found' ? 404 : 410);

      const r = begin.request, t = begin.template, signedAt = new Date(begin.now);
      const coop = r.kind === 'broker_coop', license = String(b.license || '').replace(/\D/g, '');
      if (coop && !/^\d{4,9}$/.test(license)) return json({ state: 'invalid', errors: { license: 'required' } }, 422);
      const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || '').split(',')[0].trim() || null;
      const ua = (req.headers.get('user-agent') || '').slice(0, 400);
      // one file name per attempt, so a retry or a parallel submit never overwrites a stored, hashed PDF
      const nonce = hex(crypto.getRandomValues(new Uint8Array(4)));
      const base = `${r.owner_deal_id}/${r.id}-${nonce}`;
      const pdf = await (r.kind === 'owner_order' ? buildOwnerPdf : buildAgreementPdf)({
        pdfLib: deps.pdfLib, fontkit: deps.fontkit, fonts: deps.fonts, signaturePng: sig,
        office: { office_name: t.office_name, broker_name: t.broker_name, broker_license: t.broker_license, phone: begin.office_phone || null },
        agreementNo: r.agreement_no, title: begin.title ?? t.title, body: begin.body ?? t.body, teaser: r.teaser_snapshot, address: r.address_snapshot, kind: r.kind,
        signer: { full_name, id_number: id_number.padStart(9, '0'), home_address, license: coop ? license : null, phone: begin.contact?.phone || null },
        audit: { sent_at: r.sent_at, opened_at: r.first_opened_at || begin.now, signed_at: signedAt.toISOString(), ip, ua,
                 template_version: r.template_version, request_id: r.id },
      });
      const sha = hex(await deps.sha256(pdf));
      let done, completing = false;
      try {
        await deps.upload(BUCKET, `${base}-signature.png`, sig, 'image/png');
        await deps.upload(BUCKET, `${base}.pdf`, pdf, 'application/pdf');
        completing = true;
        done = await deps.rpc('signing_public_complete', { p: {
          id: r.id, signed_at: signedAt.toISOString(), full_name, id_number: id_number.padStart(9, '0'), home_address,
          signature_png_path: `${base}-signature.png`, pdf_path: `${base}.pdf`, pdf_sha256: sha, ip, user_agent: ua, license: coop ? license : null } });
      } catch (e) {
        // the save may have committed even though its answer was lost: never delete files a signed row may point to
        let signed = false;
        if (completing) signed = await deps.rpc('signing_public_get', { p_token: token }).then(g => g?.state === 'signed').catch(() => true);
        if (!signed) await deps.remove(BUCKET, [`${base}-signature.png`, `${base}.pdf`]).catch(() => {});
        throw e;
      }
      if (done.state !== 'signed') {           // a parallel submit won: keep its files, drop ours
        await deps.remove(BUCKET, [`${base}-signature.png`, `${base}.pdf`]).catch(() => {});
        return json(await signedBody(await deps.rpc('signing_public_get', { p_token: token }), deps));
      }
      // tell Leah (email with the PDF + WhatsApp); never delays or breaks the client's answer
      const job = notifyLeah({ requestId: r.id, pdf, deps }).catch(e => console.error('notify', e));
      if (deps.background) deps.background(job); else await job;
      return json({ state: 'signed', agreement_no: r.agreement_no, address: done.address, kind: r.kind,
        pdf_url: await deps.signedUrl(BUCKET, done.pdf_path, 600), office: begin.template && { broker_name: t.broker_name } });
    }
    return json({ state: 'method' }, 405);
  } catch (e) {
    console.error(e);
    return json({ state: 'error' }, 500);
  }
}

async function signedBody(r, deps) {
  return { state: 'signed', kind: r.kind, agreement_no: r.agreement_no, address: r.address, office: r.office,
    pdf_url: r.pdf_path ? await deps.signedUrl(BUCKET, r.pdf_path, 600) : null };
}
