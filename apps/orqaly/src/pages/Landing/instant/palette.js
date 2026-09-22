// The one place a colour of the "Instant" pages lives in JavaScript. Everything else is
// a CSS variable in instant.css (dark) and theme.css (light); LineOrb is a canvas and needs
// a real colour string.
// Monochrome: a mid grey, because LineOrb stacks its strokes additively — the overlaps
// climb to white on their own and that ramp is the whole glow.
export const ORB_ACCENT = '#7d7d7d';
export const PAGE_BACKGROUND = '#000000';

// The light look (the footer switch). On a light ground LineOrb paints normally, so the
// strokes need ink of their own: a dark grey, and where fields cross they darken.
export const ORB_ACCENT_LIGHT = '#4a4a4a';
export const PAGE_BACKGROUND_LIGHT = '#f6f6f6';

export const orbAccent = (theme) => (theme === 'light' ? ORB_ACCENT_LIGHT : ORB_ACCENT);
export const pageBackground = (theme) =>
  theme === 'light' ? PAGE_BACKGROUND_LIGHT : PAGE_BACKGROUND;
