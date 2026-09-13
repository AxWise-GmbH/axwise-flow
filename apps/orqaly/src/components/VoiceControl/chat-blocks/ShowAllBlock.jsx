import { Box, Button, alpha, useTheme } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';

import AppIcon from '../../icons/AppIcon';

export default function ShowAllBlock({ block, onOpen }) {
  const theme = useTheme();
  const c = block.compact || {};
  const { main, light } = theme.palette.primary;

  const handle = () => {
    if (typeof onOpen === 'function' && c.route) {
      onOpen({ type: 'route', deepLink: c.route, route: c.route });
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
      <Button
        size="small"
        endIcon={
          <AppIcon
            name="ArrowForwardRounded"
            fallback={ArrowForwardRoundedIcon}
            sx={{ fontSize: 14 }}
          />
        }
        onClick={handle}
        sx={{
          fontSize: '0.75rem',
          color: light,
          textTransform: 'none',
          fontWeight: 600,
          py: 0.5,
          px: 1.5,
          border: '1px solid',
          borderColor: alpha(main, 0.25),
          borderRadius: 1.5,
          '&:hover': { bgcolor: alpha(main, 0.1), borderColor: alpha(main, 0.4) },
        }}
      >
        {c.label || 'Show all'}
      </Button>
    </Box>
  );
}
