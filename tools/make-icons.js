/*
 * icons/icon.svg faylından PNG ikonları yaradır (Playwright + Chromium).
 *   node tools/make-icons.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dir = path.join(__dirname, '..', 'icons');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
// "maskable" ikon: məzmun mərkəzdəki təhlükəsiz zonaya (80%) sığır.
const maskable = svg.replace(/<g filter="url\(#shadow\)">/, '<g filter="url(#shadow)" transform="translate(51.2 51.2) scale(0.8)">');

const targets = [
  { file: 'apple-touch-icon.png', size: 180, src: svg },
  { file: 'icon-192.png', size: 192, src: svg },
  { file: 'icon-512.png', size: 512, src: svg },
  { file: 'icon-maskable-512.png', size: 512, src: maskable },
  { file: 'favicon-32.png', size: 32, src: svg }
];

(async () => {
  const browser = await chromium.launch();
  for (const t of targets) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
    const html = '<html><body style="margin:0;background:#0b3f22">' +
      t.src.replace('<svg ', '<svg width="' + t.size + '" height="' + t.size + '" ') + '</body></html>';
    await page.setContent(html);
    await page.screenshot({ path: path.join(dir, t.file), clip: { x: 0, y: 0, width: t.size, height: t.size } });
    await page.close();
    console.log('wrote', t.file);
  }
  await browser.close();
})();
