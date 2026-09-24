/*
 * Light mode keeps working only while colours stay in tokens. The footer switch flips the
 * landing root to data-oi-theme="light" and theme.css swaps the tokens; a colour written out
 * in a rule would stay dark-only. These checks keep it that way.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

// Kept in the tree but shown on no page (see the project notes); they were never themed.
const NOT_SHOWN = [
  'examplesDark.css',
  'HeroWindow.css',
  'IntegrationsHub.css',
  'pages/heroes/FeaturesHero.css',
  'pages/heroes/HowHero.css',
];

function cssFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

const shown = cssFiles(here).filter((file) => !NOT_SHOWN.includes(relative(here, file)));
const parse = (file) => postcss.parse(readFileSync(file, 'utf8'), { from: file });

const COLOUR =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[\d.]|(?<![\w-])(?:white|black)(?![\w-])/gi;
const MASK = /^(-webkit-)?mask/;

// Print is ink on white paper whatever the screen shows, so print rules may name colours.
function inPrint(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && parent.name === 'media' && /\bprint\b/.test(parent.params)) {
      return true;
    }
  }
  return false;
}

function tokenBlock(file, selector) {
  const tokens = {};
  parse(join(here, file)).walkRules((rule) => {
    if (rule.selector !== selector || rule.parent.type !== 'root') return;
    rule.walkDecls(/^--/, (decl) => {
      tokens[decl.prop] = decl.value;
    });
  });
  return tokens;
}

const isColour = (value) => /#[0-9a-f]{3,8}\b|rgba?\(|color-mix|gradient/i.test(value);

describe('light mode tokens', () => {
  const dark = tokenBlock('instant.css', "[data-landing-variant='instant']");
  const channels = tokenBlock('theme.css', "[data-landing-variant='instant']");
  const light = tokenBlock('theme.css', "[data-landing-variant='instant'][data-oi-theme='light']");

  it('gives every colour token of the dark page a light twin', () => {
    const colourTokens = Object.keys(dark).filter(
      (name) => isColour(dark[name]) || name.endsWith('-rgb')
    );
    expect(colourTokens.length).toBeGreaterThan(30);
    // --oi-glow is worked out from --oi-glow-rgb, so it follows by itself.
    const missing = colourTokens.filter((name) => !(name in light) && name !== '--oi-glow');
    expect(missing).toEqual([]);
  });

  it('declares every channel token for both looks', () => {
    expect(Object.keys(channels).sort()).toEqual(
      Object.keys(channels)
        .filter((name) => name in light)
        .sort()
    );
  });

  it('keeps every colour of the landing CSS in a custom property', () => {
    const loose = [];
    for (const file of shown) {
      parse(file).walkDecls((decl) => {
        if (decl.prop.startsWith('--') || MASK.test(decl.prop) || inPrint(decl)) return;
        const value = decl.value.replace(/url\([^)]*\)/g, '');
        if (value.match(COLOUR)) {
          loose.push(`${relative(here, file)}:${decl.source.start.line} ${decl.prop}: ${decl.value}`);
        }
      });
    }
    expect(loose).toEqual([]);
  });

  it('stays monochrome in light too: neutral greys only', () => {
    const tinted = [];
    for (const file of shown) {
      parse(file).walkRules((rule) => {
        if (!rule.selector.includes("data-oi-theme='light'")) return;
        rule.walkDecls((decl) => {
          for (const hex of decl.value.match(/#[0-9a-f]{6}\b/gi) ?? []) {
            const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
            if (Math.max(r, g, b) - Math.min(r, g, b) > 6) tinted.push(`${relative(here, file)} ${hex}`);
          }
          for (const [, r, g, b] of decl.value.matchAll(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/g)) {
            if (Math.max(r, g, b) - Math.min(r, g, b) > 6) tinted.push(`${relative(here, file)} ${r},${g},${b}`);
          }
        });
      });
    }
    expect(tinted).toEqual([]);
  });
});
