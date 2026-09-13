import { Box, ListItemButton, Typography, alpha, useTheme } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import AppIcon from '../icons/AppIcon';
import { useSetupSurface } from './SetupSurface';

/**
 * A row inside a setup section: glyph well, a name, a line about it, and
 * something on the right.
 *
 * One component for what were two - the Assistant panel's read-only row with a
 * chevron out to another page, and the Goal panel's selectable target. They had
 * the same sx down to the alpha values; only the trailing affordance differed.
 *
 * The title wraps to two lines rather than truncating. A workspace's saved
 * teams are named after the goals that made them ("Team: Goal: create a
 * business plan topic - s…"), so a single `noWrap` line was reliably cut before
 * it said anything.
 */
export default function SetupRow({
  icon,
  title,
  subtitle = null,
  selected = false,
  onSelect = null,
  role = undefined,
  action = null,
}) {
  const theme = useTheme();
  const tokens = useSetupSurface();
  const tint = theme.palette.primary.main;

  const glyph = (
    <Box
      sx={{
        flexShrink: 0,
        width: 30,
        height: 30,
        borderRadius: 1.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: tokens.iconWell,
        color: selected ? theme.palette.primary.light : tokens.iconFg,
      }}
    >
      <AppIcon fallback={icon} sx={{ fontSize: 17 }} />
    </Box>
  );

  const text = (
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography
        variant="body2"
        sx={{
          // Explicit, because the theme paints `.Mui-selected` with
          // `primary.dark` (#059669), which is unreadable on this ground.
          color: tokens.fg,
          lineHeight: 1.25,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="caption" sx={{ color: tokens.textDim }} noWrap>
          {subtitle}
        </Typography>
      )}
    </Box>
  );

  const frame = {
    borderRadius: 2,
    px: 1,
    py: 0.75,
    gap: 1,
    mb: 0.5,
    display: 'flex',
    alignItems: 'center',
    border: '1px solid',
  };

  if (!onSelect) {
    // Static branch. An IconButton nested inside a ListItemButton is an invalid
    // control-in-control, which is the whole reason this branch exists.
    return (
      <Box sx={{ ...frame, borderColor: tokens.hairline, bgcolor: tokens.fill }}>
        {glyph}
        {text}
        {action}
      </Box>
    );
  }

  return (
    <ListItemButton
      selected={selected}
      onClick={onSelect}
      role={role}
      aria-checked={role === 'radio' ? selected : undefined}
      sx={{
        ...frame,
        borderColor: selected ? alpha(tint, 0.5) : tokens.hairline,
        bgcolor: selected ? alpha(tint, 0.12) : tokens.fill,
        '&.Mui-selected:hover': { bgcolor: alpha(tint, 0.18) },
        '&:hover': { bgcolor: tokens.fillHover },
      }}
    >
      {glyph}
      {text}
      {selected && (
        <AppIcon
          name="CheckCircleRounded"
          fallback={CheckCircleRoundedIcon}
          sx={{ fontSize: 18, color: theme.palette.success.light }}
        />
      )}
      {action}
    </ListItemButton>
  );
}
