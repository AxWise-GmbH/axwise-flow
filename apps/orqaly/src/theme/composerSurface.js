import { alpha } from '@mui/material';

/**
 * The chrome shared by the two composers - the Goal tab's HeroPromptInput
 * (pages/Dashboard/Dashboard.jsx) and the Assistant tab's AssistantChat. They
 * are the same control in two tabs, so switching tabs must not change how the
 * box looks; keeping the colours in one place is how that stays true. Both
 * files already carried comments promising to mirror each other, and both had
 * drifted.
 *
 * Only colour lives here. The geometry (gap, padding, radius, the composer
 * measure) stays in the components, because both files also promise that
 * switching tabs must not resize or reshape the box, and that promise is
 * easier to keep where the layout is.
 *
 * The dark branch reproduces exactly what shipped before the light pass -
 * composerSurface.test.js pins it against a frozen snapshot. The one deliberate
 * exception is the toolbar icon resting alpha: the two composers used .55 and
 * .6, and one style means one number.
 */

const TOOL_ICON_DARK_ALPHA = 0.6;
const LIGHT_CARD_SHADOW = '0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)';

const SURFACE_TONE_KEY = '__orqalyComposerSurfaceTone';

/**
 * Resolve the actual surface behind the shared chat controls. Most callers use
 * the application palette, but Voice Studio deliberately remains dark even
 * while the rest of the app is light.
 */
export function composerSurfaceTone(theme) {
  const explicit = theme?.[SURFACE_TONE_KEY];
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return theme?.palette?.mode === 'dark' ? 'dark' : 'light';
}

/**
 * Add an explicit surface tone without rebuilding or mutating the MUI theme.
 * A nested ThemeProvider uses this for structured blocks; direct controls use
 * the returned view locally. `auto` preserves the ambient application theme.
 */
export function withComposerSurfaceTone(theme, surfaceTone = 'auto') {
  if (surfaceTone !== 'light' && surfaceTone !== 'dark') return theme;
  if (theme?.[SURFACE_TONE_KEY] === surfaceTone) return theme;
  return { ...theme, [SURFACE_TONE_KEY]: surfaceTone };
}

const isLight = (theme) => composerSurfaceTone(theme) === 'light';

/** The composer card itself: ground, hairline, and (light only) a soft lift. */
export function composerCardSx(theme) {
  if (!isLight(theme)) {
    return {
      bgcolor: alpha('#000', 0.3),
      border: '1px solid',
      borderColor: alpha('#fff', 0.12),
      boxShadow: 'none',
      transition: 'border-color .2s, box-shadow .2s',
    };
  }
  return {
    bgcolor: theme.palette.background.paper,
    border: '1px solid',
    borderColor: theme.palette.divider,
    boxShadow: LIGHT_CARD_SHADOW,
    transition: 'border-color .2s, box-shadow .2s',
  };
}

/** Typed text. */
export function composerInputColor(theme) {
  return isLight(theme) ? theme.palette.text.primary : '#fff';
}

/** Attach / setup / context icon buttons. `active` means the tool is engaged. */
export function composerToolIconSx(theme, { active = false } = {}) {
  if (!isLight(theme)) {
    return {
      color: active ? theme.palette.primary.main : alpha('#fff', TOOL_ICON_DARK_ALPHA),
      '&:hover': { color: '#fff' },
    };
  }
  return {
    color: active ? theme.palette.primary.dark : theme.palette.text.secondary,
    '&:hover': { color: theme.palette.text.primary },
  };
}

/**
 * Send. On white, the dark treatment (a white glyph on a 35%-alpha accent) is a
 * white arrow on pale mint - invisible. Light mode fills the button instead.
 */
export function composerSendSx(theme) {
  const { primary } = theme.palette;
  if (!isLight(theme)) {
    return {
      color: '#fff',
      bgcolor: alpha(primary.main, 0.35),
      transition: 'background-color .2s',
      '&:hover': { bgcolor: alpha(primary.main, 0.5) },
      '&.Mui-disabled': { color: alpha('#fff', 0.3), bgcolor: 'transparent' },
    };
  }
  return {
    color: primary.contrastText,
    bgcolor: primary.main,
    transition: 'background-color .2s',
    '&:hover': { bgcolor: primary.dark },
    '&.Mui-disabled': {
      color: alpha(theme.palette.text.primary, 0.3),
      bgcolor: 'transparent',
    },
  };
}

/** Small chips in the composer. Their dark variants intentionally keep the
 * slightly different shipped alphas for suggestions, the model pill, and the
 * Templates toolbar toggle. */
export function composerChipSx(theme, { on = false, variant = 'toolbar' } = {}) {
  const { primary } = theme.palette;
  if (!isLight(theme)) {
    if (variant === 'suggestion') {
      return {
        bgcolor: alpha('#fff', 0.06),
        color: alpha('#fff', 0.85),
        '&:hover': { bgcolor: alpha('#fff', 0.12) },
      };
    }
    if (variant === 'model') {
      return {
        bgcolor: alpha('#fff', 0.08),
        color: alpha('#fff', 0.85),
        '&:hover': { bgcolor: alpha('#fff', 0.14) },
      };
    }
    return {
      color: on ? primary.light : alpha('#fff', 0.6),
      bgcolor: on ? alpha(primary.main, 0.16) : alpha('#fff', 0.08),
      border: '1px solid',
      borderColor: on ? alpha(primary.main, 0.4) : 'transparent',
      '&:hover': { bgcolor: on ? alpha(primary.main, 0.24) : alpha('#fff', 0.12) },
    };
  }
  const ink = theme.palette.text.primary;
  const lightChip = {
    // primary.light is #D1FAE5 - invisible on a pale chip on white.
    color: on ? primary.dark : theme.palette.text.secondary,
    bgcolor: on ? alpha(primary.main, 0.12) : alpha(ink, 0.06),
    '&:hover': { bgcolor: on ? alpha(primary.main, 0.2) : alpha(ink, 0.1) },
  };
  if (variant !== 'toolbar') return lightChip;
  return {
    ...lightChip,
    border: '1px solid',
    borderColor: on ? alpha(primary.main, 0.35) : 'transparent',
  };
}

/** Message bubbles and the thinking placeholder. */
export function composerBubbleSx(theme, { isUser = false } = {}) {
  const { primary } = theme.palette;
  if (isUser) {
    return {
      bgcolor: alpha(primary.main, 0.22),
      border: '1px solid',
      borderColor: isLight(theme) ? alpha(primary.main, 0.35) : alpha('#fff', 0.08),
    };
  }
  if (!isLight(theme)) {
    return { bgcolor: alpha('#fff', 0.05), border: '1px solid', borderColor: alpha('#fff', 0.08) };
  }
  return {
    bgcolor: alpha(theme.palette.text.primary, 0.04),
    border: '1px solid',
    borderColor: theme.palette.divider,
  };
}

/** Body copy inside the thread and the empty state. */
export function composerInk(theme, { muted = false } = {}) {
  if (!isLight(theme)) return muted ? alpha('#fff', 0.6) : '#fff';
  return muted ? theme.palette.text.secondary : theme.palette.text.primary;
}

/**
 * The base colour the "thinking" shimmer sweeps. It is a gradient over this
 * colour at two alphas, so only the hue needs to flip.
 */
export function composerShimmerBase(theme) {
  return isLight(theme) ? theme.palette.text.primary : '#fff';
}

/** A translucent ink on whichever base the surface needs. */
export function composerInkAlpha(theme, weight) {
  return alpha(isLight(theme) ? theme.palette.text.primary : '#fff', weight);
}

/** The inset cards inside an assistant reply. */
export function composerBlockSx(theme) {
  if (!isLight(theme)) {
    return {
      border: '1px solid',
      borderColor: alpha('#fff', 0.08),
      bgcolor: alpha('#000', 0.25),
    };
  }
  return {
    border: '1px solid',
    borderColor: theme.palette.divider,
    bgcolor: alpha(theme.palette.text.primary, 0.03),
  };
}

/** A filled progress bar or chart series. */
export function composerAccent(theme) {
  return isLight(theme) ? theme.palette.primary.main : theme.palette.primary.light;
}

/** The plain background colour required by chart tooltips. */
export function composerTooltipBg(theme) {
  return isLight(theme) ? theme.palette.background.paper : '#111';
}
