/**
 * icon-map-coverage - dev tooling (not shipped).
 *
 * Two jobs:
 *  1. Validate every Phosphor base in ICON_PHOSPHOR_MAP actually exists in the
 *     Phosphor collection, in BOTH the regular (outline) and -fill (filled) weights.
 *  2. Report MUI icon coverage across src/ - overall and per page/area - listing any
 *     names still unmapped (these fall back to MUI in Outline/Filled mode).
 *
 * Run: node scripts/icon-map-coverage.mjs
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ICON_PHOSPHOR_MAP } from '../src/components/icons/iconSetMap.js';

const require = createRequire(import.meta.url);
const ph = require('@iconify-json/ph/icons.json');
const has = (glyph) => Boolean(ph.icons[glyph] || (ph.aliases && ph.aliases[glyph]));

// 1. Validate every mapped base resolves in both weights.
let invalid = 0;
for (const [mui, base] of Object.entries(ICON_PHOSPHOR_MAP)) {
  if (!has(base)) {
    invalid += 1;
    console.log(`INVALID outline  ${mui} -> ph:${base}`);
  }
  if (!has(`${base}-fill`)) {
    invalid += 1;
    console.log(`INVALID filled   ${mui} -> ph:${base}-fill`);
  }
}
console.log(invalid === 0 ? 'All mapped glyphs valid (outline + fill).' : `\n${invalid} invalid glyph(s) above.`);

// 2. Coverage across src/, overall + per area.
const lines = execSync(
  'grep -rEo "@mui/icons-material/[A-Za-z0-9]+" src --include="*.jsx" --include="*.js"',
  { encoding: 'utf8' }
)
  .trim()
  .split('\n');

const freq = {};
const area = {};
for (const ln of lines) {
  const m = ln.match(/^([^:]+):@mui\/icons-material\/([A-Za-z0-9]+)$/);
  if (!m) continue;
  const [, file, name] = m;
  freq[name] = (freq[name] || 0) + 1;
  const a = file.split('/').slice(1, 3).join('/');
  (area[a] ||= new Set()).add(name);
}

const names = Object.keys(freq);
const mappedNames = names.filter((n) => n in ICON_PHOSPHOR_MAP);
const totalUses = Object.values(freq).reduce((a, b) => a + b, 0);
const mappedUses = Object.entries(freq)
  .filter(([n]) => n in ICON_PHOSPHOR_MAP)
  .reduce((a, [, c]) => a + c, 0);

console.log(
  `\nDistinct icons: ${names.length} | mapped ${mappedNames.length} (${Math.round((mappedNames.length / names.length) * 100)}%)`
);
console.log(
  `Usage coverage: ${mappedUses}/${totalUses} (${Math.round((mappedUses / totalUses) * 100)}%)`
);

const partial = Object.entries(area)
  .map(([a, set]) => {
    const t = [...set];
    const mn = t.filter((n) => n in ICON_PHOSPHOR_MAP).length;
    return { a, mn, tot: t.length };
  })
  .filter((r) => r.mn < r.tot)
  .sort((x, y) => x.mn / x.tot - y.mn / y.tot);

if (partial.length === 0) {
  console.log('\nEvery area is 100% covered.');
} else {
  console.log('\nAreas with gaps (mapped/total):');
  for (const r of partial) console.log(`  ${r.mn}/${r.tot}  ${r.a}`);
}

const unmapped = names.filter((n) => !(n in ICON_PHOSPHOR_MAP)).sort((a, b) => freq[b] - freq[a]);
if (unmapped.length) {
  console.log(`\nUnmapped names (${unmapped.length}):`);
  unmapped.forEach((n) => console.log(`  ${String(freq[n]).padStart(3)} ${n}`));
}
