import { Stack, Typography } from '@mui/material';
import AppIcon from '../../../components/icons/AppIcon';

/** Small icon + bold heading used to introduce a block inside a section card. */
export default function DocSectionTitle({ children, icon, color, sx }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2, ...sx }}>
      {icon && <AppIcon fallback={icon} sx={{ fontSize: 20, color: color || 'text.secondary' }} />}
      <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.01em' }}>
        {children}
      </Typography>
    </Stack>
  );
}
