// The one place a colour of the "Instant" pages lives in JavaScript. Everything else is
// a CSS variable in instant.css; LineOrb is a canvas and needs a real colour string.
// Monochrome: a mid grey, because LineOrb stacks its strokes additively — the overlaps
// climb to white on their own and that ramp is the whole glow.
export const ORB_ACCENT = '#7d7d7d';
export const PAGE_BACKGROUND = '#000000';
