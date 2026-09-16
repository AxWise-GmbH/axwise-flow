import AppIcon from './AppIcon';

/**
 * GlassIcon - backwards-compatible alias kept for the ~35 existing call sites.
 *
 * It now delegates to AppIcon with `glassInSimple`, so every <GlassIcon> renders:
 *   - simple mode   -> the premium Liquid Glass glyph (unchanged), and
 *   - advanced mode -> the user's selected icon set (MUI / Outline / Filled),
 *
 * instead of the old behaviour of plain MUI in advanced mode. Same props as before
 * (name, fallback, size, tile, tone, sx, ...rest) flow straight through.
 */
export default function GlassIcon(props) {
  return <AppIcon {...props} glassInSimple />;
}
