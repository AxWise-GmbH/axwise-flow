import { Box, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import AppIcon from '../../../components/icons/AppIcon';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

/** Tinted callout box with a leading icon - for tips, notes, and warnings. */
export default function DocCallout({ children, color, icon = InfoOutlinedIcon }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const c = color || theme.palette.info?.main || theme.palette.primary.main;
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        bgcolor: alpha(c, isDark ? 0.06 : 0.03),
        border: '1px solid',
        borderColor: alpha(c, 0.2),
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        component="div"
        sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, lineHeight: 1.6 }}
      >
        <AppIcon fallback={icon} sx={{ fontSize: 15, mt: 0.2, color: c, flexShrink: 0 }} />
        <span>{children}</span>
      </Typography>
    </Box>
  );
}
