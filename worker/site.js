// Settings for the form worker (worker/form.js). No secrets here: those live in Cloudflare
// (node tools/form-worker.mjs secrets). After changing anything, run node tools/form-worker.mjs deploy.
export const SITE = {
  brand: 'OSK Tailor',
  // Where the forms may be sent from. Keep both the GitHub address and the own domain.
  origins: ['https://gkunc.github.io', 'https://osktailor.pl', 'https://www.osktailor.pl'],
  // Hostnames Turnstile may confirm (same sites as above).
  hosts: ['gkunc.github.io', 'osktailor.pl', 'www.osktailor.pl'],
  // Sender: the domain must be verified in Resend.
  from: '"OSK Tailor" <formularz@osktailor.pl>',
  notifyTo: 'biuro@osktailor.pl',
  replyTo: 'biuro@osktailor.pl',
  phone: '725 563 155',
  siteUrl: 'https://osktailor.pl/',
  color: '#1b73e8',
};

// Fields each form may send, in the order they appear in the email, with their labels.
export const FORMS = {
  zapisy: {
    subject: 'Zapis na kurs: {name}',
    title: 'Nowy zapis na kurs ze strony',
    fields: [
      ['imie_i_nazwisko', 'Imię i nazwisko', 100],
      ['email', 'E-mail', 254],
      ['telefon', 'Telefon', 40],
      ['kurs', 'Kurs', 60],
      ['skrzynia', 'Skrzynia biegów', 60],
      ['godzina_kontaktu', 'Preferowana godzina kontaktu', 100],
      ['pkk', 'Numer PKK', 40],
      ['zgoda', 'Zgoda na przetwarzanie danych', 10],
    ],
  },
  kontakt: {
    subject: 'Wiadomość ze strony: {name}',
    title: 'Nowa wiadomość z formularza kontaktowego',
    fields: [
      ['imie_i_nazwisko', 'Imię i nazwisko', 100],
      ['email', 'E-mail', 254],
      ['telefon', 'Telefon', 40],
      ['wiadomosc', 'Wiadomość', 5000],
      ['zgoda', 'Zgoda na przetwarzanie danych', 10],
    ],
  },
};
