import { Box, Typography, Button, useTheme, alpha } from '@mui/material';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

import AppIcon from '../icons/AppIcon';

/**
 * Compact banner shown on a page when it is scoped to one organization via the
 * `?org=` URL param (set from the Home metric tiles). `onClear` removes the
 * filter. Renders nothing when there is no org name.
 */
export default function OrgFilterBanner({ name, onClear }) {
  const theme = useTheme();
  const color = theme.palette.primary.main;
  if (!name) return null;
  return (
    <Box
      role="status"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 0.75,
        mb: 1.25,
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(color, 0.35),
        bgcolor: alpha(color, 0.08),
      }}
    >
      <AppIcon
        name="CorporateFareOutlined"
        fallback={CorporateFareOutlinedIcon}
        sx={{ fontSize: 18, color }}
      />
      <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
        Showing data for <b>{name}</b>
      </Typography>
      <Button
        size="small"
        onClick={onClear}
        startIcon={
          <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} sx={{ fontSize: 16 }} />
        }
        sx={{ fontWeight: 700, flexShrink: 0 }}
      >
        Clear
      </Button>
    </Box>
  );
}
