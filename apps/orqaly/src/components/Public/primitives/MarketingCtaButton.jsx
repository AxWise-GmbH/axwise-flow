import { forwardRef } from 'react';
import { Button } from '@mui/material';
import { MARKETING_CTA_DATA_ATTR } from '../../../theme/marketingCta';

/**
 * Primary marketing CTA - subtle fill, primary border, glowing pulse (via MarketingCtaGlobalStyles).
 * Use for hero/signup/closing CTAs only, not dialogs or in-product demos.
 */
const MarketingCtaButton = forwardRef(function MarketingCtaButton(
  { pulse: _pulse = true, sx, size = 'large', disableElevation = true, variant = 'outlined', color = 'primary', ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      {...{ [MARKETING_CTA_DATA_ATTR]: '' }}
      disableElevation={disableElevation}
      variant={variant}
      color={color}
      size={size}
      sx={[{ borderRadius: 2 }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
      {...props}
    />
  );
});

export default MarketingCtaButton;
