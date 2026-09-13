import { Dialog, Box, Typography, Button, IconButton, alpha, useTheme } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';

import AppIcon from '../icons/AppIcon';

/**
 * "Hire the Orqaly team" pop-up - the Welcome Guide "Hire US" quick action. Points the user at the
 * contact / talk-to-sales surface. Props: open, onClose, onTalkToSales.
 */
export default function HireUsDialog({ open, onClose, onTalkToSales }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: { sx: { borderRadius: 3, overflow: 'hidden' } },
        backdrop: { sx: { backdropFilter: 'blur(4px)', bgcolor: alpha('#000', 0.6) } },
      }}
    >
      <IconButton
        aria-label="Close"
        onClick={onClose}
        size="small"
        sx={{
          position: 'absolute',
          top: 10,
          right: 10,
          color: 'text.secondary',
          '&:hover': { color: 'text.primary', bgcolor: alpha(tint, 0.08) },
        }}
      >
        <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} fontSize="small" />
      </IconButton>
      <Box sx={{ p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            mx: 'auto',
            mb: 2,
            borderRadius: 2.5,
            bgcolor: alpha(tint, 0.15),
            color: tint,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AppIcon
            name="SupportAgentOutlined"
            fallback={SupportAgentOutlinedIcon}
            sx={{ fontSize: 28 }}
          />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
          Hire the Orqaly team
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, mb: 3 }}>
          Want us to set things up or build with you? Talk to our team and we will help you get the
          most out of Orqaly.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button
            onClick={onTalkToSales}
            variant="contained"
            endIcon={<AppIcon name="ArrowForwardRounded" fallback={ArrowForwardRoundedIcon} />}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 2,
              px: 2.5,
              boxShadow: `0 6px 18px ${alpha(tint, 0.3)}`,
            }}
          >
            Talk to sales
          </Button>
          <Button
            onClick={onClose}
            variant="text"
            sx={{ textTransform: 'none', fontWeight: 600, color: 'text.secondary' }}
          >
            Maybe later
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
