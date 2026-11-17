# Formularz zapisu: podłączenie Formspree

Od 16.11.2026 formularz zapisu (`src/zapisy/index.html`), a od 17.11.2026 także kontaktowy (`src/kontakt/index.html`) są opublikowane w trybie tymczasowym:
`action="mailto:biuro@osktailor.pl…"`, więc po wysłaniu otwiera program pocztowy kursanta
z gotową wiadomością (obsługa w `src/js/main.js`). Gdy właściciel poda adres Formspree (`https://formspree.io/f/...`):

1. W `src/zapisy/index.html` (`<form id="lead-form">`) i `src/kontakt/index.html` (`<form id="contact-form">`) ustaw `action="<adres Formspree>" method="POST"`,
   usuń `enctype="text/plain"`, atrybut `data-msg-mailto` i zdanie o programie pocztowym pod każdym formularzem.
2. W `src/privacy.html` zamień akapit o formularzu na akapity z `privacy-akapity-formularz.html` (Formspree jako podmiot przetwarzający).
3. Wpisz adres do `brief/landing.md` (FORM_ENDPOINT), uruchom `node tools/verify.mjs`, opublikuj i wyślij próbne zgłoszenie
   (pierwsze zgłoszenie wymaga potwierdzenia adresu w mailu od Formspree).

`zapisy-z-formularzem.html` to wersja z placeholderem `{{FORM_ENDPOINT}}` (wzorzec).
