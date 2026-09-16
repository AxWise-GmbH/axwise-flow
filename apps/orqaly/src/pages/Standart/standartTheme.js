/**
 * [module: design-system]
 *
 * The PR #59 landing and the lean GCP shell share this self-contained dark
 * monochrome theme. It intentionally does not import the legacy enterprise
 * theme or persisted user preferences: doing so would pull Supabase into the
 * launch bundle through ThemeContext. MUI portals still inherit this theme,
 * so drawers, menus and popovers keep the same visual contract.
 */
import { alpha, createTheme, darken, lighten } from '@mui/material/styles';
import { FONT_STACK, INK, RADII, TYPE } from './standartTokens';

const PRIMARY = {
  main: '#F5F5F5',
  light: lighten('#F5F5F5', 0.5),
  dark: darken('#F5F5F5', 0.2),
  contrastText: '#0A0A0A',
};

const monoRole = (main, lightCoefficient = 0.3) => ({
  main,
  light: lighten(main, lightCoefficient),
  dark: darken(main, 0.3),
  contrastText: '#0A0A0A',
});

const palette = {
  mode: 'dark',
  primary: PRIMARY,
  secondary: monoRole('#A3A3A3'),
  success: monoRole('#A3A3A3', 0.4),
  warning: monoRole('#D4D4D4', 0.4),
  error: monoRole('#F5F5F5', 0.4),
  info: monoRole('#A3A3A3'),
  text: {
    primary: '#E6EDF3',
    secondary: '#8B949E',
    disabled: '#475569',
  },
  background: {
    default: '#0a0a0a',
    paper: '#0f0f0f',
    neutral: '#171717',
  },
  divider: '#1a1a1a',
  action: {
    hover: alpha(PRIMARY.main, 0.04),
    selected: alpha(PRIMARY.main, 0.08),
    disabled: alpha('#64748B', 0.3),
    disabledBackground: alpha('#64748B', 0.12),
  },
};

const SHADOWS = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -1px rgb(0 0 0 / 0.06)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04)',
};

const overlayPaper = {
  borderRadius: 12,
  border: `1px solid ${palette.divider}`,
  backgroundImage: 'none',
  boxShadow: '0 12px 32px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.40)',
};

/** Built once so account preferences can never repaint the launch surface. */
const base = createTheme({
  mono: true,
  monoAccent: false,
  palette,
  shape: { borderRadius: 10 },
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
  components: {
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
            outline: `2px solid ${alpha(PRIMARY.main, 0.55)}`,
            outlineOffset: '2px',
          },
          '&:active': { filter: 'brightness(0.96)' },
          '&.Mui-disabled': { opacity: 0.6 },
        },
        contained: {
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.16)',
          '&:hover': { boxShadow: '0 6px 18px rgba(15, 23, 42, 0.2)' },
          '&:active': { boxShadow: '0 2px 8px rgba(15, 23, 42, 0.16)' },
        },
        outlined: {
          borderWidth: '1.5px',
          '&:hover': {
            borderWidth: '1.5px',
            backgroundColor: alpha(PRIMARY.main, 0.08),
          },
          '&:active': { backgroundColor: alpha(PRIMARY.main, 0.14) },
        },
        text: {
          '&:hover': { backgroundColor: alpha(PRIMARY.main, 0.08) },
          '&:active': { backgroundColor: alpha(PRIMARY.main, 0.14) },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: alpha(palette.background.paper, 0.5),
            '& fieldset': { borderColor: palette.divider },
            '&:hover fieldset': { borderColor: palette.text.disabled },
            '&.Mui-focused fieldset': { borderColor: PRIMARY.main, borderWidth: 2 },
          },
        },
      },
    },
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
        },
      },
    },
    MuiDialog: { styleOverrides: { paper: overlayPaper } },
    MuiPopover: { styleOverrides: { paper: overlayPaper } },
    MuiMenu: {
      styleOverrides: { paper: { ...overlayPaper, borderRadius: 10 } },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { backgroundImage: 'none', borderRadius: 0, borderColor: palette.divider },
      },
    },
  },
});

/**
 * The landing override keeps PR #59's marketing font and pill button while the
 * rest of the base theme remains identical to its dark mono enterprise theme.
 */
export const standartTheme = createTheme(base, {
  typography: { fontFamily: FONT_STACK },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          // A string, not a number: see the multiplier trap in standartTokens.
          borderRadius: RADII.pill,
          textTransform: 'none',
        },
      },
    },
  },
  standart: { INK, RADII, TYPE },
});

export default standartTheme;
