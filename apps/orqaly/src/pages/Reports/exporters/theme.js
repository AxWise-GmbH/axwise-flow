/**
 * PDF export theme - one source of truth for colors, fonts, spacing.
 * Mirrors the on-screen `CATEGORY_COLORS` so the PDF feels like the app.
 */

const CATEGORY_PALETTE = {
  finance: { accent: [76, 175, 80], gradient: [129, 199, 132] },
  partner: { accent: [33, 150, 243], gradient: [100, 181, 246] },
  operations: { accent: [255, 152, 0], gradient: [255, 183, 77] },
  executive: { accent: [156, 39, 176], gradient: [186, 104, 200] },
  marketing: { accent: [233, 30, 99], gradient: [240, 98, 146] },
  agents: { accent: [0, 188, 212], gradient: [77, 208, 225] },
  goals: { accent: [124, 77, 255], gradient: [149, 117, 205] },
  knowledge: { accent: [63, 81, 181], gradient: [121, 134, 203] },
  quality: { accent: [0, 150, 136], gradient: [77, 182, 172] },
  pulse: { accent: [244, 67, 54], gradient: [229, 115, 115] },
};

const SEVERITY_COLORS = {
  error: [211, 47, 47],
  warning: [237, 108, 2],
  info: [2, 136, 209],
  success: [46, 125, 50],
};

const NEUTRAL = {
  ink: [22, 28, 38],
  body: [60, 72, 92],
  muted: [120, 132, 152],
  faint: [180, 190, 205],
  hairline: [225, 230, 240],
  surface: [248, 250, 253],
  card: [255, 255, 255],
};

const DARK = {
  bg: [12, 18, 32],
  surface: [22, 30, 48],
  card: [30, 42, 64],
  divider: [45, 56, 80],
  text: [255, 255, 255],
  textMuted: [180, 192, 212],
  textFaint: [120, 134, 158],
};

const TYPE = {
  display: 28,
  h1: 22,
  h2: 16,
  h3: 12,
  body: 10,
  caption: 8.5,
  micro: 7.5,
};

const SPACING = {
  margin: 16,
  gap: 8,
  cardPad: 6,
  sectionGap: 14,
};

export function getPalette(category) {
  return CATEGORY_PALETTE[category] || CATEGORY_PALETTE.executive;
}

export function getSeverityColor(severity) {
  return SEVERITY_COLORS[severity] || SEVERITY_COLORS.info;
}

export function getReportTheme(template, { variant = 'light' } = {}) {
  const palette = getPalette(template?.category);
  return {
    palette,
    severity: SEVERITY_COLORS,
    neutral: NEUTRAL,
    dark: DARK,
    type: TYPE,
    spacing: SPACING,
    variant,
  };
}
