#!/usr/bin/env node
// Responsive images: for every <img> in src/ that has no srcset yet, makes WebP copies of the
// picture at a few widths (name-400w.webp, name-800w.webp, ...) and rewrites the tag to
// src + srcset + sizes, so a phone downloads a ~400-800px file instead of the full original.
// Originals stay in place (og:image and old WordPress URLs still point at them).
// Encoding runs in a local headless Chrome (canvas -> WebP), so there are no npm dependencies.
// Re-running also refreshes `sizes` on tags it converted earlier (after a layout change here).
// Usage: node tools/make-images.mjs [--dry-run]
import { existsSync, readFileSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, basename, extname, resolve, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SRC, walk, read } from './lib.mjs';

const dryRun = process.argv.includes('--dry-run');
const QUALITY = 0.72;
const MAX_WIDTH = 1200;

// How wide each kind of image is rendered (keep in sync with css/styles.css).
const SIZES = [
  [/class="[^"]*hero-photo/, '(max-width: 760px) 100vw, 47vw'],
  [/class="[^"]*reasons-photo/, '(max-width: 900px) 100vw, 40vw'],
  [/class="[^"]*team-photo/, '(max-width: 760px) 100vw, 40vw'],
];
const CONTEXT_SIZES = [
  ['hub-featured', '(max-width: 900px) 100vw, 58vw'],
  ['hub-list', '8.5rem'],
  ['post-card', '(max-width: 600px) 100vw, 400px'],
  ['map-embed', '(max-width: 1100px) 100vw, 1100px'],
];
const DEFAULT_SIZES = '(max-width: 46rem) 100vw, 46rem'; // article figures (article max-width)

// --- image dimensions from file headers (JPEG, PNG, WebP) ---
function dims(file) {
  const b = readFileSync(file);
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + len;
    }
  }
  throw new Error(`cannot read size of ${file}`);
}

const widthsFor = (w) => {
  const top = Math.min(w, MAX_WIDTH);
  return [...[400, 800].filter((x) => x <= top - 150), top];
};
const variantPath = (master, w) => join(dirname(master), `${basename(master, extname(master))}-${w}w.webp`);
const fresh = (out, master) => existsSync(out) && statSync(out).mtimeMs >= statSync(master).mtimeMs;
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

// --- 1. find <img> tags to convert ---
const jobs = new Map(); // master path -> widths
const edits = []; // { file, tag, master }
for (const file of walk(SRC).filter((f) => f.endsWith('.html') && !f.endsWith('_template.html'))) {
  const html = read(file);
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    const src = attr(tag, 'src');
    if (!src || /^(data:|https?:)/.test(src) || /\.svg$/.test(src) || /logo\.webp$/.test(src)) continue;
    if (/srcset=/.test(tag)) { // converted earlier: only keep `sizes` current
      if (/-\d+w\.webp$/.test(src)) edits.push({ file, tag, index: m.index, sizesOnly: true });
      continue;
    }
    let master = resolve(dirname(file), src);
    if (!existsSync(master)) { console.warn(`missing ${src} in ${relative(SRC, file)}`); continue; }
    // A "-640" thumbnail of a bigger original: use the original when it has the same shape.
    const big = master.replace(/-640(\.\w+)$/, '$1');
    if (big !== master && existsSync(big)) {
      const [tw, th] = dims(master), [bw, bh] = dims(big);
      if (Math.abs(tw / th - bw / bh) < 0.015) master = big;
    }
    const [w] = dims(master);
    jobs.set(master, widthsFor(w));
    edits.push({ file, tag, master, index: m.index });
  }
}
if (!edits.length) { console.log('No <img> tags to convert.'); process.exit(0); }

// --- 2. encode missing variants in headless Chrome ---
const todo = [...jobs].map(([master, widths]) => [master, widths.filter((w) => !fresh(variantPath(master, w), master))])
  .filter(([, widths]) => widths.length);
console.log(`${edits.filter((e) => !e.sizesOnly).length} <img> tag(s) to convert, ${todo.length} image(s) to encode.`);
if (todo.length && !dryRun) {
  const chrome = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
    .filter(Boolean).find((c) => existsSync(c));
  if (!chrome) { console.error('Chrome not found; set CHROME=/path/to/chrome'); process.exit(1); }
  const tmp = mkdtempSync(join(tmpdir(), 'make-images-'));
  try {
    for (let i = 0; i < todo.length; i += 4) {
      const batch = todo.slice(i, i + 4).map(([master, widths]) => {
        const mime = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp' }[extname(master).toLowerCase()];
        return { master, widths, data: `data:image/${mime};base64,${readFileSync(master).toString('base64')}` };
      });
      const page = join(tmp, `batch${i}.html`);
      // Images are part of the page, so the load event waits for them; the encoding then runs
      // synchronously inside it, before Chrome dumps the DOM.
      writeFileSync(page, `<!doctype html>${batch.map(({ data, widths }) => `<img src="${data}" data-widths="${widths.join(',')}">`).join('')}
<textarea id="out"></textarea><script>
addEventListener('load', () => { try {
  const out = [...document.images].map((img) => img.dataset.widths.split(',').map(Number).map((w) => {
    const c = document.createElement('canvas'); c.width = w; c.height = Math.round(img.naturalHeight * w / img.naturalWidth);
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', ${QUALITY});
  }));
  document.getElementById('out').textContent = JSON.stringify(out);
} catch (e) { document.getElementById('out').textContent = 'ERR ' + e; } });
</script>`);
      const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${join(tmp, 'profile')}`,
        '--virtual-time-budget=120000', '--dump-dom', pathToFileURL(page).href], { encoding: 'utf8', maxBuffer: 512 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
      const json = dom.match(/<textarea id="out">([\s\S]*?)<\/textarea>/)?.[1];
      if (!json || json.startsWith('ERR')) throw new Error(`Chrome returned no images for ${basename(batch[0].master)}...: ${(json || 'timeout').slice(0, 200)}`);
      JSON.parse(json.replace(/&quot;/g, '"').replace(/&amp;/g, '&')).forEach((urls, j) => {
        const { master, widths } = batch[j];
        urls.forEach((url, k) => {
          if (!url.startsWith('data:image/webp')) throw new Error(`Chrome could not encode WebP for ${master}`);
          const out = variantPath(master, widths[k]);
          writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
          console.log(`  ${relative(SRC, out)}  ${(statSync(out).size / 1024).toFixed(0)} KB`);
        });
      });
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// --- 3. rewrite the tags ---
// The innermost layout container wins: the context class that opens last before the tag.
const sizesFor = (tag, before) => SIZES.find(([re]) => re.test(tag))?.[1]
  || CONTEXT_SIZES.map(([cls, s]) => [before.lastIndexOf(cls), s]).filter(([p]) => p >= 0).sort((a, b) => b[0] - a[0])[0]?.[1]
  || DEFAULT_SIZES;
const byFile = new Map();
for (const e of edits) (byFile.get(e.file) || byFile.set(e.file, []).get(e.file)).push(e);
for (const [file, list] of byFile) {
  const original = read(file);
  let html = original;
  for (const { tag, master, index, sizesOnly } of list.sort((a, b) => b.index - a.index)) {
    const sizes = sizesFor(tag, html.slice(0, index));
    let next;
    if (sizesOnly) next = tag.replace(/\ssizes="[^"]*"/, ` sizes="${sizes}"`);
    else {
      const widths = jobs.get(master);
      const url = (w) => relative(dirname(file), variantPath(master, w)).split(sep).join('/');
      const fallback = widths.find((w) => w >= 800) || widths.at(-1);
      next = tag.replace(/\ssrc="[^"]*"/, ` src="${url(fallback)}" srcset="${widths.map((w) => `${url(w)} ${w}w`).join(', ')}" sizes="${sizes}"`);
    }
    html = html.slice(0, index) + next + html.slice(index + tag.length);
  }
  if (html === original) continue;
  if (!dryRun) writeFileSync(file, html);
  console.log(`${dryRun ? 'would update' : 'updated'} ${relative(SRC, file)}`);
}
