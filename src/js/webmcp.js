// WebMCP: expose safe, read-only-ish page tools to in-browser AI agents.
// The API is still experimental and its name changed between Chrome versions
// (navigator.modelContext -> document.modelContext). Verify against current
// Chrome docs before relying on it. Always feature-detect.
(() => {
  const ctx = document.modelContext || navigator.modelContext;
  if (!ctx || typeof ctx.registerTool !== 'function') return;

  const text = (t) => ({ content: [{ type: 'text', text: t }] });
  const sections = ['kurs', 'cennik', 'jak-zaczac', 'oferta', 'zdawalnosc', 'opinie', 'blog', 'faq', 'kontakt'];

  try {
    ctx.registerTool({
      name: 'get_page_summary',
      description: 'Returns the page title, main headline, course price and contact details of OSK Tailor driving school.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => text(JSON.stringify({
        title: document.title,
        headline: document.querySelector('h1')?.textContent.trim(),
        price: document.querySelector('.price')?.textContent.trim(),
        phone: '+48 725 563 155',
        email: 'biuro@osktailor.pl',
      })),
    });

    ctx.registerTool({
      name: 'scroll_to_section',
      description: 'Scrolls the page to a section by id.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', enum: sections } },
        required: ['id'],
      },
      execute: async ({ id }) => {
        const el = document.getElementById(id);
        if (!el) return text('Section not found');
        el.scrollIntoView({ behavior: 'smooth' });
        return text('Scrolled to ' + id);
      },
    });
  } catch (err) {
    console.warn('WebMCP registration failed', err);
  }
})();
