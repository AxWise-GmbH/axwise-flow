import { Box, Typography, Paper, alpha, useTheme } from '@mui/material';
import SummarizeOutlinedIcon from '@mui/icons-material/SummarizeOutlined';
import BentoCard from '../../../components/Common/BentoCard';

export default function ExecutiveSummaryBlock({ data }) {
  const d = data || {};
  const theme = useTheme();

  return (
    <BentoCard
      title="Executive Summary"
      subtitle="Bottleneck, leverage KPI, predicted upside, AI value proposition"
      icon={SummarizeOutlinedIcon}
      iconColor={theme.palette.primary.main}
    >
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          borderRadius: 3,
          border: '2px solid',
          borderColor: alpha(theme.palette.primary.main, 0.35),
          backgroundImage: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 60%)`,
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            width: 4,
            height: '100%',
            bgcolor: theme.palette.primary.main,
            borderRadius: '3px 0 0 3px',
          },
        }}
      >
        <Box sx={{ pl: 0.5 }}>
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}
            >
              Bottleneck
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, mt: 0.5 }}>
              {d.bottleneck}
            </Typography>
          </Box>
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}
            >
              Leverage KPI
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, mt: 0.5 }}>
              {d.leverageKpi}
            </Typography>
          </Box>
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}
            >
              Predicted Upside
            </Typography>
            <Typography variant="body1" sx={{ mt: 0.5 }}>
              {d.predictedUpside}
            </Typography>
          </Box>
          <Box>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase' }}
            >
              AI Value Proposition
            </Typography>
            <Typography variant="body1" sx={{ mt: 0.5, fontWeight: 500 }}>
              {d.valueProposition}
            </Typography>
          </Box>
        </Box>
      </Paper>
    </BentoCard>
  );
}
