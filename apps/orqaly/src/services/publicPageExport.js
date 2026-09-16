/**
 * Export Digital Business Card page data as a self-contained HTML file
 * that can be hosted on any domain. No external dependencies.
 */

function escapeHtml(str) {
  if (str == null) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getInitials(text) {
  const source = String(text || '').trim();
  if (!source) return 'P';
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('');
}

/**
 * Build structured links from raw page data (mirrors buildStructured in PublicProfilePage).
 */
function buildStructured(page) {
  if (!page) return { main: [], social: [], contact: [], company: null };
  const main = [];
  const social = [];
  const contact = [];

  if (page.websiteUrl) main.push({ key: 'website', label: 'Website', url: page.websiteUrl });
  if (page.companyWebsite)
    main.push({
      key: 'company-website',
      label: page.companyName || 'Company',
      url: page.companyWebsite,
    });

  const handle = String(page.telegramHandle || '')
    .replace(/^@+/, '')
    .trim();
  if (handle) contact.push({ key: 'telegram', label: `@${handle}`, url: `https://t.me/${handle}` });
  if (page.telegramGroup)
    contact.push({ key: 'telegram-group', label: 'Telegram Group', url: page.telegramGroup });
  if (page.contact?.email)
    contact.push({ key: 'email', label: page.contact.email, url: `mailto:${page.contact.email}` });
  if (page.contact?.phone)
    contact.push({ key: 'phone', label: page.contact.phone, url: `tel:${page.contact.phone}` });
  if (page.contact?.whatsapp) {
    const clean = String(page.contact.whatsapp).replace(/[^\d+]/g, '');
    if (clean)
      contact.push({
        key: 'whatsapp',
        label: 'WhatsApp',
        url: `https://wa.me/${clean.replace(/\+/g, '')}`,
      });
  }

  const socialLabels = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    x: 'X / Twitter',
    linkedin: 'LinkedIn',
    tiktok: 'TikTok',
    youtube: 'YouTube',
  };
  Object.entries(page.social || {}).forEach(([key, value]) => {
    if (!value) return;
    social.push({ key, label: socialLabels[key] || key, url: value });
  });

  const company =
    page.companyName || page.companyDescription
      ? { name: page.companyName, description: page.companyDescription }
      : null;
  return { main, social, contact, company };
}

/**
 * Generate a self-contained HTML document for the given page data.
 * @param {Object} page - Raw page object (slug, title, subtitle, photoUrl, accentColor, company*, contact*, social*, etc.)
 * @returns {string} Full HTML document
 */
export function exportPageToHtml(page) {
  const accent = page?.accentColor || '#1B2A4A';
  const { main, social, contact, company } = buildStructured(page);
  const title = page?.title || 'Digital Business Card';
  const payload = JSON.stringify({
    page: {
      title,
      subtitle: page?.subtitle,
      photoUrl: page?.photoUrl,
      accentColor: accent,
      companyName: page?.companyName,
      companyDescription: page?.companyDescription,
      websiteUrl: page?.websiteUrl,
      companyWebsite: page?.companyWebsite,
      contact: page?.contact,
      social: page?.social,
      telegramHandle: page?.telegramHandle,
      telegramGroup: page?.telegramGroup,
    },
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F4F6F9; color: #1a1a1a; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 24px 16px; }
    .card { width: 100%; max-width: 440px; border-radius: 24px; overflow: hidden; border: 1px solid rgba(0,0,0,0.08); box-shadow: 0 8px 32px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04); background: #fff; }
    .hero { position: relative; padding: 32px 24px 24px; text-align: center; background: linear-gradient(135deg, ${accent} 0%, ${accent} 100%); }
    .hero-title { margin: 0; font-size: 1.5rem; font-weight: 800; color: #fff; letter-spacing: -0.02em; line-height: 1.2; }
    .hero-subtitle { margin: 6px 0 0; font-size: 0.875rem; color: rgba(255,255,255,0.85); max-width: 340px; margin-left: auto; margin-right: auto; line-height: 1.5; }
    .avatar { width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 12px; display: block; border: 2px solid rgba(255,255,255,0.3); object-fit: cover; }
    .avatar-initials { width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center; font-size: 1.75rem; font-weight: 700; background: rgba(255,255,255,0.2); color: #fff; border: 2px solid rgba(255,255,255,0.3); }
    .body { padding: 20px 24px; }
    .company { padding: 14px; border-radius: 12px; background: rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.06); margin-bottom: 16px; }
    .company-name { font-size: 0.875rem; font-weight: 700; margin: 0 0 4px; }
    .company-desc { font-size: 0.75rem; color: #666; line-height: 1.5; margin: 0; }
    .section-label { font-size: 0.65rem; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; display: block; }
    .btn { display: block; width: 100%; padding: 12px 20px; margin-bottom: 8px; border: none; border-radius: 12px; font-size: 0.875rem; font-weight: 600; text-align: left; text-decoration: none; color: #fff; background: ${accent}; cursor: pointer; transition: transform 0.15s, box-shadow 0.2s; }
    .btn:hover { filter: brightness(0.92); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
    .social-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .social-btn { width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.1); display: inline-flex; align-items: center; justify-content: center; color: ${accent}; text-decoration: none; transition: all 0.15s; }
    .social-btn:hover { background: rgba(0,0,0,0.05); transform: translateY(-2px); }
    .contact-row { display: flex; align-items: center; gap: 10px; padding: 8px 4px; text-decoration: none; color: inherit; border-radius: 6px; transition: background 0.15s; }
    .contact-row:hover { background: rgba(0,0,0,0.04); }
    .contact-row span { font-size: 0.8125rem; }
    .footer { padding: 8px 24px 20px; text-align: center; }
    .footer small { font-size: 0.65rem; color: #999; }
  </style>
</head>
<body>
  <div class="card" id="card"></div>
  <script id="data" type="application/json">${payload.replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}<\/script>
  <script>
(function() {
  var data = JSON.parse(document.getElementById('data').textContent);
  var page = data.page;
  var accent = page.accentColor || '#1B2A4A';
  var struct = ${JSON.stringify({ main, social, contact, company }).replace(/</g, '\\u003c')};

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === 'className') n.className = attrs[k]; else if (k === 'href') n.href = attrs[k]; else if (k === 'target') n.target = attrs[k]; else if (k === 'rel') n.rel = attrs[k]; else if (k === 'style') n.style.cssText = attrs[k]; else n.setAttribute(k, attrs[k]); }
    if (children) children.forEach(function(c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  var card = document.getElementById('card');

  var hero = el('div', { className: 'hero' });
  if (page.photoUrl) {
    var img = el('img', { className: 'avatar', src: page.photoUrl, alt: page.title });
    hero.appendChild(img);
  } else {
    var initials = el('div', { className: 'avatar-initials' });
    initials.textContent = (function(t){ var s=String(t||'').trim(); if(!s) return 'P'; return s.split(/\\s+/).slice(0,2).map(function(p){ return p.charAt(0).toUpperCase(); }).join(''); })(page.title || page.companyName);
    hero.appendChild(initials);
  }
  hero.appendChild(el('h1', { className: 'hero-title' }, [page.title || '']));
  if (page.subtitle) hero.appendChild(el('p', { className: 'hero-subtitle' }, [page.subtitle]));
  card.appendChild(hero);

  var body = el('div', { className: 'body' });

  if (struct.company && (struct.company.name || struct.company.description)) {
    var comp = el('div', { className: 'company' });
    if (struct.company.name) comp.appendChild(el('p', { className: 'company-name' }, [struct.company.name]));
    if (struct.company.description) comp.appendChild(el('p', { className: 'company-desc' }, [struct.company.description]));
    body.appendChild(comp);
  }

  if (struct.main.length) {
    struct.main.forEach(function(item) {
      var a = el('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer', className: 'btn' }, [item.label]);
      body.appendChild(a);
    });
  }

  if (struct.social.length) {
    body.appendChild(el('span', { className: 'section-label' }, ['Social']));
    var row = el('div', { className: 'social-row' });
    struct.social.forEach(function(item) {
      var a = el('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer', className: 'social-btn', title: item.label });
      a.textContent = '\u2192';
      row.appendChild(a);
    });
    body.appendChild(row);
  }

  if (struct.contact.length) {
    body.appendChild(el('span', { className: 'section-label' }, ['Contact']));
    struct.contact.forEach(function(item) {
      var a = el('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer', className: 'contact-row' });
      a.appendChild(el('span', {}, [item.label]));
      body.appendChild(a);
    });
  }

  if (struct.main.length === 0 && struct.social.length === 0 && struct.contact.length === 0) {
    body.appendChild(el('p', { style: 'text-align:center;color:#666;padding:16px 0;margin:0;font-size:0.875rem' }, ['No links configured.']));
  }

  card.appendChild(body);
  card.appendChild(el('div', { className: 'footer' }, [el('small', {}, ['Powered by Orchestrator'])]));
})();
</script>
</body>
</html>`;

  return html;
}

/**
 * Trigger download of the HTML file.
 */
export function downloadPageAsHtml(page, filename = 'digital-business-card.html') {
  const html = exportPageToHtml(page);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
