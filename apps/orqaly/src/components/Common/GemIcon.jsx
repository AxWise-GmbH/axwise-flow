/**
 * GemIcon - faceted, sparkling gemstone icons rendered as self-contained inline SVG.
 *
 * Single source of truth for the 5 gems (Emerald, Ruby, Peridot, Turquoise, Amethyst),
 * each with its own realistic cut. Reused by:
 *   - Settings > Preferences "Primary color (accent)" picker (applies gem.accent as theme color)
 *   - Settings > Branding gem logo picker (via gemToDataUri, stored as brandLogo)
 *
 * The SVG art is trusted, static markup built from the GEMS data below (no user input),
 * so rendering via dangerouslySetInnerHTML is safe here.
 */
import { useId } from 'react';
import { Box } from '@mui/material';

// key, name, cut, accent (UI hex applied as primary color), glow, ramp (light -> dark facet shades)
export const GEMS = [
  {
    key: 'emerald',
    name: 'Emerald',
    cut: 'Step cut',
    accent: '#10B981',
    glow: '#34e57f',
    ramp: ['#d6ffe8', '#7fe6ab', '#2ecc71', '#17a659', '#0d7a40', '#084d29'],
  },
  {
    key: 'ruby',
    name: 'Ruby',
    cut: 'Cushion cut',
    accent: '#E11D48',
    glow: '#ff3b5c',
    ramp: ['#ffd6de', '#ff8b9f', '#ff2d55', '#d01840', '#9c0e2e', '#650819'],
  },
  {
    key: 'peridot',
    name: 'Peridot',
    cut: 'Pear cut',
    accent: '#84CC16',
    glow: '#cdf25f',
    ramp: ['#f6ffcf', '#e0ff8f', '#bce64a', '#97c62c', '#6f9418', '#48610c'],
  },
  {
    key: 'turquoise',
    name: 'Turquoise',
    cut: 'Cabochon',
    accent: '#14B8A6',
    glow: '#40e6d4',
    ramp: ['#eafffb', '#a9f2e6', '#5cd9c9', '#2fb9ab', '#1a8c80', '#0e5f57'],
  },
  {
    key: 'amethyst',
    name: 'Amethyst',
    cut: 'Marquise cut',
    accent: '#A855F7',
    glow: '#a25cff',
    ramp: ['#f2e4ff', '#cfa3ff', '#a55cff', '#8434e0', '#6320b0', '#3f1478'],
  },
];

export function getGem(key) {
  return GEMS.find((g) => g.key === key) || null;
}

// ---- SVG builder helpers (ported from the approved gems.html review page) ----

function defs(id, ramp) {
  return (
    '<defs>' +
    '<linearGradient id="lite-' +
    id +
    '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
    ramp[0] +
    '"/><stop offset="1" stop-color="' +
    ramp[2] +
    '"/></linearGradient>' +
    '<linearGradient id="mid-' +
    id +
    '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
    ramp[1] +
    '"/><stop offset="1" stop-color="' +
    ramp[3] +
    '"/></linearGradient>' +
    '<linearGradient id="dark-' +
    id +
    '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
    ramp[2] +
    '"/><stop offset="1" stop-color="' +
    ramp[4] +
    '"/></linearGradient>' +
    '<linearGradient id="deep-' +
    id +
    '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
    ramp[3] +
    '"/><stop offset="1" stop-color="' +
    ramp[5] +
    '"/></linearGradient>' +
    '<radialGradient id="sheen-' +
    id +
    '" cx="0.35" cy="0.26" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="0.4" stop-color="#fff" stop-opacity=".07"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="body-' +
    id +
    '" cx="0.38" cy="0.3" r="0.85"><stop offset="0" stop-color="' +
    ramp[0] +
    '"/><stop offset="0.45" stop-color="' +
    ramp[2] +
    '"/><stop offset="1" stop-color="' +
    ramp[4] +
    '"/></radialGradient>' +
    '</defs>'
  );
}

function star(cx, cy, s) {
  const q = s * 0.26;
  return (
    'M' + cx + ',' + (cy - s) +
    ' C' + (cx + q) + ',' + (cy - q) + ' ' + (cx + q) + ',' + (cy - q) + ' ' + (cx + s) + ',' + cy +
    ' C' + (cx + q) + ',' + (cy + q) + ' ' + (cx + q) + ',' + (cy + q) + ' ' + cx + ',' + (cy + s) +
    ' C' + (cx - q) + ',' + (cy + q) + ' ' + (cx - q) + ',' + (cy + q) + ' ' + (cx - s) + ',' + cy +
    ' C' + (cx - q) + ',' + (cy - q) + ' ' + (cx - q) + ',' + (cy - q) + ' ' + cx + ',' + (cy - s) + ' Z'
  );
}

const GRADS = ['lite', 'mid', 'dark', 'deep'];

// radial fan of facets from a centre to a ring of points, shaded by vertical position for fake lighting
function fan(id, c, pts) {
  const ys = pts.map((p) => p[1]);
  const top = Math.min(...ys);
  const bot = Math.max(...ys);
  let facets = '';
  let edges = '';
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const my = (a[1] + b[1]) / 2;
    const t = (my - top) / (bot - top || 1);
    let idx = Math.min(3, Math.floor(t * 4));
    if (i % 2 === 0) idx = Math.max(0, idx - 1);
    facets +=
      '<polygon points="' + c[0] + ',' + c[1] + ' ' + a[0] + ',' + a[1] + ' ' + b[0] + ',' + b[1] +
      '" fill="url(#' + GRADS[idx] + '-' + id + ')"/>';
    edges +=
      '<line class="fedge" x1="' + c[0] + '" y1="' + c[1] + '" x2="' + a[0] + '" y2="' + a[1] + '"/>';
  }
  return { facets, edges };
}

function twinkles(cls, list) {
  return list
    .map((t) => '<path class="' + cls + '" style="animation-delay:' + t[3] + 's" d="' + star(t[0], t[1], t[2]) + '"/>')
    .join('');
}

function facetedGem(g, id, cfg, animated) {
  const f = fan(id, cfg.c, cfg.pts);
  const clip = 'clip-' + id;
  const sh = cfg.shine || { x: -30, y: -8, w: 34, h: 140 };
  const shineRect = animated
    ? '<rect class="' + id + '-shine" x="' + sh.x + '" y="' + sh.y + '" width="' + sh.w + '" height="' + sh.h + '" fill="#fff" fill-opacity=".55" style="mix-blend-mode:screen"/>'
    : '';
  const tw = animated ? twinkles(id + '-tw', cfg.tw || []) : '';
  return (
    defs(id, g.ramp) +
    '<clipPath id="' + clip + '"><path d="' + cfg.outline + '"/></clipPath>' +
    '<g clip-path="url(#' + clip + ')">' +
    f.facets +
    '<path d="' + cfg.table + '" fill="url(#lite-' + id + ')"/>' +
    '<path d="' + cfg.table + '" fill="url(#sheen-' + id + ')"/>' +
    f.edges +
    '<path class="fedge" style="stroke-opacity:.22" d="' + cfg.table + '"/>' +
    '<path d="' + cfg.outline + '" fill="url(#sheen-' + id + ')"/>' +
    shineRect +
    '</g>' +
    '<path class="rim" d="' + cfg.outline + '"/>' +
    (cfg.spec ? '<circle cx="' + cfg.spec[0] + '" cy="' + cfg.spec[1] + '" r="2.2" fill="#fff" fill-opacity=".9"/>' : '') +
    tw
  );
}

function emeraldGem(g, id, animated) {
  const O1 = '38,10 62,10 82,26 82,94 62,110 38,110 18,94 18,26';
  const O2 = '43,20 57,20 74,34 74,86 57,100 43,100 26,86 26,34';
  const O3 = '48,30 52,30 66,42 66,78 52,90 48,90 34,78 34,42';
  const TB = '45,42 55,42 62,50 62,70 55,78 45,78 38,70 38,50';
  const clip = 'clip-' + id;
  const shineRect = animated
    ? '<rect class="' + id + '-shine" x="-30" y="-8" width="34" height="150" fill="#fff" fill-opacity=".55" style="mix-blend-mode:screen"/>'
    : '';
  const tw = animated ? twinkles(id + '-tw', [[43, 34, 4.5, 0], [60, 60, 3, 0.9]]) : '';
  return (
    defs(id, g.ramp) +
    '<clipPath id="' + clip + '"><polygon points="' + O1 + '"/></clipPath>' +
    '<g clip-path="url(#' + clip + ')">' +
    '<polygon points="' + O1 + '" fill="url(#deep-' + id + ')"/>' +
    '<polygon points="' + O2 + '" fill="url(#dark-' + id + ')"/>' +
    '<polygon points="' + O3 + '" fill="url(#mid-' + id + ')"/>' +
    '<polygon points="' + TB + '" fill="url(#lite-' + id + ')"/>' +
    '<polygon points="' + TB + '" fill="url(#sheen-' + id + ')"/>' +
    '<polygon class="fedge" style="stroke-opacity:.3" points="' + O2 + '"/>' +
    '<polygon class="fedge" style="stroke-opacity:.3" points="' + O3 + '"/>' +
    '<polygon class="fedge" style="stroke-opacity:.3" points="' + TB + '"/>' +
    '<polygon points="' + O1 + '" fill="url(#sheen-' + id + ')"/>' +
    shineRect +
    '</g>' +
    '<polygon class="rim" points="' + O1 + '"/>' +
    '<circle cx="43" cy="34" r="2.2" fill="#fff" fill-opacity=".9"/>' +
    tw
  );
}

function cabochonGem(g, id, animated) {
  const clip = 'clip-' + id;
  const veins =
    '<path d="M22,44 C34,40 40,52 52,48 C64,44 72,54 82,50" fill="none" stroke="' + g.ramp[5] + '" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round"/>' +
    '<path d="M30,66 C40,70 46,60 58,64 C66,67 72,62 78,66" fill="none" stroke="' + g.ramp[5] + '" stroke-opacity=".4" stroke-width="1.1" stroke-linecap="round"/>' +
    '<path d="M46,26 C48,36 44,44 50,54" fill="none" stroke="' + g.ramp[4] + '" stroke-opacity=".35" stroke-width="1" stroke-linecap="round"/>';
  const tw = animated ? twinkles(id + '-tw', [[38, 31, 4, 0], [66, 64, 2.6, 1.1]]) : '';
  return (
    defs(id, g.ramp) +
    '<clipPath id="' + clip + '"><ellipse cx="50" cy="52" rx="42" ry="34"/></clipPath>' +
    '<g clip-path="url(#' + clip + ')">' +
    '<ellipse cx="50" cy="52" rx="42" ry="34" fill="url(#body-' + id + ')"/>' +
    veins +
    '<ellipse cx="40" cy="34" rx="18" ry="11" fill="url(#sheen-' + id + ')"/>' +
    '<ellipse cx="38" cy="31" rx="7" ry="4" fill="#fff" fill-opacity=".65"/>' +
    '</g>' +
    '<ellipse class="rim" cx="50" cy="52" rx="42" ry="34"/>' +
    tw
  );
}

const CUT_CONFIG = {
  ruby: {
    vb: '0 0 100 100',
    outline: 'M28,6 L72,6 Q94,6 94,28 L94,72 Q94,94 72,94 L28,94 Q6,94 6,72 L6,28 Q6,6 28,6 Z',
    c: [50, 50],
    pts: [[50, 6], [85, 15], [94, 50], [85, 85], [50, 94], [15, 85], [6, 50], [15, 15]],
    table: 'M40,22 L60,22 Q78,22 78,40 L78,60 Q78,78 60,78 L40,78 Q22,78 22,60 L22,40 Q22,22 40,22 Z',
    spec: [38, 26],
    tw: [[38, 26, 4.5, 0], [70, 68, 3, 1]],
  },
  peridot: {
    vb: '0 0 100 106',
    outline: 'M50,4 C68,8 86,32 86,62 C86,86 70,101 50,101 C30,101 14,86 14,62 C14,32 32,8 50,4 Z',
    c: [50, 58],
    pts: [[50, 4], [70, 12], [84, 34], [86, 62], [76, 88], [58, 99], [50, 101], [42, 99], [24, 88], [14, 62], [16, 34], [30, 12]],
    table: 'M50,30 C60,32 68,44 68,56 C68,70 60,80 50,82 C40,80 32,70 32,56 C32,44 40,32 50,30 Z',
    spec: [42, 26],
    tw: [[42, 26, 4.5, 0], [60, 74, 3, 0.9]],
  },
  amethyst: {
    vb: '0 0 100 90',
    outline: 'M6,45 C24,16 76,16 94,45 C76,74 24,74 6,45 Z',
    c: [50, 45],
    pts: [[6, 45], [20, 26], [38, 18], [50, 16], [62, 18], [80, 26], [94, 45], [80, 64], [62, 72], [50, 74], [38, 72], [20, 64]],
    table: 'M24,45 C36,31 64,31 76,45 C64,59 36,59 24,45 Z',
    spec: [40, 32],
    tw: [[40, 32, 4.5, 0], [64, 56, 3, 1]],
    shine: { x: -40, y: -5, w: 40, h: 100 },
  },
};

const VIEWBOX = {
  emerald: '0 0 100 120',
  ruby: '0 0 100 100',
  peridot: '0 0 100 106',
  turquoise: '0 0 100 100',
  amethyst: '0 0 100 90',
};

function animationCss(id) {
  return (
    '<style>' +
    '@media (prefers-reduced-motion:no-preference){' +
    '.' + id + '-shine{transform-box:fill-box;transform-origin:center;animation:' + id + '-sweep 3.6s ease-in-out infinite}' +
    '.' + id + '-tw{transform-box:fill-box;transform-origin:center;animation:' + id + '-tw 2.6s ease-in-out infinite}' +
    '}' +
    '@keyframes ' + id + '-sweep{0%{transform:translateX(-70px) skewX(-16deg);opacity:0}35%{opacity:.85}62%{opacity:.85}100%{transform:translateX(95px) skewX(-16deg);opacity:0}}' +
    '@keyframes ' + id + '-tw{0%,100%{opacity:0;transform:scale(.25)}50%{opacity:1;transform:scale(1)}}' +
    '.fedge{stroke:#fff;stroke-opacity:.14;stroke-width:.5;fill:none}' +
    '.rim{fill:none;stroke:' + '#ffffff' + ';stroke-opacity:.45;stroke-width:1}' +
    '</style>'
  );
}

// Static styles (facet edges + rim) always needed, even without animation.
function baseCss() {
  return (
    '<style>' +
    '.fedge{stroke:#fff;stroke-opacity:.14;stroke-width:.5;fill:none}' +
    '.rim{fill:none;stroke:#ffffff;stroke-opacity:.45;stroke-width:1}' +
    '</style>'
  );
}

/**
 * Build a complete, self-contained gem SVG string.
 * @param {object} gem - an entry from GEMS
 * @param {object} [opts]
 * @param {string} [opts.idPrefix] - gradient/clip id namespace (keep stable for deterministic output)
 * @param {number} [opts.size] - pixel width/height of the rendered svg
 * @param {boolean} [opts.animated] - include sweep/twinkle animation + style
 */
export function buildGemSvg(gem, opts = {}) {
  const g = typeof gem === 'string' ? getGem(gem) : gem;
  if (!g) return '';
  const idPrefix = opts.idPrefix || g.key;
  const size = opts.size || 32;
  const animated = opts.animated !== false;
  const vb = VIEWBOX[g.key];

  let inner;
  if (g.key === 'emerald') inner = emeraldGem(g, idPrefix, animated);
  else if (g.key === 'turquoise') inner = cabochonGem(g, idPrefix, animated);
  else inner = facetedGem(g, idPrefix, CUT_CONFIG[g.key], animated);

  const css = animated ? animationCss(idPrefix) : baseCss();

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="' + size + '" height="' + size +
    '" role="img" aria-label="' + g.name + ' ' + g.cut + '" style="overflow:visible">' +
    css +
    inner +
    '</svg>'
  );
}

/**
 * Deterministic data-URI for a gem, suitable for storing as the sidebar logo (brandLogo).
 * Fixed idPrefix + static (non-animated) art so the same gem always yields the same string
 * (lets callers compare brandLogo === gemToDataUri(key) for a selected state).
 */
export function gemToDataUri(gemKey) {
  const svg = buildGemSvg(gemKey, { idPrefix: 'logo-' + gemKey, size: 64, animated: false });
  if (!svg) return '';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/**
 * React component rendering an inline, animated gem icon.
 * Uses a per-instance id namespace so multiple gems on one page never collide.
 */
export default function GemIcon({ gem, size = 32, animated = true, sx = {}, ...rest }) {
  const rid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = typeof gem === 'string' ? getGem(gem) : gem;
  if (!g) return null;
  const html = buildGemSvg(g, { idPrefix: rid, size, animated });
  return (
    <Box
      component="span"
      aria-hidden={false}
      sx={{
        display: 'inline-flex',
        width: size,
        height: size,
        lineHeight: 0,
        filter: `drop-shadow(0 2px 5px ${g.glow}66)`,
        ...sx,
      }}
      dangerouslySetInnerHTML={{ __html: html }}
      {...rest}
    />
  );
}
