/**
 * gen-mui-component-names - dev tooling (not shipped at runtime).
 *
 * Regenerates src/components/icons/muiComponentNames.js: a reverse map from every
 * MUI icon COMPONENT used in src/ to its module name, so AppIcon can recover the
 * name when a call site passes the component as a ref (icon={X}) with no name.
 *
 * Run after icons are added/removed: node scripts/gen-mui-component-names.mjs
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const lines = execSync(
  'grep -rhoE "@mui/icons-material/[A-Za-z0-9]+" src --include="*.jsx" --include="*.js"',
  { encoding: 'utf8' }
)
  .trim()
  .split('\n');

const names = [...new Set(lines.map((l) => l.split('/').pop()))].sort();
const imports = names.map((n, i) => `import I${i} from '@mui/icons-material/${n}';`).join('\n');
const entries = names.map((n, i) => `  [I${i}, '${n}'],`).join('\n');

const file = `/**
 * muiComponentNames - generated reverse map from MUI icon COMPONENT -> its module
 * name (e.g. DatasetRoundedIcon -> "DatasetRounded"). Lets AppIcon recover the icon
 * name when a call site passes the component as a ref (icon={X}, {icon: X}) with no
 * explicit name, so those sites switch icon sets too.
 *
 * Lazily imported by AppIcon ONLY when an Outline/Filled set is selected, so these
 * ${names.length} imports never touch the default (MUI) bundle.
 * Regenerate with scripts/gen-mui-component-names.mjs.
 */
${imports}

const NAME_BY_COMPONENT = new Map([
${entries}
]);

export function nameForComponent(component) {
  return component ? NAME_BY_COMPONENT.get(component) : undefined;
}
`;

fs.writeFileSync('src/components/icons/muiComponentNames.js', file);
console.log('generated muiComponentNames.js with', names.length, 'icons');
