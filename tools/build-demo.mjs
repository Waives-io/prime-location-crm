// Builds the public demo "נדל״ן בע״מ" from the live index.html into demo-site/ (its own git repo → Waives-io/nadlan-demo).
// The live files are only read. Usage (from the repo root): node tools/build-demo.mjs [--logo=1..5]
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'demo-site');
const LOGO = (process.argv.find(a => a.startsWith('--logo=')) || '--logo=final').split('=')[1];
const require = createRequire(join(ROOT, 'qa', 'package.json'));
const { chromium } = require('playwright');

const APP = {
  name: 'נדל״ן בע״מ',
  logo: 'assets/logo.png', logoOnDark: 'assets/logo-dark.png', mark: 'assets/mark.png', logoAlt: 'נדל״ן בע״מ – נכסים מסחריים ותעשייה',
  ownerTitle: 'נכסים', loginLabel: 'התחברות',
  features: { dashboard: true },
  demo: { email: 'broker@nadlan-demo.co.il', password: 'Demo2026!', credit: 'נבנה ע״י WAIVES' },
};

// ── index.html ──
let html = (await readFile(join(ROOT, 'index.html'), 'utf8')).replace(/\r\n/g, '\n'); // checkouts may use CRLF
const swap = (from, to) => { assert.ok(html.includes(from), 'build-demo: not found in index.html: ' + from); html = html.replace(from, to); };
swap(/\n?<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^>]*><\/script>/.exec(html)?.[0] ?? '<supabase script>', '');
swap('<meta name="theme-color" content="#FFD400">', '<meta name="theme-color" content="#3B1E3F">'); // the navy of the dashboard look
swap('<title>פריים לוקיישן · CRM</title>', '<title>נדל״ן בע״מ · דמו CRM</title>');
swap('<meta name="apple-mobile-web-app-title" content="פריים לוקיישן">', '<meta name="apple-mobile-web-app-title" content="נדל״ן בע״מ">');
// the chosen dashboard look (GPT "גיבור מאוחד", look 2) loads after the app's own CSS
swap('</style>\n', '</style>\n<link rel="stylesheet" href="dashboard-look.css">\n');
swap('\n<script>\n', `\n<script>window.PL_APP = ${JSON.stringify(APP)};</script>\n<script src="seed.js"></script>\n<script src="demo-db.js"></script>\n<script src="tune.js"></script>\n<script src="screens.js"></script>\n<script>\n`);

for (const d of ['', 'assets', 'icons']) await mkdir(join(OUT, d), { recursive: true });
// files are overwritten in place, so the git repo inside demo-site/ survives a rebuild
await writeFile(join(OUT, 'index.html'), html);
await copyFile(join(ROOT, 'demo', 'seed.js'), join(OUT, 'seed.js'));
await copyFile(join(ROOT, 'demo', 'demo-db.js'), join(OUT, 'demo-db.js'));
await copyFile(join(ROOT, 'demo', 'dashboard-look.css'), join(OUT, 'dashboard-look.css'));
await copyFile(join(ROOT, 'demo', 'tune.js'), join(OUT, 'tune.js'));
await copyFile(join(ROOT, 'demo', 'screens.js'), join(OUT, 'screens.js'));
await mkdir(join(OUT, 'assets', 'photos'), { recursive: true });
for (const f of await (await import('node:fs/promises')).readdir(join(ROOT, 'demo', 'assets', 'photos'))) await copyFile(join(ROOT, 'demo', 'assets', 'photos', f), join(OUT, 'assets', 'photos', f));
await writeFile(join(OUT, '.nojekyll'), '');

// ── manifest + service worker (own id, scope and cache prefix) ──
await writeFile(join(OUT, 'manifest.json'), JSON.stringify({
  id: '/nadlan-demo/', name: 'נדל״ן בע״מ – דמו CRM', short_name: 'נדל״ן בע״מ', lang: 'he', dir: 'rtl',
  start_url: './#/', scope: './', display: 'standalone', background_color: '#F6EEE9', theme_color: '#3B1E3F',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2));
let sw = await readFile(join(ROOT, 'sw.js'), 'utf8');
sw = sw.replace(/const CACHE = '[^']+';/, "const CACHE = 'nadlan-demo-shell-v5', PREFIX = 'nadlan-demo-shell-';")
  .replace(/const SHELL = \[[^\]]+\];/s, "const SHELL = ['./', './index.html', './manifest.json', './seed.js', './demo-db.js', './dashboard-look.css', './tune.js', './screens.js', './assets/photos/login-hero.jpg', './assets/photos/banner-leads.jpg', './assets/photos/banner-props.jpg', './assets/logo.png', './assets/logo-dark.png', './assets/mark.png', './icons/icon-192.png'];")
  .replace("ks.filter(k => k.startsWith('pl-shell-') && k !== CACHE)", 'ks.filter(k => k.startsWith(PREFIX) && k !== CACHE)');
assert.ok(sw.includes("k.startsWith(PREFIX) && k !== CACHE"), 'build-demo: sw cleanup must be limited to the demo prefix');
await writeFile(join(OUT, 'sw.js'), sw);
new Function(sw); // syntax check

// ── logo + icons: render the SVG with the real Heebo font to PNG ──
const svg = (n) => readFile(join(ROOT, 'demo', 'assets', 'logos', n), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const render = async (svgText, w, h, file, pad = 0, bg = 'transparent') => {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Heebo:wght@500;800&family=Secular+One&display=swap" rel="stylesheet">
    <style>html,body{margin:0;background:${bg}}div{width:${w}px;height:${h}px;box-sizing:border-box;padding:${pad}px;display:flex}svg{width:100%;height:100%}</style></head>
    <body><div>${svgText.replace(/<style>@import[^<]*<\/style>/, '')}</div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, omitBackground: bg === 'transparent' });
};
await render(await svg(`logo-${LOGO}.svg`), 840, 240, join(OUT, 'assets', 'logo.png'));
await render(await svg(`logo-${LOGO}-dark.svg`), 840, 240, join(OUT, 'assets', 'logo-dark.png')); // for the navy side menu
const mark = await svg(`mark-${LOGO}.svg`);
await render(mark, 192, 192, join(OUT, 'assets', 'mark.png'));
await render(mark, 192, 192, join(OUT, 'icons', 'icon-192.png'));
await render(mark, 512, 512, join(OUT, 'icons', 'icon-512.png'));
await render(mark, 512, 512, join(OUT, 'icons', 'icon-maskable-512.png'), 80, '#FFD400');
await render(mark, 180, 180, join(OUT, 'icons', 'apple-touch-icon.png'));
await render(mark, 64, 64, join(OUT, 'icons', 'favicon.png'));
await browser.close();

// ── checks: nothing of the live client leaks into the demo ──
const out = await readFile(join(OUT, 'index.html'), 'utf8');
assert.ok(!out.includes('@supabase/supabase-js'), 'demo must not load the Supabase client');
assert.ok(out.indexOf('window.PL_APP') < out.indexOf('const APP = (() =>'), 'PL_APP is set before the app reads it');
assert.ok(out.indexOf('demo-db.js') < out.indexOf('const DB = '), 'the demo data layer loads before the app');
assert.ok(!out.includes('<title>פריים'), 'demo title');
console.log(`demo-site built (logo ${LOGO})`);
