(() => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

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

  // Forms (sign-up on Zapisy, contact on Kontakt): any <form class="js-form"> with a .form-status inside.
  // Until a form service is connected, action="mailto:…" opens the visitor's e-mail app
  // with the answers filled in, so no message gets lost.
  document.querySelectorAll('form.js-form').forEach((form) => {
    const status = form.querySelector('.form-status');
    if (!status) return;
    // Messages live in data-msg-* attributes on the form so they can be translated in HTML.
    const msg = (key) => form.dataset['msg' + key[0].toUpperCase() + key.slice(1)] || '';
    const mailto = form.getAttribute('action').startsWith('mailto:');

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
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: new FormData(form),
        });
        if (!res.ok) throw new Error(res.status);
        form.reset();
        status.textContent = msg('success');
      } catch {
        status.textContent = msg('error');
      }
    });
  });
})();
