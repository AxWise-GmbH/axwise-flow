import { alpha } from '@mui/material/styles';

export const MARKETING_CTA_DATA_ATTR = 'data-marketing-cta';
export const MARKETING_CTA_SELECTOR = `& [${MARKETING_CTA_DATA_ATTR}]`;

/** Subtle fill + border (matches citation / donate callout style). */
export function getMarketingCtaButtonSx(theme) {
  const primary = theme.palette.primary.main;
  return {
    color: primary,
    bgcolor: alpha(primary, 0.08),
    border: '1px solid',
    borderColor: alpha(primary, 0.45),
    boxShadow: 'none',
    backgroundImage: 'none',
    fontWeight: 700,
    textTransform: 'none',
    '&:hover': {
      bgcolor: alpha(primary, 0.14),
      borderColor: primary,
      boxShadow: `0 0 20px ${alpha(primary, 0.38)}`,
    },
    '&.Mui-disabled': {
      color: theme.palette.action.disabled,
      borderColor: theme.palette.action.disabledBackground,
      bgcolor: theme.palette.action.hover,
    },
  };
}

export function getMarketingCtaGlobalStyles(theme) {
  const primary = theme.palette.primary.main;
  const pulseName = 'marketingCtaGlow';
  return {
    [`[data-landing-root] [${MARKETING_CTA_DATA_ATTR}]`]: {
      ...getMarketingCtaButtonSx(theme),
      animation: `${pulseName} 2.8s ease-in-out infinite`,
      '@media (prefers-reduced-motion: reduce)': {
        animation: 'none',
      },
      '&:hover': {
        ...getMarketingCtaButtonSx(theme)['&:hover'],
        animation: 'none',
      },
    },
    [`@keyframes ${pulseName}`]: {
      '0%, 100%': {
        boxShadow: `0 0 0 0 ${alpha(primary, 0)}`,
        borderColor: alpha(primary, 0.45),
      },
      '50%': {
        boxShadow: `0 0 14px 2px ${alpha(primary, 0.42)}, 0 0 26px 6px ${alpha(primary, 0.14)}`,
        borderColor: alpha(primary, 0.85),
      },
    },
  };
}
