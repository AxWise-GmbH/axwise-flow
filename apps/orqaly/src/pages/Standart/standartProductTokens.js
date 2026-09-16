export const STANDARD_PAGE = {
  glyph: 14,
  glyphSmall: 12,
  row: 38,
  control: 32,
  gap: 1.25,
  tile: 22,
  chipHeight: 18,
  cellPadding: '8px 16px',
  footerControl: 26,
  footerControlCompact: 22,
  tabBandPad: 1.25,
  tabIndicatorHeight: 1.5,
  labelFontSize: '0.875rem',
  metaFontSize: '0.75rem',
};

export const MONO_ROW_RADIUS_PX = '20px';
export const MONO_ROW_BAND = {
  dark: 'rgba(255,255,255,0.0175)',
  light: 'rgba(15,23,42,0.0045)',
};

export function standardTabIndicatorSx(theme, indicator = {}) {
  const { left = 0, width = 0, ready = false } = indicator;
  return {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: STANDARD_PAGE.tabIndicatorHeight,
    width,
    bgcolor: theme.palette.text.primary,
    pointerEvents: 'none',
    transform: `translateX(${left}px)`,
    opacity: ready ? 1 : 0,
    transition: ready ? theme.transitions.create(['transform', 'width', 'opacity']) : 'none',
    '@media (prefers-reduced-motion: reduce)': {
      transition: ready ? 'opacity 120ms linear' : 'none',
    },
  };
}
