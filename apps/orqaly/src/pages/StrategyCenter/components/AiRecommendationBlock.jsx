import { Box, Typography, Paper, Stack, alpha, useTheme } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import BentoCard from '../../../components/Common/BentoCard';

export default function AiRecommendationBlock({ data }) {
  const d = data || {};
  const theme = useTheme();

  return (
    <BentoCard
      title="AI Service Recommendation"
      subtitle="Architecture, integrations, models, dashboard, ROI estimate"
      icon={SmartToyOutlinedIcon}
      iconColor={theme.palette.secondary.main}
    >
      <Stack spacing={2}>
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.primary.main, 0.06),
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
          >
            Architecture
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {d.architecture}
          </Typography>
        </Paper>
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.info.main, 0.06),
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
          >
            Integrations
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {(d.integrations || []).join(' · ')}
          </Typography>
        </Paper>
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha(theme.palette.success.main, 0.06),
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
          >
            Models
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {(d.models || []).join(' · ')}
          </Typography>
        </Paper>
        <Paper
          elevation={0}
          sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
          >
            Dashboard Design
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {d.dashboardDesign}
          </Typography>
        </Paper>
        <Paper
          elevation={0}
          sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
          >
            Automation Potential
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {d.automationPotential}
          </Typography>
        </Paper>
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '2px solid',
            borderColor: alpha(theme.palette.success.main, 0.4),
            bgcolor: alpha(theme.palette.success.main, 0.1),
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
          >
            ROI Estimate
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>
            {d.roiEstimate}
          </Typography>
        </Paper>
      </Stack>
    </BentoCard>
  );
}
