#!/usr/bin/env node
// Copies src/ to _site/ for deployment: drops authoring-only files and adds
// <lastmod> to the sitemap: the page's own dateModified (posts keep their WordPress
// dates), else datePublished, else the last git commit that changed the page's <main>.
// Usage: node tools/build.mjs [srcDir=src] [outDir=_site]
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { ROOT, SRC, read, urlToFile } from './lib.mjs';

const src = resolve(process.argv[2] || SRC);
const out = resolve(process.argv[3] || join(ROOT, '_site'));
const AUTHORING_ONLY = ['blog/_template.html'];

rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });
for (const f of AUTHORING_ONLY) rmSync(join(out, f), { force: true });

const today = new Date().toISOString().slice(0, 10);
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

// The page's own content: <main> without whitespace differences. Header, footer and
// promo-bar edits touch every page, so they must not move <lastmod>.
function mainOf(html) {
  const m = html.match(/<main[\s>][\s\S]*<\/main>/);
  return (m ? m[0] : html).replace(/\s+/g, ' ').trim();
}

// Date of the last commit that changed the page's <main> (today if it changed in the working tree).
function lastCommitDate(file) {
  try {
    const path = git(['ls-files', '--full-name', '--', file]).trim();
    if (!path) return today;
    const current = mainOf(read(file));
    let head = null;
    try { head = git(['show', `HEAD:${path}`]); } catch { return today; }
    if (mainOf(head) !== current) return today;
    const commits = git(['log', '--format=%H %cs', '--', file]).trim().split('\n').filter(Boolean);
    for (const line of commits) {
      const [sha, date] = line.split(' ');
      let before;
      try { before = git(['show', `${sha}^:${path}`]); } catch { return date; }
      if (mainOf(before) !== current) return date;
    }
    return commits.length ? commits[commits.length - 1].split(' ')[1] : today;
  } catch {
    return today;
  }
}

// Real content date of a page: dateModified / article:modified_time, then datePublished.
function pageDate(file) {
  const h = read(file);
  const m = h.match(/"dateModified":\s*"(\d{4}-\d{2}-\d{2})/) || h.match(/article:modified_time"\s+content="(\d{4}-\d{2}-\d{2})/) || h.match(/"datePublished":\s*"(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

const sitemapPath = join(out, 'sitemap.xml');
const xml = read(sitemapPath).replace(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>[^<]*<\/lastmod>)?\s*<\/url>/g, (_, loc) => {
  const file = urlToFile(loc.trim(), src);
  const date = file ? pageDate(file) || lastCommitDate(file) : today;
  return `<url><loc>${loc.trim()}</loc><lastmod>${date}</lastmod></url>`;
});
writeFileSync(sitemapPath, xml);
console.log(`Built ${out}`);
