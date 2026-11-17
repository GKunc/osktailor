// Shared helpers for the repo tooling. Node 20+, no dependencies.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

export const ROOT = new URL('..', import.meta.url).pathname;
export const SRC = join(ROOT, 'src');

export function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** Path relative to src/, always with forward slashes. */
export const rel = (p, base = SRC) => relative(base, p).split(sep).join('/');
export const read = (p) => readFileSync(p, 'utf8');

/** All <loc> URLs in a sitemap. */
export function sitemapUrls(dir = SRC) {
  const xml = read(join(dir, 'sitemap.xml'));
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

/** The home URL (first sitemap entry), always ending in "/". */
export function siteUrl(dir = SRC) {
  const home = sitemapUrls(dir)[0];
  return home && (home.endsWith('/') ? home : home + '/');
}

/** Map a public URL to its source file under dir, or null if it is not on this site. */
export function urlToFile(url, dir = SRC) {
  const base = siteUrl(dir);
  if (!url.startsWith(base)) return null;
  let path = decodeURI(url.slice(base.length).split(/[?#]/)[0]);
  if (path === '' || path.endsWith('/')) path += 'index.html';
  const file = join(dir, path);
  return existsSync(file) ? file : null;
}

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/**
 * The commit that is live right now, to compare changes against.
 * CI push: the last fully successful run of this workflow on main (a failed run deployed nothing).
 * CI pull request: the target branch. Locally: origin/main. null when it cannot be told.
 */
export async function liveCommit() {
  const env = process.env;
  let ref = null;
  if (!env.GITHUB_ACTIONS) ref = 'origin/main';
  else if (env.GITHUB_EVENT_NAME === 'pull_request') ref = `origin/${env.GITHUB_BASE_REF}`;
  else if (env.GITHUB_TOKEN && env.GITHUB_REPOSITORY && env.GITHUB_WORKFLOW_REF) {
    const workflow = env.GITHUB_WORKFLOW_REF.split('@')[0].split('/').pop();
    const api = `${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${workflow}/runs?branch=main&status=success&per_page=1`;
    try {
      const res = await fetch(api, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } });
      if (res.ok) ref = (await res.json()).workflow_runs?.[0]?.head_sha || null;
    } catch { /* offline or no permission: treat as unknown */ }
  }
  if (!ref) return null;
  try { return git(['rev-parse', '--verify', `${ref}^{commit}`]); } catch { return null; }
}

/** Repo-relative paths changed since `base`, including uncommitted and new files. */
export function changedFiles(base) {
  const files = new Set(git(['diff', '--name-only', base]).split('\n').filter(Boolean));
  for (const f of git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) files.add(f);
  return [...files];
}

/** Map a source file (relative to src/) to its public URL. */
export function fileToUrl(relPath, dir = SRC) {
  const base = siteUrl(dir);
  if (relPath === 'index.html') return base;
  if (relPath.endsWith('/index.html')) return base + relPath.slice(0, -'index.html'.length);
  return base + relPath;
}
