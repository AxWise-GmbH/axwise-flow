import { createTheme, alpha } from '@mui/material/styles';

// Design system: single control height for buttons, inputs, dropdowns, filter icons
export const CONTROL_HEIGHT = 40;
export const ICON_BUTTON_SIZE = 40;
export const CHIP_HEIGHT = 28;
export const CHIP_HEIGHT_DENSE = 24;

const lightPalette = {
  mode: 'light',
  primary: {
    main: '#1B2A4A',
    light: '#2E4068',
    dark: '#0F1B33',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#3B82F6',
    light: '#60A5FA',
    dark: '#2563EB',
  },
  success: { main: '#10B981', light: '#34D399', dark: '#059669' },
  warning: { main: '#F59E0B', light: '#FBBF24', dark: '#D97706' },
  error: { main: '#EF4444', light: '#F87171', dark: '#DC2626' },
  background: { default: '#F1F5F9', paper: '#FFFFFF' },
  text: { primary: '#1E293B', secondary: '#64748B' },
  divider: '#E2E8F0',
};

// Professional dark theme — deeper greys, muted accents
const darkPalette = {
  mode: 'dark',
  primary: {
    main: '#5B8DEF',
    light: '#7BA8F5',
    dark: '#4A7BD9',
    contrastText: '#0D1117',
  },
  secondary: {
    main: '#6B7280',
    light: '#9CA3AF',
    dark: '#4B5563',
  },
  success: { main: '#22C55E', light: '#4ADE80', dark: '#16A34A' },
  warning: { main: '#EAB308', light: '#FACC15', dark: '#CA8A04' },
  error: { main: '#EF4444', light: '#F87171', dark: '#DC2626' },
  info: { main: '#3B82F6', light: '#60A5FA', dark: '#2563EB' },
  background: { default: '#0D1117', paper: '#131920' },
  text: { primary: '#E6EDF3', secondary: '#8B949E' },
  divider: '#21262D',
  action: {
    active: '#8B949E',
    hover: 'rgba(110, 118, 129, 0.1)',
    selected: 'rgba(110, 118, 129, 0.2)',
  },
};

const sharedComponents = (focusColor, palette) => ({
  MuiButton: {
    styleOverrides: {
      root: {
        textTransform: 'none',
        fontWeight: 700,
        borderRadius: 10,
        minHeight: CONTROL_HEIGHT,
        padding: '8px 16px',
        transition:
          'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease, filter 0.15s ease',
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: focusColor,
          outlineOffset: '2px',
        },
        '&:active': {
          filter: 'brightness(0.96)',
        },
        '&.Mui-disabled': { opacity: 0.6 },
      },
      sizeSmall: {
        minHeight: 36,
        padding: '6px 14px',
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
          backgroundColor: alpha(palette.primary.main, 0.08),
        },
        '&:active': {
          backgroundColor: alpha(palette.primary.main, 0.14),
        },
      },
      text: {
        '&:hover': {
          backgroundColor: alpha(palette.primary.main, 0.08),
        },
        '&:active': {
          backgroundColor: alpha(palette.primary.main, 0.14),
        },
      },
    },
  },
  MuiIconButton: {
    styleOverrides: {
      root: {
        width: ICON_BUTTON_SIZE,
        height: ICON_BUTTON_SIZE,
        transition:
          'background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, filter 0.15s ease',
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: focusColor,
          outlineOffset: '2px',
        },
        '&:hover': {
          backgroundColor: alpha(palette.primary.main, 0.08),
        },
        '&:active': {
          backgroundColor: alpha(palette.primary.main, 0.14),
          filter: 'brightness(0.96)',
        },
        '&.Mui-disabled': { opacity: 0.6 },
      },
      sizeSmall: {
        width: 36,
        height: 36,
      },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: {
        fontWeight: 600,
        fontSize: '0.75rem',
        height: CHIP_HEIGHT,
        borderRadius: 8,
      },
      sizeSmall: {
        height: CHIP_HEIGHT,
      },
    },
  },
  MuiTableCell: {
    styleOverrides: {
      root: { padding: '10px 14px' },
      head: {
        fontWeight: 700,
        fontSize: '0.75rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      },
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: {
        boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        transition: 'box-shadow 0.2s ease, transform 0.2s ease, background-color 0.2s ease',
      },
    },
  },
  MuiCard: {
    styleOverrides: {
      root: {
        transition:
          'box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease',
      },
    },
  },
  MuiTableRow: {
    styleOverrides: {
      root: {
        transition: 'background-color 0.15s ease',
      },
    },
  },
  MuiDrawer: {
    styleOverrides: {
      paper: {
        borderRadius: '12px 0 0 12px',
        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease',
      },
    },
  },
  MuiDialog: {
    styleOverrides: {
      root: {
        '& .MuiDialog-container': {
          transition: 'opacity 0.2s ease',
        },
      },
      paper: {
        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
      },
    },
  },
  MuiListItemButton: {
    styleOverrides: {
      root: {
        transition: 'background-color 0.2s ease, color 0.2s ease',
      },
    },
  },
});

function getTheme(mode, primaryColorOverride) {
  const isLight = mode === 'light';
  const basePalette = isLight ? lightPalette : darkPalette;
  const palette = primaryColorOverride
    ? {
        ...basePalette,
        primary: {
          ...basePalette.primary,
          main: primaryColorOverride,
        },
      }
    : basePalette;
  const focusColor = palette.primary?.main || '#3B82F6';
  return createTheme({
    palette,
    transitions: {
      duration: {
        shortest: 150,
        shorter: 200,
        short: 250,
        standard: 300,
        complex: 375,
        enteringScreen: 280,
        leavingScreen: 220,
      },
      easing: {
        easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
        easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
        easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h4: { fontWeight: 700, fontSize: '1.75rem' },
      h5: { fontWeight: 600, fontSize: '1.25rem' },
      h6: { fontWeight: 600, fontSize: '1rem' },
      subtitle1: { fontWeight: 500, fontSize: '0.875rem' },
      subtitle2: { fontWeight: 500, fontSize: '0.75rem' },
      body2: { fontSize: '0.8125rem' },
    },
    shape: { borderRadius: 10 },
    components: {
      ...sharedComponents(focusColor, palette),
      MuiTableCell: {
        styleOverrides: {
          root: {
            padding: '10px 14px',
            borderColor: isLight ? '#E2E8F0' : '#21262D',
          },
          head: {
            fontWeight: 700,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: isLight ? '#64748B' : '#8B949E',
            backgroundColor: isLight ? '#F8FAFC' : '#131920',
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& input[type="date"]': {
              colorScheme: isLight ? 'light' : 'dark',
            },
            '& .MuiOutlinedInput-root': {
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderWidth: 2,
              },
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '&.MuiInputBase-sizeSmall': {
              minHeight: CONTROL_HEIGHT,
            },
            // Autofill: match theme in light and dark so browser default yellow/blue is overridden
            '& input:-webkit-autofill': {
              WebkitBoxShadow: `0 0 0 1000px ${palette.background.paper} inset`,
              WebkitTextFillColor: palette.text.primary,
              caretColor: palette.text.primary,
              transition: 'background-color 5000s ease-in-out 0s',
            },
            '& input:-webkit-autofill:hover': {
              WebkitBoxShadow: `0 0 0 1000px ${palette.background.paper} inset`,
              WebkitTextFillColor: palette.text.primary,
            },
            '& input:-webkit-autofill:focus': {
              WebkitBoxShadow: `0 0 0 1000px ${palette.background.paper} inset`,
              WebkitTextFillColor: palette.text.primary,
              caretColor: palette.text.primary,
            },
            '& input:-webkit-autofill:active': {
              WebkitBoxShadow: `0 0 0 1000px ${palette.background.paper} inset`,
              WebkitTextFillColor: palette.text.primary,
            },
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          root: {
            '&.Mui-focused': {
              '& .MuiOutlinedInput-notchedOutline': {
                borderWidth: 2,
              },
            },
          },
        },
      },
    },
  });
}

export default getTheme('light', null);
export { getTheme };
