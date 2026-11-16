// Price table: the HTML ships with a snapshot of the prices, so the page works without JS.
// The office edits prices in n8n; this refreshes the table from there when the page loads.
// The webhook only allows the site's own origin (CORS), so on localhost the snapshot stays.
(() => {
  const URL = 'https://n8n.osktailor.pl/webhook/0a920e70-f587-452a-9069-c36c45af5b01';
  const ROWS = 14; // the sheet holds settings below row 14
  const table = document.getElementById('price-table');
  if (!table || !window.fetch) return;

  const price = (v) => (typeof v === 'number' ? `${v} zł` : String(v ?? '').trim());
  const since = (s) => String(s).replace(/\//g, '.');

  function render(d) {
    const n = Math.min(d.nazwy.length, ROWS);
    const rows = [];
    for (let i = 0; i < n; i++) {
      if (!String(d.nazwy[i] ?? '').trim()) continue;
      rows.push({ group: String(d.rodzaj?.[i] ?? '').trim(), name: String(d.nazwy[i]).trim(), price: price(d.ceny?.[i]) });
    }
    if (!rows.length || !rows[0].group) return false;
    const tbody = document.createElement('tbody');
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      if (r.group) {
        let span = 1;
        while (i + span < rows.length && !rows[i + span].group) span++;
        const th = document.createElement('th');
        th.scope = 'rowgroup';
        th.rowSpan = span;
        th.textContent = r.group;
        tr.append(th);
        tr.className = 'group-start';
      }
      const promo = /^promocja/i.test(r.name);
      const name = document.createElement('td');
      name.textContent = r.name;
      const p = document.createElement('td');
      p.className = 'num';
      p.textContent = r.price + (promo ? ' *)' : '');
      if (promo) tr.classList.add('promo');
      tr.append(name, p);
      tbody.append(tr);
    });
    table.tBodies[0].replaceWith(tbody);
    if (d.since) {
      document.getElementById('price-caption').textContent = `Obowiązuje od dnia ${since(d.since)} r. (ceny brutto)`;
      const promo = document.getElementById('price-promo');
      if (promo) promo.textContent = promo.textContent.replace(/Od dnia [^ ]+ r\./, `Od dnia ${since(d.since)} r.`);
    }
    return true;
  }

  fetch(URL, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((data) => {
      const d = Array.isArray(data) ? data[0] : data;
      if (d && Array.isArray(d.nazwy)) render(d);
    })
    .catch(() => { /* keep the snapshot already in the HTML */ });
})();
