---
name: zmiana-ceny
description: Change a price, an external fee or a promotion on the site so it is the same everywhere (pricing table, homepage, sums, Google structured data, llms.txt, brief). Use when the user says "zmień cenę", "nowa cena", "podwyżka", "kurs kosztuje teraz…", "nowa promocja", "koniec promocji", "zmiana opłat w PORD", or asks where a price appears.
---

# zmiana-ceny

Prices on this site are typed by hand (the pricing page no longer loads them from the office n8n sheet). The one source of truth is **`brief/ceny.json`**. `tools/ceny.mjs` checks that every amount on the site matches it; `tools/check.mjs`, `verify` and CI run that check, so a forgotten old price fails the build.

The user is not technical: talk in plain Polish, show amounts, never ask them to edit files.

## 1. Get the facts (never invent)
Ask only for what is missing, in one message:
- **Which price** (show the list from `brief/ceny.json`: kursy, jazdy dodatkowe, pozostałe opłaty, opłaty zewnętrzne) and **the new amount**.
- **From when** it applies (becomes `obowiazuje_od` and the "Obowiązuje od dnia …" line under the table).
- For a **promotion**: which course, discount in zł, end date, the condition (e.g. "teoria zdana w PORD w ciągu miesiąca"), whether it is limited (e.g. "10 miejsc"), whether it covers automat too. Promotions do not combine; only one at a time.
- External fees (badanie, zdjęcie, PORD, wydanie prawa jazdy) change rarely; if the user says PORD fees changed, confirm on pord.pl.

## 2. See every place first
```bash
node tools/ceny.mjs --gdzie <STARA_KWOTA>
```
lists every file:line with that amount, including pages that must **not** change (marked "pomijana strona": dated price reports and fines). `node tools/ceny.mjs --lista` shows every price mention on the site. Show the user a short summary ("4200 zł jest w 9 miejscach na 5 stronach").

## 3. Change the source, then the pages
1. `brief/ceny.json`: the new `cena`, and `obowiazuje_od` if the date changes.
2. Every place from step 2, keeping the surrounding wording. Typical places:
   - `src/cennik/index.html`: table row, caption "Obowiązuje od dnia DD.MM.RRRR", Offer JSON-LD at the top, promo card (#promocja).
   - `src/index.html`: price box (`.price`), costs list and **"Razem"** (= kurs standardowy + all external fees, recompute), FAQ answer twice (visible `<details>` and FAQPage JSON-LD), Offer JSON-LD, `priceRange`, promo callout.
   - `src/nauka-jazdy-gdansk-wrzeszcz/index.html`: checklist, FAQ (visible + JSON-LD), Offers.
   - `src/zapisy/index.html`: costs and course price.
   - `src/llms.txt` (English, "PLN") and `brief/landing.md` (Price / offer, LLMS_SUMMARY, FAQ section).
   - Any other page step 2 found (new pages are checked automatically).
3. **Never change** pages listed in `"pomijaj"` in `brief/ceny.json` (quarterly price reports show prices on a past date; fines posts). A new price report is a new post (blog-post skill), not an edit.
4. Amounts derived from others are checked by the tool: promo price = course − discount, "Razem" = course + fees.

## 4. Promotions
- **Start**: fill `promocja` in `brief/ceny.json` (`aktywna: true`, `dotyczy`, `rabat`, `do`, `warunek`, `nazwa`). On the site: the card on `/cennik/#promocja` (text with the condition and the end date written out), the homepage callout under the price, the yellow `promo-bar` at the top of every page (`grep -rl 'class="promo-bar"' src`), and an extra Offer with `price`, `priceValidUntil` (= `do`), `description` (condition) in the JSON-LD of `/` and `/cennik/`.
- **End** (the check fails the day after `do`, so CI will not deploy until this is done): remove the card, callout, the `promo-bar` block on every page and the promo Offers; set `"aktywna": false`. Or extend `do` if the owner extends it. Tell the user a day or two before the end date if you are working on the site then.

## 5. Check
```bash
node tools/ceny.mjs
```
must show `0 błędów`. Then `node tools/verify.mjs`, and the preview (`.claude/launch.json` → `site`) of `/cennik/` and `/` at 375 px and desktop: the price, the table and the promo card look right.

## 6. Publish and outside the site
- Publish as in the `publish` skill (commit in Polish describing the price change, push, `gh run watch -i 30`), then check `https://osktailor.pl/cennik/` shows the new price.
- Remind the user, in one line, of places outside the site that Claude cannot change: Google Business Profile, trojmiasto.pl, Facebook/Instagram posts, printed materials, the office's own n8n sheet if they still use it.
