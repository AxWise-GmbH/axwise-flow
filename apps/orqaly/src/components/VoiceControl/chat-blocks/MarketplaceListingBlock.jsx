import { Box, Typography, useTheme } from '@mui/material';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import BaseBlock from './BaseBlock.jsx';
import { composerInkAlpha } from '../../../theme/composerSurface';

export default function MarketplaceListingBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block.compact || {};
  const e = block.expanded || null;
  const enhanced = { ...block, entityType: 'marketplace-listing' };

  const price = c.price != null ? `$${c.price}` : '';
  const rating = c.rating != null ? `★ ${Number(c.rating).toFixed(1)}` : '';

  const expandedNode = e?.description ? (
    <Typography
      variant="caption"
      sx={{ color: composerInkAlpha(theme, 0.7), whiteSpace: 'pre-wrap' }}
    >
      {e.description}
    </Typography>
  ) : null;

  return (
    <BaseBlock
      icon={StorefrontRoundedIcon}
      title={c.title || 'Listing'}
      metaLines={[price, rating, c.vendor ? `vendor ${c.vendor}` : null]}
      expandedNode={expandedNode}
      block={enhanced}
      onOpen={onOpen}
    />
  );
}
