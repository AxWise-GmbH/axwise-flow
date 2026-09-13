/**
 * Registry of injection types for website injection.
 * Each type has snippet template (placeholders: {postback_url}, {campaign_id}, etc.)
 * and placement in HTML.
 */
export const PLACEMENT = {
  BEFORE_HEAD_CLOSE: 'before</head>',
  AFTER_BODY_OPEN: 'after<body>',
  BEFORE_BODY_CLOSE: 'before</body>',
};

export const INJECTION_TYPES = [
  {
    id: 'postback',
    name: 'Postback / S2S',
    description: 'Conversion postback pixel or server-to-server URL',
    placement: PLACEMENT.BEFORE_BODY_CLOSE,
    snippetTemplate: `<!-- Postback -->
<script>
(function(){
  var u = "{postback_url}".replace("{click_id}", document.querySelector("[data-click-id]")?.dataset?.clickId || new URLSearchParams(location.search).get("click_id") || "");
  if (u.indexOf("http") === 0) (new Image()).src = u;
})();
</script>`,
    placeholders: ['postback_url', 'click_id', 'campaign_id'],
  },
  {
    id: 'gtm',
    name: 'Google Tag Manager',
    description: 'GTM container snippet',
    placement: PLACEMENT.AFTER_BODY_OPEN,
    snippetTemplate: `<!-- Google Tag Manager (noscript) fallback -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id={container_id}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`,
    placeholders: ['container_id'],
  },
  {
    id: 'gtm-head',
    name: 'Google Tag Manager (head)',
    description: 'GTM script in head',
    placement: PLACEMENT.BEFORE_HEAD_CLOSE,
    snippetTemplate: `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','{container_id}');</script>
<!-- End Google Tag Manager -->`,
    placeholders: ['container_id'],
  },
  {
    id: 'ga4',
    name: 'GA4',
    description: 'Google Analytics 4',
    placement: PLACEMENT.BEFORE_HEAD_CLOSE,
    snippetTemplate: `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id={measurement_id}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '{measurement_id}');
</script>`,
    placeholders: ['measurement_id'],
  },
  {
    id: 'facebook-pixel',
    name: 'Facebook Pixel',
    description: 'Meta/Facebook Pixel',
    placement: PLACEMENT.BEFORE_HEAD_CLOSE,
    snippetTemplate: `<!-- Meta Pixel -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','{pixel_id}');fbq('track','PageView');
</script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id={pixel_id}&ev=PageView&noscript=1"/></noscript>`,
    placeholders: ['pixel_id'],
  },
  {
    id: 'tiktok-pixel',
    name: 'TikTok Pixel',
    description: 'TikTok Pixel',
    placement: PLACEMENT.BEFORE_HEAD_CLOSE,
    snippetTemplate: `<!-- TikTok Pixel -->
<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
  ttq.load('{pixel_id}');
  ttq.page();
}(window, document, 'ttq');
</script>`,
    placeholders: ['pixel_id'],
  },
  {
    id: 'url-tokens',
    name: 'URL tokens (subid / utm)',
    description: 'Append tracking params to links (e.g. subid, utm_source)',
    placement: null,
    note: 'Applied to href attributes; not a snippet. Use campaign_id / subid in injection config.',
    placeholders: ['subid', 'utm_source', 'utm_medium', 'campaign_id'],
  },
];

export function getInjectionType(id) {
  return INJECTION_TYPES.find((t) => t.id === id);
}

export function renderSnippet(typeId, values = {}) {
  const t = getInjectionType(typeId);
  if (!t?.snippetTemplate) return '';
  let s = t.snippetTemplate;
  for (const [key, value] of Object.entries(values)) {
    s = s.replace(new RegExp(`\\{${key}\\}`, 'g'), value ?? '');
  }
  return s;
}
