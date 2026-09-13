import { createTheme, alpha, lighten, darken, hexToRgb } from '@mui/material/styles';

// ── Enterprise Design Tokens ─────────────────────────────────────────

const COLORS = {
  primary: {
    main: '#10B981', // Emerald 500
    light: '#D1FAE5',
    dark: '#059669',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#404040', // Neutral dark (replaces blue)
    light: '#525252',
    dark: '#262626',
    contrastText: '#FFFFFF',
  },
  neutral: {
    900: '#0F172A',
    800: '#1E293B',
    700: '#334155', // Body text
    500: '#64748B', // Secondary text
    400: '#94A3B8', // Disabled text
    200: '#E2E8F0', // Borders
    100: '#F1F5F9', // Light backgrounds
    50: '#F8FAFC', // Page background
  },
  success: { main: '#10B981', light: '#ECFDF5', dark: '#047857' },
  warning: { main: '#F59E0B', light: '#FFFBEB', dark: '#B45309' },
  error: { main: '#EF4444', light: '#FEF2F2', dark: '#B91C1C' },
  info: { main: '#525252', light: '#737373', dark: '#404040' },
};

const SHADOWS = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -1px rgb(0 0 0 / 0.06)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -2px rgb(0 0 0 / 0.05)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04)',
};

// ── Accent → CSS custom properties ───────────────────────────────────
// Simple-mode pages (the .mkt-landing shell used by /organizations, /hub,
// /marketplace, /dashboard) read CSS variables, not the MUI palette. This maps
// the active accent (the same value fed to palette.primary) onto the root
// variables those pages consume, so changing the primary colour in Settings
// recolours simple mode too. When no override is set we return the exact brand
// emerald tokens so the default look is byte-for-byte unchanged.

function toRgbTriplet(color) {
  if (typeof color !== 'string') return null;
  const source = color.startsWith('#') ? hexToRgb(color) : color;
  const match = source.match(/\(([^)]+)\)/);
  if (!match) return null;
  return match[1]
    .split(',')
    .slice(0, 3)
    .map((part) => part.trim())
    .join(', ');
}

const ACCENT_FALLBACK = {
  '--app-accent': '#10b981',
  '--app-accent-light': '#34d399',
  '--app-accent-dark': '#059669',
  '--app-accent-rgb': '16, 185, 129',
  '--app-accent-light-rgb': '52, 211, 153',
  '--app-accent-dark-rgb': '5, 150, 105',
};

export function getAccentCssVars(primaryColorOverride = null) {
  if (!primaryColorOverride) return { ...ACCENT_FALLBACK };
  try {
    const main = primaryColorOverride;
    const light = lighten(main, 0.5); // mirrors palette.primary.light
    const dark = darken(main, 0.2); // mirrors palette.primary.dark
    return {
      '--app-accent': main,
      '--app-accent-light': light,
      '--app-accent-dark': dark,
      '--app-accent-rgb': toRgbTriplet(main) || '16, 185, 129',
      '--app-accent-light-rgb': toRgbTriplet(light) || '52, 211, 153',
      '--app-accent-dark-rgb': toRgbTriplet(dark) || '5, 150, 105',
    };
  } catch {
    // Malformed colour (e.g. corrupted localStorage) -> brand emerald.
    return { ...ACCENT_FALLBACK };
  }
}

// ── Accent resolver (for surfaces outside the global ThemeProvider) ──
// Landing/marketing sections build their own local MUI themes (an always-dark
// marketing look), so they don't inherit the app palette. Without help they
// hardcode brand emerald and stop following the accent chosen in Settings.
// resolveAccent() reads the persisted accent (same localStorage key the global
// ThemeContext uses) and returns concrete palette.primary tokens, so those
// local themes track the user's colour. When no override is set it returns the
// exact brand emerald so the default look is byte-for-byte unchanged.

const STORAGE_KEY_PRIMARY = 'orchestratori-primary-color';
const EMERALD_PRIMARY = { main: '#10B981', light: '#34D399', dark: '#059669', contrastText: '#FFFFFF' };

export function resolveAccent(primaryColorOverride = null) {
  let base = primaryColorOverride;
  if (!base) {
    try {
      base = localStorage.getItem(STORAGE_KEY_PRIMARY) || null;
    } catch {
      base = null;
    }
  }
  if (!base) return { ...EMERALD_PRIMARY };
  try {
    return {
      main: base,
      light: lighten(base, 0.5),
      dark: darken(base, 0.2),
      contrastText: '#FFFFFF',
    };
  } catch {
    return { ...EMERALD_PRIMARY };
  }
}

// ── Theme Generator ──────────────────────────────────────────────────

export function getEnterpriseTheme(mode = 'light', primaryColorOverride = null) {
  const isDark = mode === 'dark';

  // Handle dynamic primary color
  const primary = primaryColorOverride
    ? {
        main: primaryColorOverride,
        light: lighten(primaryColorOverride, 0.5),
        dark: darken(primaryColorOverride, 0.2),
        contrastText: '#FFFFFF',
      }
    : COLORS.primary;

  const palette = {
    mode,
    primary,
    secondary: COLORS.secondary,
    success: COLORS.success,
    warning: COLORS.warning,
    error: COLORS.error,
    info: COLORS.info,
    text: {
      primary: isDark ? '#E6EDF3' : COLORS.neutral[900],
      secondary: isDark ? '#8B949E' : COLORS.neutral[500],
      disabled: isDark ? '#475569' : COLORS.neutral[400],
    },
    background: {
      default: isDark ? '#0a0a0a' : COLORS.neutral[50],
      paper: isDark ? '#0f0f0f' : '#FFFFFF',
      neutral: isDark ? '#171717' : COLORS.neutral[100],
    },
    divider: isDark ? '#1a1a1a' : COLORS.neutral[200],
    action: {
      hover: alpha(primary.main, 0.04),
      selected: alpha(primary.main, 0.08),
      disabled: alpha(COLORS.neutral[500], 0.3),
      disabledBackground: alpha(COLORS.neutral[500], 0.12),
    },
  };

  return createTheme({
    palette,
    shape: {
      borderRadius: 10,
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h1: { fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 },
      h2: { fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3 },
      h3: { fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.4 },
      h4: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.4 },
      h5: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 },
      h6: {
        fontSize: '0.875rem',
        fontWeight: 600,
        lineHeight: 1.5,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      },
      body1: { fontSize: '0.9375rem', lineHeight: 1.6, color: palette.text.secondary },
      body2: { fontSize: '0.875rem', lineHeight: 1.5 },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.01em' },
      caption: { fontSize: '0.75rem', fontWeight: 500, letterSpacing: '0.02em' },
    },
    // ── Custom Animation Tokens ──────────────────────────────────────────
    animations: {
      fadeInUp: 'fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards', // Smooth Apple-like ease
      scaleIn: 'scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards', // Bouncy spring
      slideInRight: 'slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '@keyframes fadeInUp': {
            '0%': { opacity: 0, transform: 'translateY(12px)' },
            '100%': { opacity: 1, transform: 'translateY(0)' },
          },
          '@keyframes scaleIn': {
            '0%': { opacity: 0, transform: 'scale(0.96)' },
            '100%': { opacity: 1, transform: 'scale(1)' },
          },
          '@keyframes slideInRight': {
            '0%': { opacity: 0, transform: 'translateX(20px)' },
            '100%': { opacity: 1, transform: 'translateX(0)' },
          },
          '@keyframes pulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.5 },
          },
          html: {
            WebkitOverflowScrolling: 'touch',
          },
          body: {
            backgroundColor: palette.background.default,
            scrollbarWidth: 'thin',
            touchAction: 'pan-y',
            overscrollBehaviorY: 'auto',
            '&::-webkit-scrollbar': { width: '6px', height: '6px' },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: isDark ? '#475569' : '#CBD5E1',
              borderRadius: '3px',
            },
          },
          '#root': {
            minHeight: '100%',
            touchAction: 'pan-y',
          },
        },
      },
      // ── Buttons ────────────────────────────────────────────────────────
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            padding: '8px 16px',
            fontWeight: 700,
            textTransform: 'none',
            transition:
              'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease, filter 0.15s ease',
            '&:focus-visible': {
              outline: `2px solid ${alpha(primary.main, 0.55)}`,
              outlineOffset: '2px',
            },
            '&:active': {
              filter: 'brightness(0.96)',
            },
            '&.Mui-disabled': {
              opacity: 0.6,
            },
          },
          contained: {
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.16)',
            '&:hover': {
              boxShadow: '0 6px 18px rgba(15, 23, 42, 0.2)',
            },
            '&:active': {
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.16)',
            },
          },
          outlined: {
            borderWidth: '1.5px',
            '&:hover': {
              borderWidth: '1.5px',
              backgroundColor: alpha(primary.main, 0.08),
            },
            '&:active': {
              backgroundColor: alpha(primary.main, 0.14),
            },
          },
          text: {
            '&:hover': {
              backgroundColor: alpha(primary.main, 0.08),
            },
            '&:active': {
              backgroundColor: alpha(primary.main, 0.14),
            },
          },
        },
      },
      // ── Inputs ─────────────────────────────────────────────────────────
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 8,
              backgroundColor:
                palette.mode === 'light' ? '#fff' : alpha(palette.background.paper, 0.5),
              '& fieldset': { borderColor: palette.divider },
              '&:hover fieldset': { borderColor: palette.text.disabled },
              '&.Mui-focused fieldset': { borderColor: primary.main, borderWidth: 2 },
            },
          },
        },
      },
      // ── Surfaces ───────────────────────────────────────────────────────
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: 'none' },
          rounded: { border: `1px solid ${palette.divider}` },
          elevation1: { boxShadow: SHADOWS.sm, border: 'none' },
          elevation2: { boxShadow: SHADOWS.md, border: 'none' },
          elevation8: {
            boxShadow: SHADOWS.xl,
            border: `1px solid ${palette.divider}`,
            borderRadius: 16,
          }, // For Menus/Popovers
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: `1px solid ${palette.divider}`,
            boxShadow: SHADOWS.sm,
            transition: 'transform 0.2s, box-shadow 0.2s',
          },
        },
      },
      MuiAccordion: {
        styleOverrides: {
          root: {
            border: `1px solid ${palette.divider}`,
            borderRadius: '12px !important',
            marginBottom: 8,
            boxShadow: 'none',
            '&:before': { display: 'none' },
            '&.Mui-expanded': { margin: '0 0 8px 0' },
          },
        },
      },
      // ── Dialogs & Overlays ─────────────────────────────────────────────
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 16,
            boxShadow: SHADOWS.xl,
            border: `1px solid ${palette.divider}`,
          },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            backgroundColor: 'rgba(0, 0, 0, 0.4)', // black overlay for popups/dropdowns
            backdropFilter: 'blur(4px)',
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 12,
            boxShadow: SHADOWS.lg,
            border: `1px solid ${palette.divider}`,
          },
        },
      },
      // ── Data Display ───────────────────────────────────────────────────
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600, borderRadius: 6 },
          sizeSmall: { fontSize: '0.75rem', height: 24 },
          colorPrimary: {
            backgroundColor: alpha(primary.main, 0.1),
            color: primary.dark,
            border: `1px solid ${alpha(primary.main, 0.2)}`,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${palette.divider}`,
            padding: '12px 16px',
          },
          head: {
            fontWeight: 600,
            backgroundColor: palette.background.neutral,
            textTransform: 'uppercase',
            fontSize: '0.75rem',
            color: palette.text.secondary,
            letterSpacing: '0.04em',
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 8 },
          standardInfo: { backgroundColor: alpha(COLORS.info.main, 0.1), color: COLORS.info.dark },
          standardSuccess: {
            backgroundColor: alpha(COLORS.success.main, 0.1),
            color: COLORS.success.dark,
          },
          standardWarning: {
            backgroundColor: alpha(COLORS.warning.main, 0.1),
            color: COLORS.warning.dark,
          },
          standardError: {
            backgroundColor: alpha(COLORS.error.main, 0.1),
            color: COLORS.error.dark,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: COLORS.neutral[900],
            fontSize: '0.75rem',
            borderRadius: 6,
            padding: '8px 12px',
          },
          arrow: { color: COLORS.neutral[900] },
        },
      },
      // ── Lists ──────────────────────────────────────────────────────────
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            marginBottom: 2,
            '&.Mui-selected': {
              backgroundColor: alpha(primary.main, 0.1),
              color: primary.dark,
              '&:hover': { backgroundColor: alpha(primary.main, 0.15) },
              '& .MuiListItemIcon-root': { color: primary.main },
            },
          },
        },
      },
      MuiListItemIcon: {
        styleOverrides: {
          root: { minWidth: 40, color: palette.text.secondary },
        },
      },
    },
  });
}
