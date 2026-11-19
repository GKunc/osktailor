(() => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // ── Cookie consent, Google Analytics and Google Ads conversions ──────────────────────────────
  // Nothing from Google loads until the visitor agrees in the banner (Google consent mode v2, basic).
  // "Statystyki" = Google Analytics 4 (G-DRBTVPR0PM), "Marketing" = Google Ads conversions.
  // Both come through one Google tag, GT-PZSPFKNH (the same one the old WordPress site used).
  // Conversions copy the old Google Tag Manager setup (GTM-TSMJTHXB): clicks on the phone number and
  // the e-mail address, sent sign-up and contact forms, and a visit to the contact page.
  const GOOGLE_TAG = 'GT-PZSPFKNH';
  const ADS_ID = 'AW-17056167033';
  const CONVERSIONS = {
    tel: 'IXwkCJ3Ey8gaEPnogcU_',
    mailto: '5xRgCNzEy8gaEPnogcU_',
    zapisy: '9SvFCN_Ey8gaEPnogcU_',
    kontakt: '1dV9CNrFy8gaEPnogcU_',
    kontaktPage: 'DW1rCN3Fy8gaEPnogcU_',
  };
  const CONSENT_KEY = 'cookie-consent';
  const CONSENT_VERSION = 1; // raise when the tools change, so everyone is asked again
  const siteRoot = new URL('../', document.currentScript?.src || window.location.href); // main.js lives in js/

  const readConsent = () => {
    try {
      const c = JSON.parse(localStorage.getItem(CONSENT_KEY));
      return c && c.v === CONSENT_VERSION ? { analytics: !!c.analytics, marketing: !!c.marketing } : null;
    } catch { return null; }
  };
  let consent = readConsent();
  let tagStarted = false;
  let contactPageCounted = false;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); } // eslint-disable-line prefer-rest-params

  const consentState = (c) => ({
    analytics_storage: c.analytics ? 'granted' : 'denied',
    ad_storage: c.marketing ? 'granted' : 'denied',
    ad_user_data: c.marketing ? 'granted' : 'denied',
    ad_personalization: c.marketing ? 'granted' : 'denied',
  });
  const conversion = (key) => {
    if (tagStarted && consent?.marketing) gtag('event', 'conversion', { send_to: `${ADS_ID}/${CONVERSIONS[key]}` });
  };
  const event = (name, params) => { if (tagStarted && consent?.analytics) gtag('event', name, params); };
  const countContactPage = () => {
    if (contactPageCounted || !consent?.marketing || !window.location.pathname.includes('/kontakt')) return;
    contactPageCounted = true;
    conversion('kontaktPage');
  };

  function startGoogleTag() {
    if (tagStarted || !consent || (!consent.analytics && !consent.marketing)) return;
    tagStarted = true;
    gtag('consent', 'default', consentState(consent));
    gtag('set', 'ads_data_redaction', !consent.marketing);
    gtag('js', new Date());
    gtag('config', GOOGLE_TAG);
    gtag('config', ADS_ID);
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG}`;
    document.head.appendChild(s);
  }

  // Withdrawn consent: tell Google, and remove the cookies it already set on this site.
  function clearGoogleCookies() {
    const host = window.location.hostname;
    document.cookie.split(';').map((c) => c.split('=')[0].trim())
      .filter((name) => /^(_ga|_gid|_gat|_gcl|_gac)/.test(name))
      .forEach((name) => {
        for (const domain of ['', `; domain=${host}`, `; domain=.${host.split('.').slice(-2).join('.')}`]) {
          document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
        }
      });
  }

  function saveConsent(next) {
    const before = consent;
    consent = next;
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION, ...next, at: new Date().toISOString() })); } catch { /* private mode: asked again on the next page */ }
    if (tagStarted) {
      gtag('consent', 'update', consentState(next));
      gtag('set', 'ads_data_redaction', !next.marketing);
    } else {
      startGoogleTag();
    }
    if ((before?.analytics && !next.analytics) || (before?.marketing && !next.marketing)) clearGoogleCookies();
    countContactPage();
  }

  // The banner exists only with JavaScript: without it, nothing is tracked, so there is nothing to ask.
  let banner;
  function showBanner(withChoices) {
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'consent';
      banner.setAttribute('role', 'dialog');
      banner.setAttribute('aria-labelledby', 'consent-title');
      banner.setAttribute('aria-describedby', 'consent-text');
      banner.innerHTML = `
        <p class="consent-title" id="consent-title">Pliki cookies</p>
        <p id="consent-text">Za Twoją zgodą używamy Google Analytics, żeby wiedzieć, jak korzystasz ze strony, i Google Ads, żeby mierzyć skuteczność naszych reklam. Zdanie zmienisz w każdej chwili w stopce strony (Ustawienia cookies). <a href="${new URL('privacy.html#cookies', siteRoot)}">Polityka prywatności</a></p>
        <fieldset class="consent-choices" hidden>
          <legend class="visually-hidden">Wybierz, na co się zgadzasz</legend>
          <label><input type="checkbox" checked disabled> Niezbędne: działanie strony, zapamiętanie tego wyboru</label>
          <label><input type="checkbox" name="analytics"> Statystyki (Google Analytics)</label>
          <label><input type="checkbox" name="marketing"> Marketing (Google Ads: pomiar skuteczności reklam)</label>
        </fieldset>
        <div class="consent-actions">
          <button type="button" class="btn btn-small" data-consent="all">Akceptuję wszystkie</button>
          <button type="button" class="btn btn-small" data-consent="none">Odrzucam</button>
          <button type="button" class="btn btn-small btn-outline" data-consent="choose" aria-expanded="false">Wybieram</button>
          <button type="button" class="btn btn-small btn-outline" data-consent="save" hidden>Zapisz wybór</button>
        </div>`;
      document.body.appendChild(banner);
      const choices = banner.querySelector('.consent-choices');
      banner.addEventListener('click', (e) => {
        const action = e.target.closest('[data-consent]')?.dataset.consent;
        if (!action) return;
        if (action === 'choose') { openChoices(); choices.querySelector('[name="analytics"]').focus(); return; }
        const pick = action === 'all' ? { analytics: true, marketing: true }
          : action === 'none' ? { analytics: false, marketing: false }
            : { analytics: choices.elements.analytics.checked, marketing: choices.elements.marketing.checked };
        saveConsent(pick);
        banner.hidden = true;
        if (banner.contains(document.activeElement) || document.activeElement === document.body) footerButton?.focus();
      });
      banner.addEventListener('keydown', (e) => { if (e.key === 'Escape' && consent) banner.hidden = true; });
    }
    const openChoices = () => {
      const choices = banner.querySelector('.consent-choices');
      choices.hidden = false;
      choices.elements.analytics.checked = !!consent?.analytics;
      choices.elements.marketing.checked = !!consent?.marketing;
      banner.querySelector('[data-consent="choose"]').hidden = true;
      banner.querySelector('[data-consent="choose"]').setAttribute('aria-expanded', 'true');
      banner.querySelector('[data-consent="save"]').hidden = false;
    };
    banner.hidden = false;
    if (withChoices) { openChoices(); banner.querySelector('[name="analytics"]').focus(); }
  }

  // "Ustawienia cookies" in the footer of every page reopens the banner.
  let footerButton;
  const footerBottom = document.querySelector('.site-footer .footer-bottom') || document.querySelector('.site-footer');
  if (footerBottom) {
    footerButton = document.createElement('button');
    footerButton.type = 'button';
    footerButton.className = 'link-button';
    footerButton.textContent = 'Ustawienia cookies';
    footerButton.addEventListener('click', () => showBanner(true));
    if (footerBottom.classList.contains('footer-bottom')) footerBottom.append(' · ');
    footerBottom.append(footerButton);
  }
  document.querySelectorAll('[data-cookie-settings]').forEach((b) => {
    b.hidden = false;
    b.addEventListener('click', () => showBanner(true));
  });

  if (consent) { startGoogleTag(); countContactPage(); } else { showBanner(false); }

  // Phone and e-mail clicks anywhere on the site.
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="tel:"], a[href^="mailto:"]');
    if (!link) return;
    const phone = link.getAttribute('href').startsWith('tel:');
    conversion(phone ? 'tel' : 'mailto');
    event('contact_click', { method: phone ? 'phone' : 'email' });
  });

  // Kontakt map: swap the static preview for the Google Maps iframe on click.
  document.querySelectorAll('[data-map-src]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const frame = document.createElement('iframe');
      frame.src = link.dataset.mapSrc;
      frame.title = 'Mapa Google: OSK Tailor, ul. Wały Piastowskie 1, Gdańsk';
      frame.width = '1100';
      frame.height = '680';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'no-referrer-when-downgrade';
      link.closest('figure')?.querySelector('figcaption')?.remove();
      link.replaceWith(frame);
    });
  });

  // Mobile menu: collapsed by CSS when <html> has .js; the button opens it.
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('main-nav');
  if (toggle && nav) {
    const set = (open) => { nav.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Zamknij menu' : 'Otwórz menu'); };
    toggle.addEventListener('click', () => set(!nav.classList.contains('open')));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  }

  // Light/dark switch: follows the system until the visitor picks one; the choice is remembered.
  // The <head> script applies a saved choice before first paint, so there is no flash.
  const themeBtn = document.querySelector('.theme-toggle');
  if (themeBtn) {
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
    const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : systemDark.matches);
    const sync = () => themeBtn.setAttribute('aria-pressed', String(isDark()));
    themeBtn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch { /* private mode: works for this page only */ }
      sync();
    });
    systemDark.addEventListener('change', sync);
    sync();
  }

  // Forms (sign-up on Zapisy, contact on Kontakt): any <form class="js-form"> with a .form-status inside.
  // They post to the form worker (worker/form.js), which emails the office through Resend.
  // A form whose action is "mailto:…" instead opens the visitor's e-mail app with the answers filled in.
  document.querySelectorAll('form.js-form').forEach((form) => {
    const status = form.querySelector('.form-status');
    if (!status) return;
    // Messages live in data-msg-* attributes on the form so they can be translated in HTML.
    const msg = (key) => form.dataset['msg' + key[0].toUpperCase() + key.slice(1)] || '';
    const mailto = form.getAttribute('action').startsWith('mailto:');

    // Cloudflare Turnstile (anti-bot check needed for the confirmation email), loaded only when someone
    // starts filling in the form, so pages stay fast. Usually invisible.
    const turnstileBox = form.querySelector('[data-turnstile]');
    let turnstileId;
    if (turnstileBox) {
      const start = () => {
        if (turnstileId !== undefined || window.__turnstileLoading) return;
        const render = () => { turnstileId = window.turnstile.render(turnstileBox, { sitekey: turnstileBox.dataset.turnstile, appearance: 'interaction-only', language: 'pl' }); };
        if (window.turnstile) { render(); return; }
        window.__turnstileLoading = true;
        const queue = (window.__turnstileQueue = window.__turnstileQueue || []);
        queue.push(render);
        window.onTurnstileLoad = () => { while (queue.length) queue.shift()(); };
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
        s.async = true;
        document.head.appendChild(s);
      };
      form.addEventListener('focusin', start, { once: true });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (mailto) {
        const lines = [];
        for (const [name, value] of new FormData(form)) {
          if (name.startsWith('_') || !String(value).trim()) continue;
          const field = form.elements[name];
          const label = (field?.labels?.[0] || (field?.[0]?.labels?.[0]))?.textContent.replace(/\*|\(opcjonalnie\)/g, '').trim() || name;
          lines.push(`${name === 'zgoda' ? 'Zgoda na przetwarzanie danych' : label}: ${value}`);
        }
        const [address, query = ''] = form.getAttribute('action').slice(7).split('?');
        const subject = new URLSearchParams(query).get('subject') || '';
        window.location.href = `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
        status.textContent = msg('mailto');
        return;
      }
      status.textContent = msg('sending');
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const body = new FormData(form);
        body.append('page', window.location.href.split('#')[0]);
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body,
        });
        if (!res.ok) throw new Error(res.status);
        const formName = form.elements.form?.value;
        if (formName === 'zapisy' || formName === 'kontakt') conversion(formName);
        event('generate_lead', { form_name: formName || 'form' });
        form.reset();
        status.textContent = msg('success');
      } catch {
        status.textContent = msg('error');
      } finally {
        if (button) button.disabled = false;
        if (turnstileId !== undefined && window.turnstile) window.turnstile.reset(turnstileId); // a token works once
      }
    });
  });
})();
