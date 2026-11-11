// Renders page N of a PDF to PNG with pdf.js inside Chromium, so tests (and people) can look at the real output.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PDFJS = fileURLToPath(new URL('./node_modules/pdfjs-dist/build/pdf.min.mjs', import.meta.url));
const WORKER = fileURLToPath(new URL('./node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url));

export async function renderPdfPages(pdfBytes, outPaths, { browser, scale = 1.6 } = {}) {
  const own = !browser; browser ||= await chromium.launch();
  const page = await browser.newPage();
  await page.route('http://pdf.local/**', async r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' });
    if (u.pathname === '/pdf.mjs') return r.fulfill({ contentType: 'text/javascript', body: await readFile(PDFJS, 'utf8') });
    if (u.pathname === '/worker.mjs') return r.fulfill({ contentType: 'text/javascript', body: await readFile(WORKER, 'utf8') });
    if (u.pathname === '/doc.pdf') return r.fulfill({ contentType: 'application/pdf', body: Buffer.from(pdfBytes) });
    r.fulfill({ status: 404 });
  });
  await page.goto('http://pdf.local/');
  const res = await page.evaluate(async ({ scale, n }) => {
    const pdfjs = await import('http://pdf.local/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = 'http://pdf.local/worker.mjs';
    const doc = await pdfjs.getDocument('http://pdf.local/doc.pdf').promise;
    const out = { pages: doc.numPages, images: [], text: '' };
    for (let i = 1; i <= Math.min(n, doc.numPages); i++) {
      const p = await doc.getPage(i), vp = p.getViewport({ scale });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      out.images.push(c.toDataURL('image/png'));
    }
    for (let i = 1; i <= doc.numPages; i++) out.text += (await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + '\n';
    return out;
  }, { scale, n: outPaths.length });
  for (let i = 0; i < res.images.length; i++) await writeFile(outPaths[i], Buffer.from(res.images[i].split(',')[1], 'base64'));
  await page.close(); if (own) await browser.close();
  return { pages: res.pages, text: res.text };
}

// a hand-drawn-looking signature PNG (data URL) made on a real canvas
export async function fakeSignature(browser) {
  const p = await browser.newPage();
  const url = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 200; const g = c.getContext('2d');
    g.lineWidth = 5; g.lineCap = 'round'; g.strokeStyle = '#111'; g.beginPath(); g.moveTo(40, 140);
    for (let x = 40; x < 560; x += 8) g.lineTo(x, 110 + Math.sin(x / 23) * 45 + Math.cos(x / 9) * 12);
    g.stroke(); return c.toDataURL('image/png');
  });
  await p.close(); return url;
}
