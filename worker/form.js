// Form handler for the sign-up (Zapisy) and contact (Kontakt) forms: a Cloudflare Worker that sends
// email through Resend. Deploy with node tools/form-worker.mjs deploy (never by hand).
//
// POST from a form with a hidden field "form" = zapisy | kontakt:
//   1. drops bots (honeypot field, wrong origin, invalid email)
//   2. emails the office (notification with every answer; Reply goes to the visitor)
//   3. emails the visitor a short confirmation, only when Cloudflare Turnstile confirmed a human
//      (otherwise anyone could make us send email to any address). It never repeats what they typed.
// Answers JSON to the page's script, or a small thank-you page when the browser had no JavaScript.
//
// Secrets (node tools/form-worker.mjs secrets): RESEND_API_KEY, TURNSTILE_SECRET_KEY, FORM_TEST_TOKEN.
import { SITE, FORMS } from './site.js';

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** First name we are willing to put into an email to a stranger: no links, no addresses, short. */
function safeName(name) {
  const n = name.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  if (!n || n.length > 60 || /https?:|www\.|:\/\/|@|\.[a-z]{2,}\b/i.test(n)) return '';
  return n.split(' ')[0];
}

async function isHuman(token, ip, env) {
  if (!token) return false;
  if (env.FORM_TEST_TOKEN && token === env.FORM_TEST_TOKEN) return true; // node tools/form-worker.mjs test
  if (!env.TURNSTILE_SECRET_KEY) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const data = await res.json();
    return data.success === true && (!data.hostname || SITE.hosts.includes(data.hostname));
  } catch {
    return false;
  }
}

async function send(env, { to, replyTo, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: SITE.from, to: [to], reply_to: replyTo, subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

function layout(title, inner) {
  return `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#EFF4FA;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFF4FA;"><tr><td align="center" style="padding:16px 20px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td style="padding:0 0 20px;font:700 18px/1.4 Roboto,Arial,sans-serif;color:#212529;">${esc(SITE.brand)}</td></tr>
<tr><td style="padding:24px;background:#ffffff;border-radius:12px;font:16px/1.6 Roboto,Arial,sans-serif;color:#212529;">${inner}</td></tr>
<tr><td align="center" style="padding:24px 0 0;font:13px/1.6 Roboto,Arial,sans-serif;color:#5c6670;">OSK Tailor · ul. Wały Piastowskie 1, lok. 508D, 80-855 Gdańsk · tel. ${esc(SITE.phone)}</td></tr>
</table></td></tr></table></body></html>`;
}

function notification(form, values, page, date) {
  const rows = form.fields.filter(([k]) => values[k]).map(([k, label]) => [label, values[k]]);
  const name = values.imie_i_nazwisko || values.email;
  const subject = form.subject.replace('{name}', name).replace(/[\r\n]+/g, ' ').slice(0, 200);
  const table = rows.map(([l, v]) => `<tr><td style="padding:4px 16px 4px 0;vertical-align:top;color:#5c6670;white-space:nowrap;">${esc(l)}</td><td style="padding:4px 0;vertical-align:top;white-space:pre-wrap;">${esc(v)}</td></tr>`).join('');
  const html = layout(subject, `<p style="margin:0 0 16px;font-weight:700;">${esc(form.title)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font:inherit;color:inherit;">${table}</table>
<p style="margin:0;color:#5c6670;font-size:14px;">Wysłano ${esc(date)} ze strony ${esc(page)}. Odpowiedz na tego maila, aby napisać do tej osoby.</p>`);
  const text = `${form.title}\n\n${rows.map(([l, v]) => `${l}: ${v}`).join('\n')}\n\nWysłano ${date} ze strony ${page}.`;
  return { subject, html, text };
}

// The site's look in email-safe HTML: asphalt (#1f242c), road-marking yellow dashes (#ffd300),
// the blue of the "L" plate (#1b73e8) for the button and the blue road sign (#0a5aa8) for the office.
// Email apps ignore CSS gradients, so the dashed line is a row of table cells.
const HEAD_FONT = "'Russo One','Arial Black',Arial,sans-serif";
const BODY_FONT = 'Roboto,Arial,Helvetica,sans-serif';

function dashes(bg) {
  const cells = Array.from({ length: 10 }, () => `<td width="6%" height="4" style="height:4px;background:#ffd300;font-size:0;line-height:0;">&nbsp;</td><td width="4%" height="4" style="height:4px;font-size:0;line-height:0;">&nbsp;</td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};"><tr>${cells}</tr></table>`;
}

function roadLayout(title, inner) {
  const home = esc(SITE.siteUrl);
  return `<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f2f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5f9;"><tr><td align="center" style="padding:24px 12px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-radius:12px;overflow:hidden;background:#ffffff;">
<tr><td style="background:#1f242c;padding:26px 28px 22px;">
  <a href="${home}" style="text-decoration:none;color:#ffffff;font:400 26px/1.1 ${HEAD_FONT};letter-spacing:.5px;">OSK <span style="color:#ffd300;">Tailor</span></a>
  <div style="margin-top:6px;font:14px/1.4 ${BODY_FONT};color:#c3c9d2;">Nauka jazdy Gdańsk · kat. B · auta jak w PORD</div>
</td></tr>
<tr><td style="background:#1f242c;padding:0 0 18px;">${dashes('#1f242c')}</td></tr>
<tr><td style="padding:30px 28px 8px;font:16px/1.6 ${BODY_FONT};color:#1a1f26;">${inner}</td></tr>
<tr><td style="background:#1f242c;padding:18px 0 0;">${dashes('#1f242c')}</td></tr>
<tr><td align="center" style="background:#1f242c;padding:16px 28px 22px;font:13px/1.6 ${BODY_FONT};color:#c3c9d2;">
  OSK Tailor · ul. Wały Piastowskie 1, lok. 508D, 80-855 Gdańsk<br>
  <a href="tel:+48725563155" style="color:#ffffff;text-decoration:none;">${esc(SITE.phone)}</a> · <a href="mailto:${esc(SITE.replyTo)}" style="color:#ffffff;text-decoration:none;">${esc(SITE.replyTo)}</a> · <a href="${home}privacy.html" style="color:#c3c9d2;">Polityka prywatności</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

export function autoreply(kind, firstName) {
  const hello = firstName ? `Dzień dobry, ${firstName}!` : 'Dzień dobry!';
  const headline = kind === 'zapisy' ? 'Twoje zgłoszenie na kurs dotarło' : 'Twoja wiadomość dotarła';
  const what = kind === 'zapisy' ? 'Dziękujemy za zgłoszenie na kurs prawa jazdy kat. B. Oddzwonimy w podanych przez Ciebie godzinach.' : 'Dziękujemy za wiadomość. Odpowiemy najszybciej, jak to możliwe.';
  const subject = kind === 'zapisy' ? 'Dziękujemy za zgłoszenie na kurs – OSK Tailor' : 'Dziękujemy za wiadomość – OSK Tailor';
  const html = roadLayout(subject, `<p style="margin:0 0 6px;color:#545b65;">${esc(hello)}</p>
<h1 style="margin:0 0 16px;font:400 26px/1.2 ${HEAD_FONT};color:#1a1f26;">${esc(headline)}</h1>
<p style="margin:0 0 16px;">${esc(what)}</p>
<p style="margin:0 0 24px;">Jeśli sprawa jest pilna, zadzwoń albo po prostu odpowiedz na tego maila.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px;"><tr><td style="background:#0a5aa8;border-radius:12px;padding:6px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border:3px solid #ffffff;border-radius:8px;padding:18px 20px;color:#ffffff;font:15px/1.5 ${BODY_FONT};">
    <div style="font-weight:700;color:#d6e6f7;margin:0 0 6px;">Biuro OSK Tailor</div>
    <div style="font:400 22px/1.15 ${HEAD_FONT};margin:0 0 6px;">Zieleniak, V piętro</div>
    <div>ul. Wały Piastowskie 1, lok. 508D<br>80-855 Gdańsk</div>
    <div style="margin:14px 0 0;padding:12px 0 0;border-top:3px solid #ffffff;font-weight:700;font-size:16px;"><a href="tel:+48725563155" style="color:#ffffff;text-decoration:none;">tel. ${esc(SITE.phone)}</a> · pon.–pt. 10:00–18:00</div>
  </td></tr></table>
</td></tr></table>
<p style="margin:0 0 26px;"><a href="${esc(SITE.siteUrl)}" style="display:inline-block;background:#1b73e8;color:#ffffff;padding:13px 22px;border-radius:8px;font-weight:700;text-decoration:none;">Odwiedź naszą stronę</a></p>
<p style="margin:0 0 22px;">Do zobaczenia na drodze,<br><strong>zespół OSK Tailor</strong></p>`);
  const text = `${hello}\n\n${headline}.\n${what}\n\nJeśli sprawa jest pilna, zadzwoń: ${SITE.phone} (pon.–pt. 10:00–18:00) albo odpowiedz na tego maila.\n\nBiuro OSK Tailor: Zieleniak, V piętro, ul. Wały Piastowskie 1, lok. 508D, 80-855 Gdańsk\n\nDo zobaczenia na drodze,\nzespół OSK Tailor\n${SITE.siteUrl}`;
  return { subject, html, text };
}

function thanksPage(ok) {
  const msg = ok ? 'Dziękujemy! Zgłoszenie dotarło do biura OSK Tailor. Skontaktujemy się z Tobą wkrótce.' : `Nie udało się wysłać formularza. Zadzwoń: ${SITE.phone} lub napisz na ${SITE.notifyTo}.`;
  return layout(ok ? 'Dziękujemy' : 'Błąd', `<p style="margin:0 0 20px;">${esc(msg)}</p><p style="margin:0;"><a href="${esc(SITE.siteUrl)}" style="color:${SITE.color};">Wróć na stronę OSK Tailor</a></p>`);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = SITE.origins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const wantsJson = (request.headers.get('Accept') || '').includes('application/json');

    const respond = (status, result, extra = {}) => {
      if (wantsJson) return new Response(JSON.stringify({ ok: status < 400, result, ...extra }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
      return new Response(thanksPage(status < 400), { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Accept, Content-Type', 'Access-Control-Max-Age': '86400' } });
    }
    if (request.method !== 'POST') return new Response('Ten adres obsługuje tylko formularze ze strony OSK Tailor.', { status: 405, headers: { Allow: 'POST', 'Content-Type': 'text/plain; charset=utf-8' } });
    if (!allowed) return respond(403, 'wrong_origin');

    let data;
    try { data = await request.formData(); } catch { return respond(400, 'bad_request'); }
    const field = (k, max) => String(data.get(k) ?? '').trim().slice(0, max);
    if (field('_gotcha', 100)) return respond(200, 'ok'); // bot: pretend it worked

    const kind = field('form', 20);
    const form = FORMS[kind];
    if (!form) return respond(400, 'unknown_form');
    const values = Object.fromEntries(form.fields.map(([k, , max]) => [k, field(k, max)]));
    if (!EMAIL_RE.test(values.email)) return respond(422, 'invalid_email');
    if (!values.imie_i_nazwisko || !values.telefon || values.zgoda !== 'tak') return respond(422, 'missing_fields');

    const page = field('page', 300) || SITE.siteUrl;
    const date = new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' });
    try {
      await send(env, { to: SITE.notifyTo, replyTo: values.email, ...notification(form, values, page, date) });
    } catch (e) {
      console.error('notification failed', e.message);
      return respond(502, 'send_failed');
    }

    let confirmed = false;
    if (await isHuman(field('cf-turnstile-response', 4096), request.headers.get('CF-Connecting-IP'), env)) {
      try {
        await send(env, { to: values.email, replyTo: SITE.replyTo, ...autoreply(kind, safeName(values.imie_i_nazwisko)) });
        confirmed = true;
      } catch (e) {
        console.error('autoreply failed', e.message); // the office already has the enquiry; do not fail the visitor
      }
    }
    return respond(200, 'ok', { autoreply: confirmed });
  },
};
