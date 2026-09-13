import { IconButton, Badge, Tooltip, useTheme, alpha } from '@mui/material';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';

import AppIcon from '../icons/AppIcon';

/**
 * Shared filter trigger used across every page so the "filters" affordance looks
 * identical everywhere: a circular icon button with the Tune (sliders) glyph, an
 * optional count badge, and an active (primary) state when filters are applied.
 *
 * Props:
 *  - onClick      click handler (opens the page's filter popup/dialog)
 *  - count        number badge (0 hides the badge)
 *  - active       force the primary "filters applied" colour (defaults to count > 0)
 *  - tooltip      tooltip + aria-label text (default "Filters")
 *  - size         button diameter in px (default 36)
 *  - sx           extra styles merged onto the IconButton
 */
export default function FilterButton({
  onClick,
  count = 0,
  active,
  tooltip = 'Filters',
  size = 36,
  sx,
  ...rest
}) {
  const theme = useTheme();
  const isActive = active ?? count > 0;
  const label = count > 0 ? `${tooltip}, ${count} active` : tooltip;

  return (
    <Tooltip title={tooltip} arrow>
      <Badge color="primary" badgeContent={count} max={9} overlap="circular">
        <IconButton
          size="small"
          onClick={onClick}
          aria-label={label}
          aria-haspopup="dialog"
          sx={{
            width: size,
            height: size,
            borderRadius: '50%',
            border: '1px solid',
            borderColor: isActive ? alpha(theme.palette.primary.main, 0.5) : 'divider',
            color: isActive ? 'primary.main' : 'text.secondary',
            transition: 'transform .15s, border-color .15s, color .15s',
            '&:hover': {
              transform: 'translateY(-1px)',
              borderColor: alpha(theme.palette.primary.main, 0.5),
              color: 'primary.main',
            },
            ...sx,
          }}
          {...rest}
        >
          <AppIcon
            name="TuneRounded"
            fallback={TuneRoundedIcon}
            sx={{ fontSize: Math.round(size * 0.5) }}
          />
        </IconButton>
      </Badge>
    </Tooltip>
  );
}
