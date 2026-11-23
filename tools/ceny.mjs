#!/usr/bin/env node
// Price consistency for the site. One source of truth: brief/ceny.json.
// Usage:
//   node tools/ceny.mjs              check that every price on the site matches brief/ceny.json (exit 1 on errors)
//   node tools/ceny.mjs --lista      list every price mention (file:line, amount, what it is)
//   node tools/ceny.mjs --gdzie 4200 list every place where this amount appears (also in skipped pages)
// Also run by tools/check.mjs, so verify and CI fail when prices disagree.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, SRC, walk, rel, read } from './lib.mjs';

const BRIEF = join(ROOT, 'brief');
const SCAN_EXT = /\.(html|txt|xml|js)$/;

export function loadPrices() {
  const c = JSON.parse(read(join(BRIEF, 'ceny.json')));
  const items = [];
  for (const group of ['kurs', 'jazdy_dodatkowe', 'pozostale', 'oplaty_zewnetrzne']) {
    for (const [key, v] of Object.entries(c[group] || {})) items.push({ key: `${group}.${key}`, name: v.nazwa, price: v.cena });
  }
  const byKey = Object.fromEntries(items.map((i) => [i.key.split('.')[1], i]));
  const p = c.promocja || {};
  const today = new Date().toISOString().slice(0, 10);
  const promoExpired = Boolean(p.aktywna && p.do && today > p.do);
  const promoOn = Boolean(p.aktywna) && !promoExpired;
  const derived = [];
  if (p.aktywna && byKey[p.dotyczy]) {
    derived.push({ key: 'promocja.cena', name: `cena promocyjna (${byKey[p.dotyczy].name} − ${p.rabat} zł)`, price: byKey[p.dotyczy].price - p.rabat, promo: true });
    derived.push({ key: 'promocja.rabat', name: 'rabat w promocji', price: p.rabat, promo: true });
  }
  const fees = Object.keys(c.oplaty_zewnetrzne || {}).map((k) => byKey[k].price);
  if (byKey.manual_standard) {
    derived.push({ key: 'suma.kurs_i_oplaty', name: 'kurs standardowy + opłaty zewnętrzne („Razem” na stronie głównej)', price: byKey.manual_standard.price + fees.reduce((a, b) => a + b, 0) });
  }
  return { raw: c, items, derived, promo: p, promoOn, promoExpired, today, skip: new Set(Object.keys(c.pomijaj || {}).filter((k) => !k.startsWith('_'))) };
}

const AMOUNT = [
  // 4200 zł, 4 200 zł, 4200&nbsp;zł, 4200 PLN, ok. 200 zł
  /(?<![\d,.])(\d{1,3}(?:(?: | |&nbsp;)\d{3})+|\d{1,6})(?: | |&nbsp;)?(?:zł|PLN|złotych)(?![a-ząćęłńóśźż])/gi,
  // JSON-LD: "price": "4200", "price": 4200, "lowPrice" ...
  /"(?:price|lowPrice|highPrice)"\s*:\s*"?(\d+)(?:\.\d+)?"?/g,
  // promo badge: <span>−400</span>zł
  /(\d{2,6})<\/span>\s*zł/g,
];

/** Every price mention in the scanned files: { file, line, amount, context }. */
export function findMentions(dir = SRC, { includeSkipped = false, skip = new Set() } = {}) {
  const files = walk(dir).filter((p) => SCAN_EXT.test(p)).map((p) => ({ p, r: rel(p, dir) }));
  const brief = join(BRIEF, 'landing.md');
  if (existsSync(brief)) files.push({ p: brief, r: '../brief/landing.md' });
  const out = [];
  for (const { p, r } of files) {
    if (!includeSkipped && skip.has(r)) continue;
    const text = read(p).replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
    const seen = new Set();
    for (const re of AMOUNT) {
      for (const m of text.matchAll(re)) {
        const at = m.index + m[0].indexOf(m[1]);
        if (seen.has(at)) continue;
        seen.add(at);
        const amount = Number(m[1].replace(/ | |&nbsp;/g, ''));
        const line = text.slice(0, at).split('\n').length;
        const ctx = text.slice(Math.max(0, at - 70), at + 40).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        out.push({ file: r, line, amount, context: ctx, skipped: skip.has(r) });
      }
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** Errors and warnings for check.mjs. dir is src/ or _site/. */
export function checkPrices(dir = SRC) {
  const errors = [];
  const warnings = [];
  if (!existsSync(join(BRIEF, 'ceny.json'))) return { errors, warnings };
  const P = loadPrices();
  const allowed = new Map();
  for (const i of [...P.items, ...P.derived]) {
    if (i.promo && !P.promoOn) continue;
    allowed.set(i.price, [...(allowed.get(i.price) || []), i.name]);
  }
  const mentions = findMentions(dir, { skip: P.skip });

  // 1. Every amount on the site must be a current price (or a sum/discount derived from them)
  for (const m of mentions) {
    if (!allowed.has(m.amount)) {
      errors.push(`${m.file}:${m.line}: ${m.amount} zł nie ma w brief/ceny.json („…${m.context}…”). Stara cena? Popraw ją albo dodaj stronę do "pomijaj".`);
    }
  }

  // 2. The pricing page lists every price from the price list
  const cennik = mentions.filter((m) => m.file === 'cennik/index.html').map((m) => m.amount);
  if (cennik.length) {
    for (const i of P.items) if (!cennik.includes(i.price)) errors.push(`cennik/index.html: brak ceny ${i.price} zł (${i.name})`);
  }

  // 3. Promotion: dates in the structured data, expiry
  const until = [];
  for (const p of walk(dir).filter((f) => f.endsWith('.html'))) {
    const r = rel(p, dir);
    if (P.skip.has(r)) continue;
    for (const m of read(p).matchAll(/"priceValidUntil"\s*:\s*"([^"]+)"/g)) until.push({ r, d: m[1] });
  }
  if (P.promoExpired) {
    errors.push(`brief/ceny.json: promocja „${P.promo.nazwa}” skończyła się ${P.promo.do}. Zdejmij ją ze strony (pasek, strona główna, cennik, dane dla Google) i ustaw "aktywna": false, albo przedłuż datę "do" (skill zmiana-ceny).`);
  }
  for (const { r, d } of until) {
    if (!P.promoOn) errors.push(`${r}: dane dla Google mają ofertę z priceValidUntil ${d}, a promocja nie jest aktywna`);
    else if (d !== P.promo.do) errors.push(`${r}: priceValidUntil ${d} ≠ data końca promocji ${P.promo.do} w brief/ceny.json`);
  }

  // 4. "Obowiązuje od" under the price table
  const caption = existsSync(join(dir, 'cennik/index.html')) && read(join(dir, 'cennik/index.html')).match(/Obowiązuje od dnia (\d{2})\.(\d{2})\.(\d{4})/);
  if (caption && P.raw.obowiazuje_od && `${caption[3]}-${caption[2]}-${caption[1]}` !== P.raw.obowiazuje_od) {
    warnings.push(`cennik/index.html: „Obowiązuje od dnia ${caption[1]}.${caption[2]}.${caption[3]}” ≠ obowiazuje_od ${P.raw.obowiazuje_od} w brief/ceny.json`);
  }
  return { errors, warnings };
}

// CLI
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const P = loadPrices();
  const names = new Map();
  for (const i of [...P.items, ...P.derived]) names.set(i.price, [...(names.get(i.price) || []), i.name]);
  if (args[0] === '--lista' || args[0] === '--gdzie') {
    const want = args[0] === '--gdzie' ? Number(String(args[1] || '').replace(/\D/g, '')) : null;
    const all = findMentions(resolve(SRC), { includeSkipped: want !== null, skip: P.skip });
    const rows = want === null ? all : all.filter((m) => m.amount === want);
    for (const m of rows) {
      const what = m.skipped ? '(pomijana strona – nie zmieniać)' : (names.get(m.amount) || ['?? brak w cenniku']).join(' / ');
      console.log(`${m.file}:${m.line}  ${m.amount} zł  [${what}]  …${m.context}…`);
    }
    console.log(`\n${rows.length} miejsc${want !== null ? ` z kwotą ${want} zł` : ''}.`);
    process.exit(0);
  }
  const { errors, warnings } = checkPrices(resolve(args[0] || SRC));
  for (const w of warnings) console.log(`warn  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(`\nCeny: ${errors.length} błędów, ${warnings.length} ostrzeżeń (źródło: brief/ceny.json, promocja ${P.promoOn ? `aktywna do ${P.promo.do}` : 'nieaktywna'}).`);
  process.exit(errors.length ? 1 : 0);
}
