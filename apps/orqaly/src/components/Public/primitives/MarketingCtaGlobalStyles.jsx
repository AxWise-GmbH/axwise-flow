import { GlobalStyles, useTheme } from '@mui/material';
import { getMarketingCtaGlobalStyles } from '../../../theme/marketingCta';

/** Injects CTA glow/pulse + subtle fill for `[data-marketing-cta]` under marketing roots. */
export default function MarketingCtaGlobalStyles() {
  const theme = useTheme();
  return <GlobalStyles styles={getMarketingCtaGlobalStyles(theme)} />;
}
