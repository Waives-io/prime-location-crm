// Edge Function "signing-public" (deployed with --no-verify-jwt: the client's signing page has no login).
// The logic lives in handler.js (shared with the QA tests); here only the Supabase / Deno wiring.
import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import * as pdfLib from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import { handle } from './handler.js';
import { ALEF_REGULAR, ALEF_BOLD } from './fonts.js';

const b64decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const fonts = { regular: b64decode(ALEF_REGULAR), bold: b64decode(ALEF_BOLD) };
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', key, { auth: { persistSession: false, autoRefreshToken: false } });

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
  async signedUrl(bucket: string, path: string, seconds: number) {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, seconds, { download: true });
    if (error) throw error;
    return data.signedUrl;
  },
  async remove(bucket: string, paths: string[]) { await sb.storage.from(bucket).remove(paths); },
  fonts, pdfLib, fontkit, b64decode,
  sha256: (bytes: Uint8Array) => crypto.subtle.digest('SHA-256', bytes),
};

Deno.serve((req) => handle(req, deps));
