#!/usr/bin/env node
// Deploys the form worker (worker/form.js + worker/site.js) to Cloudflare and gives it its keys.
//
// Usage:
//   node tools/form-worker.mjs deploy         deploy the worker; prints its address (the forms post to it)
//   node tools/form-worker.mjs secrets        give the worker the Resend and Turnstile keys from
//                                             ~/.config/landing-tools/osktailor/form-secrets.json (never printed)
//                                             plus a fresh test token
//   node tools/form-worker.mjs test <email>   send one test sign-up: an email to the office and a
//                                             confirmation to <email>. Sends real email: ask first.
// Wrangler (Cloudflare's CLI) signs in once per computer with `npx wrangler login`.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WRANGLER = 'wrangler@4.153.0';
const NAME = 'osktailor-pl-form';
// OSK Tailor's own keys (its own Resend account and Turnstile widget), kept outside the repo.
const SECRETS_FILE = process.env.FORM_SECRETS || join(homedir(), '.config/landing-tools/osktailor/form-secrets.json');
const TOKENS_FILE = join(homedir(), '.config/landing-tools/form-test-tokens.json');
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

const wrangler = (args, opts = {}) => spawnSync('npx', ['--yes', WRANGLER, ...args], { cwd: ROOT, encoding: 'utf8', ...opts });

function deploy() {
  const r = wrangler(['deploy', 'worker/form.js', '--name', NAME, '--compatibility-date', '2025-06-01'], { stdio: ['inherit', 'pipe', 'pipe'] });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  process.stdout.write(out);
  if (r.status !== 0) {
    if (/login|authenticat/i.test(out)) console.error('\nWrangler is not signed in: run `npx wrangler login` once.');
    process.exit(1);
  }
  const url = out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0];
  console.log(url ? `\nWorker live at ${url}` : '\nDeployed (address not found in the output above).');
}

function secrets() {
  if (!existsSync(SECRETS_FILE)) { console.error(`No ${SECRETS_FILE}.`); process.exit(1); }
  const keys = readJson(SECRETS_FILE);
  for (const k of ['RESEND_API_KEY', 'TURNSTILE_SECRET_KEY']) if (!keys[k]) { console.error(`${SECRETS_FILE} has no ${k}.`); process.exit(1); }
  const tokens = existsSync(TOKENS_FILE) ? readJson(TOKENS_FILE) : {};
  tokens[NAME] = randomBytes(24).toString('hex');
  const tmp = join(tmpdir(), `form-secrets-${process.pid}.json`);
  writeFileSync(tmp, JSON.stringify({ RESEND_API_KEY: keys.RESEND_API_KEY, TURNSTILE_SECRET_KEY: keys.TURNSTILE_SECRET_KEY, FORM_TEST_TOKEN: tokens[NAME] }), { mode: 0o600 });
  try {
    const r = wrangler(['secret', 'bulk', tmp, '--name', NAME], { stdio: ['ignore', 'pipe', 'pipe'] });
    process.stdout.write(`${r.stdout || ''}${r.stderr || ''}`); // Wrangler prints secret names only
    if (r.status !== 0) process.exit(1);
  } finally {
    rmSync(tmp, { force: true });
  }
  mkdirSync(dirname(TOKENS_FILE), { recursive: true });
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
  chmodSync(TOKENS_FILE, 0o600);
  console.log(`Secrets set for ${NAME}.`);
}

async function test(to) {
  if (!to) { console.error('Usage: node tools/form-worker.mjs test <email>'); process.exit(1); }
  const endpoint = readFileSync(join(ROOT, 'src/zapisy/index.html'), 'utf8').match(/action="(https:\/\/[^"]+workers\.dev[^"]*)"/)?.[1];
  if (!endpoint) { console.error('src/zapisy/index.html does not post to the worker yet.'); process.exit(1); }
  const token = existsSync(TOKENS_FILE) ? readJson(TOKENS_FILE)[NAME] : '';
  const body = new FormData();
  for (const [k, v] of Object.entries({ form: 'zapisy', imie_i_nazwisko: 'Test Formularza', email: to, telefon: '000 000 000', kurs: 'Kurs standardowy', skrzynia: 'Jeszcze nie wiem', godzina_kontaktu: 'TEST – proszę zignorować', zgoda: 'tak', page: 'test (tools/form-worker.mjs)', 'cf-turnstile-response': token || '' })) body.append(k, v);
  const res = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json', Origin: 'https://osktailor.pl' }, body });
  console.log(res.status, await res.text());
  if (!res.ok) process.exit(1);
}

const cmd = { deploy, secrets, test }[process.argv[2]];
if (!cmd) { console.error('Usage: node tools/form-worker.mjs deploy | secrets | test <email>'); process.exit(1); }
await cmd(process.argv[3]);
