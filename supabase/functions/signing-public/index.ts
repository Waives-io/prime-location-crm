// Edge Function "signing-public" (deployed with --no-verify-jwt: the client's signing page has no login).
// The logic lives in handler.js / pdf.js / notify.js (shared with the QA tests); here only the Supabase / Deno wiring.
// Secrets (Supabase → Edge Functions → Secrets): RESEND_API_KEY (email to the broker), CALLMEBOT_APIKEY (WhatsApp to the broker).
// Without them the signature still works; the request's notify_error says what was not sent.
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import * as pdfLib from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import { handle } from './handler.js';
import { BODY_REGULAR, BODY_BOLD, HEADING } from './fonts.js';

const b64decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64encode = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fonts = { regular: b64decode(BODY_REGULAR), bold: b64decode(BODY_BOLD), heading: b64decode(HEADING) };
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', key, { auth: { persistSession: false, autoRefreshToken: false } });
const timeout = (ms: number) => AbortSignal.timeout(ms);

const deps = {
  async rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await sb.rpc(name, args);
    if (error) throw error;
    return data;
  },
  async upload(bucket: string, path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await sb.storage.from(bucket).upload(path, bytes, { contentType, upsert: false });
    if (error) throw error;
  },
  // a PDF opens as a download; a shared photo is shown in the page
  async signedUrl(bucket: string, path: string, seconds: number, opts: { download?: boolean } = {}) {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, seconds, { download: opts.download !== false });
    if (error) throw error;
    return data.signedUrl;
  },
  async remove(bucket: string, paths: string[]) { await sb.storage.from(bucket).remove(paths); },
  fonts, pdfLib, fontkit, b64decode,
  sha256: (bytes: Uint8Array) => crypto.subtle.digest('SHA-256', bytes),

  // Resend, account opened with the broker's own email: without a domain it may send only to that address (which is the point)
  async sendEmail({ to, subject, html, filename, pdf }: { to: string; subject: string; html: string; filename: string; pdf: Uint8Array }) {
    const k = Deno.env.get('RESEND_API_KEY'); if (!k) throw new Error('RESEND_API_KEY not set');
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', signal: timeout(15000),
      headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'פריים לוקיישן <onboarding@resend.dev>', to: [to], subject, html,
        attachments: [{ filename, content: b64encode(pdf) }] }) });
    if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 150)}`);
  },
  // CallMeBot: free personal WhatsApp notifications to a number that activated it (text only)
  async sendWhatsApp({ phone, text }: { phone: string; text: string }) {
    const k = Deno.env.get('CALLMEBOT_APIKEY'); if (!k) throw new Error('CALLMEBOT_APIKEY not set');
    const u = `https://api.callmebot.com/whatsapp.php?phone=%2B${String(phone).replace(/\D/g, '')}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(k)}`;
    const r = await fetch(u, { signal: timeout(20000) });
    const body = await r.text();
    if (!r.ok || /error|apikey is invalid/i.test(body)) throw new Error(`callmebot ${r.status}: ${body.replace(/<[^>]+>/g, ' ').trim().slice(0, 150)}`);
  },
  // the notification runs after the answer is sent to the client
  background(p: Promise<unknown>) {
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime; if (rt?.waitUntil) rt.waitUntil(p);
  },
};

Deno.serve((req) => handle(req, deps));
