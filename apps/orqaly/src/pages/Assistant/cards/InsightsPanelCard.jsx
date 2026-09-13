import { Box, Typography, Button, useTheme } from '@mui/material';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import BentoCard from '../../../components/Common/BentoCard';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';

import AppIcon from '../../../components/icons/AppIcon';

/** Insight generation entry point (Phase 1: opens the Insights setup step). */
export default function InsightsPanelCard({ insights, onGenerate }) {
  const theme = useTheme();
  return (
    <BentoCard title="Insights" icon={AutoAwesomeRoundedIcon} plainHeader scrollBody>
      <Typography variant="body2" color="text.secondary">
        {insights.description}
      </Typography>
      <Button
        onClick={onGenerate}
        startIcon={<AppIcon name="AutoAwesomeRounded" fallback={AutoAwesomeRoundedIcon} />}
        variant="contained"
        disableElevation
        sx={{
          mt: 2,
          alignSelf: 'stretch',
          textTransform: 'none',
          fontWeight: 800,
          borderRadius: 2,
          py: 1.1,
          bgcolor: 'primary.main',
          color: theme.palette.getContrastText(theme.palette.primary.main),
          boxShadow: createHoverGlowShadow(theme),
          '&:hover': { bgcolor: 'primary.dark', boxShadow: createHoverGlowShadow(theme) },
        }}
      >
        Generate insights
      </Button>
      <Box
        sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}
      >
        <AppIcon name="LockOutlined" fallback={LockOutlinedIcon} sx={{ fontSize: 14 }} />
        <Typography variant="caption">{insights.privateNote}</Typography>
      </Box>
    </BentoCard>
  );
}
