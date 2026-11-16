# Formularz zapisu (Formspree) – czeka na ID

Gotowa wersja strony Zapisy z formularzem i akapity do polityki prywatności.
Gdy właściciel poda adres formularza Formspree (`https://formspree.io/f/...`):

1. Skopiuj `zapisy-z-formularzem.html` do `src/zapisy/index.html` i podmień `{{FORM_ENDPOINT}}` na ten adres.
2. W `src/privacy.html` zamień akapit o kontakcie na akapity z `privacy-akapity-formularz.html`.
3. Przywróć wzmianki o formularzu: `src/kontakt/index.html` (sekcja „Chcesz się zapisać?”),
   `src/faq/index.html` (pytanie „Jak mogę zapisać się…”, też w JSON-LD), `src/cennik/index.html` (ostatnia sekcja),
   `src/dokumenty/index.html` (polityka prywatności).
4. Wpisz adres do `brief/landing.md` (FORM_ENDPOINT) i uruchom `node tools/verify.mjs`.
