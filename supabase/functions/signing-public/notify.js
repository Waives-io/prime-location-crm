// After a signature: tell the broker by email (with the signed PDF) and by WhatsApp (text + link to the property card).
// Senders are injected (deps.sendEmail / deps.sendWhatsApp), so the QA tests run the same code without the network.
// A failed or unconfigured channel is logged on the request (notify_error) and never affects the signature.
import { ilTime } from './pdf.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function notifyTexts(info) {
  const r = info.request, coop = r.kind === 'broker_coop';
  const link = `${String(info.app_url || '').replace(/#.*$/, '')}#/m/owner/${r.owner_deal_id}`;
  const prop = [r.teaser_snapshot?.purpose, r.address_snapshot].filter(Boolean).join(', ');
  const when = ilTime(r.signed_at);
  const rows = [['שם', r.signer_full_name], ['ת״ז / ח.פ.', r.signer_id_number], coop && ['רשיון תיווך', r.signer_license],
    ['טלפון', info.contact_phone], ['נכס', prop], ['מספר הסכם', r.agreement_no], ['נחתם', when]].filter(Boolean);
  const subject = `${r.signer_full_name} חתם/ה על ${info.kind_label} · הסכם ${r.agreement_no}`;
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5">
<p style="font-size:18px;font-weight:bold;margin:0 0 12px">${esc(r.signer_full_name)} חתם/ה על ${esc(info.kind_label)}</p>
<table style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:3px 0 3px 14px;color:#666">${esc(k)}</td><td style="padding:3px 0;font-weight:bold">${esc(v)}</td></tr>`).join('')}</table>
<p style="margin:16px 0">המסמך החתום מצורף למייל.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#FFD400;color:#1a1a1a;padding:10px 18px;border-radius:999px;font-weight:bold;text-decoration:none">לכרטיס הנכס באפליקציה</a></p>
</div>`;
  const whatsapp = [`✍️ ${r.signer_full_name} חתם/ה על ${info.kind_label}`, `הסכם ${r.agreement_no}${prop ? ' · ' + prop : ''}`,
    `ת״ז / ח.פ. ${r.signer_id_number}${coop && r.signer_license ? ` · רשיון ${r.signer_license}` : ''}`, `נחתם ${when}`, `לכרטיס הנכס: ${link}`].join('\n');
  return { subject, html, whatsapp, filename: `${coop ? 'הסכם-שתפ' : r.kind === 'owner_order' ? 'הסכם-בעלים' : 'הזמנת-תיווך'}-${r.agreement_no}.pdf` };
}

export async function notifyLeah({ requestId, pdf, deps }) {
  const info = await deps.rpc('signing_public_notify_info', { p_id: requestId });
  if (!info?.request) return;
  const t = notifyTexts(info);
  const run = async (channel, fn) => {
    try { await fn(); await deps.rpc('signing_public_notified', { p_id: requestId, p_channel: channel, p_error: null }); }
    catch (e) { await deps.rpc('signing_public_notified', { p_id: requestId, p_channel: channel, p_error: String(e?.message || e).slice(0, 200) }).catch(() => {}); }
  };
  await Promise.all([
    deps.sendEmail ? run('email', () => { if (!info.email) throw new Error('notify_email not set');
      return deps.sendEmail({ to: info.email, subject: t.subject, html: t.html, filename: t.filename, pdf }); }) : null,
    deps.sendWhatsApp ? run('whatsapp', () => { if (!info.whatsapp) throw new Error('notify_whatsapp not set');
      return deps.sendWhatsApp({ phone: info.whatsapp, text: t.whatsapp }); }) : null,
  ]);
}
