#!/usr/bin/env node
// Runs Lighthouse with the CI budgets (lighthouserc.json) on the pages that changed since the
// version that is live now, so a one-page edit does not re-test the whole site.
// A shared file (CSS, JS, fonts, this tooling, the workflow) does not trigger the whole site: the
// changed pages plus random ones are tested, SAMPLE (5) in all. More than SAMPLE changed pages (a
// header or footer edit touches every page) -> SAMPLE of them, picked at random.
// Every page is tested only when the live version is unknown, or with --all. Redirect stubs for old
// WordPress URLs are never tested: they only forward to another page.
// Usage: node tools/lighthouse.mjs [--all] [--list]   (run tools/build.mjs first; verify.mjs does)
//   --list  only print which pages would be tested
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { ROOT, walk, read, rel, liveCommit, changedFiles } from './lib.mjs';

const LHCI = '@lhci/cli@0.16.1'; // the only place the Lighthouse CI version is pinned (CI and verify.mjs call this script)
const SITE = join(ROOT, '_site');
const SAMPLE = 5; // pages tested when a shared file changes
if (!existsSync(SITE)) { console.error('No _site/ yet: run node tools/build.mjs first.'); process.exit(1); }

const isStub = (html) => /<meta http-equiv="refresh"/i.test(html);
const pages = walk(SITE).filter((p) => p.endsWith('.html')).map((p) => rel(p, SITE)).filter((p) => !isStub(read(join(SITE, p))));
const SHARED = [/^src\/(css|js|fonts)\//, /^lighthouserc\.json$/, /^tools\/(build|lib|lighthouse)\.mjs$/, /^\.github\/workflows\//];

let targets = pages;
let why = '--all';
if (!process.argv.includes('--all')) {
  const base = await liveCommit();
  if (!base) why = 'live version unknown';
  else {
    const files = changedFiles(base);
    const shared = files.find((f) => SHARED.some((re) => re.test(f)));
    const picked = new Set();
    for (const f of files.filter((f) => f.startsWith('src/') && !SHARED.some((re) => re.test(f)))) {
      const r = f.slice(4);
      if (r.endsWith('.html')) { if (pages.includes(r)) picked.add(r); continue; }
      // An image, PDF, ...: every page that uses it (any size variant of an image counts).
      const stem = basename(r, extname(r)).replace(/-\d+w$/, '');
      for (const p of pages) if (read(join(SITE, p)).includes(`/${stem}`)) picked.add(p);
    }
    const shuffle = (list) => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };
    let sample = '';
    if (picked.size > SAMPLE) {
      // Many pages changed at once = a shared part of them did: test SAMPLE of them at random.
      sample = `; ${picked.size} pages changed, ${SAMPLE} picked at random`;
      const keep = new Set(shuffle([...picked]).slice(0, SAMPLE));
      picked.clear(); keep.forEach((p) => picked.add(p));
    } else if (shared) {
      // Shared CSS/JS/tooling changed: top up the changed pages with random ones, SAMPLE in all.
      sample = `; shared file changed (${shared}), random pages added up to ${SAMPLE}`;
      for (const p of shuffle(pages.filter((p) => !picked.has(p)))) { if (picked.size >= SAMPLE) break; picked.add(p); }
    }
    targets = pages.filter((p) => picked.has(p));
    why = `changed since ${base.slice(0, 7)}${sample}`;
  }
}

if (!targets.length) {
  console.log(`No page changed since the live version; Lighthouse skipped (use --all to test every page).`);
  process.exit(0);
}
console.log(`Lighthouse on ${targets.length} of ${pages.length} page(s), ${why}:\n  ${targets.join('\n  ')}`);
if (process.argv.includes('--list')) process.exit(0);
const r = spawnSync('npx', ['--yes', LHCI, 'autorun', ...targets.map((p) => `--collect.url=/${p}`)],
  { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
