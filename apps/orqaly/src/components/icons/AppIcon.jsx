import { useEffect, useState } from 'react';
import { Icon, addCollection } from '@iconify/react';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { useThemeMode } from '../../context/ThemeContext';
import GlassGlyph from './GlassGlyph';
import { resolveIconifyId } from './iconSetMap';

/**
 * AppIcon — the single advanced-mode icon resolver (companion to GlassIcon).
 *
 *   <AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} size={22} />
 *
 * Resolution order:
 *   1. Simple mode  -> plain MUI icon (or glass when `glassInSimple` is set).
 *   2. Advanced mode + an Outline/Filled set selected + `name` mapped + data
 *      loaded -> render the Phosphor glyph (regular = outline, -fill = filled).
 *   3. Otherwise (set === 'mui', unmapped name, or data still loading)
 *      -> render the original MUI `fallback`, so nothing is ever blank.
 *
 * Outline and Filled both come from one Phosphor collection (guaranteed shape +
 * coverage parity), fetched lazily the first time either set is selected so the
 * default Material experience ships no extra icon payload.
 */

// Both Outline and Filled are served by the single Phosphor ("ph") collection.
const PHOSPHOR_SETS = new Set(['outline', 'filled']);
const usesPhosphor = (set) => PHOSPHOR_SETS.has(set);

// --- lazy assets, loaded together the first time Outline/Filled is selected ---
// (1) the Phosphor glyph data, and (2) a MUI component -> name reverse map so we
// can resolve sites that pass an icon component as a ref with no explicit name.
// Both are kept out of the default (MUI) bundle via dynamic import.
let advState; // undefined | 'loading' | 'ready'
let nameForComponent = () => undefined;
const subscribers = new Set();

function ensureAdvancedAssets() {
  if (advState) return;
  advState = 'loading';
  Promise.all([import('@iconify-json/ph/icons.json'), import('./muiComponentNames.js')])
    .then(([ph, names]) => {
      addCollection(ph.default || ph);
      nameForComponent = names.nameForComponent;
      advState = 'ready';
      subscribers.forEach((fn) => fn());
    })
    .catch(() => {
      // Leave unset so a later render can retry; icons fall back to MUI meanwhile.
      advState = undefined;
    });
}

function useCollectionReady(set) {
  const needsPhosphor = usesPhosphor(set);
  const [, force] = useState(0);
  useEffect(() => {
    if (!needsPhosphor || advState === 'ready') return undefined;
    ensureAdvancedAssets();
    const fn = () => force((n) => n + 1);
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }, [needsPhosphor]);
  return needsPhosphor && advState === 'ready';
}

// DOM-safe props forwarded to the Iconify <Icon> (which is an <svg>). MUI-specific
// props (fontSize keyword, color enum, sx) don't apply to it, so we don't spread rest.
const PASS_THROUGH = [
  'className',
  'onClick',
  'onMouseEnter',
  'onMouseLeave',
  'id',
  'role',
  'tabIndex',
  'title',
  'aria-label',
  'aria-hidden',
];

export default function AppIcon({
  name,
  fallback: Fallback,
  size,
  tone,
  sx,
  glassInSimple = false,
  ...rest
}) {
  const { simpleMode } = useSimpleMode();
  const { iconSet } = useThemeMode();
  const ready = useCollectionReady(iconSet);

  // Only force a font size when the caller explicitly asked for one; otherwise we
  // preserve MUI's natural sizing (24px / the `fontSize` prop) so a blanket sweep
  // never silently resizes existing icons.
  const fallbackSx = size ? { fontSize: size, ...sx } : sx;
  const renderFallback = () => (Fallback ? <Fallback sx={fallbackSx} {...rest} /> : null);

  // 1. Simple mode: render the plain MUI icon, exactly as before the icon sweep —
  //    simple mode keeps its own look. Glass icons are opt-in via `glassInSimple`
  //    (used by surfaces like BentoCard / the account menu that show glass icons).
  if (simpleMode) {
    if (glassInSimple) {
      return (
        <GlassGlyph
          name={name}
          fallback={Fallback}
          size={size || 24}
          tone={tone}
          sx={sx}
          {...rest}
        />
      );
    }
    return renderFallback();
  }

  // 2. Advanced mode + thin-line set selected + name mapped + data loaded.
  //    When no explicit name was given, recover it from the fallback component
  //    (icon={X} / config { icon: X } sites) via the lazily-loaded reverse map.
  const effectiveName = name || (ready ? nameForComponent(Fallback) : undefined);
  const iconifyId = ready ? resolveIconifyId(effectiveName, iconSet) : null;
  if (iconifyId) {
    const dim = size || 24;
    const passed = {};
    for (const key of PASS_THROUGH) {
      if (rest[key] !== undefined) passed[key] = rest[key];
    }
    return (
      <Icon
        icon={iconifyId}
        width={dim}
        height={dim}
        style={{ display: 'inline-block', verticalAlign: 'middle', color: 'currentColor' }}
        {...passed}
      />
    );
  }

  // 3. MUI fallback (default set, unmapped name, or data still loading).
  return renderFallback();
}
