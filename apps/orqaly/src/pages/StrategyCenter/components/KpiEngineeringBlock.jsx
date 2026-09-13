import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Typography,
  Chip,
  Stack,
  alpha,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FunctionsOutlinedIcon from '@mui/icons-material/FunctionsOutlined';
import BentoCard from '../../../components/Common/BentoCard';

import AppIcon from '../../../components/icons/AppIcon';

export default function KpiEngineeringBlock({ data }) {
  const d = data || {};
  const kpis = d.kpis || [];
  const theme = useTheme();

  return (
    <BentoCard
      title="KPI Engineering"
      subtitle="Formula, drivers, sources, sensitivity, levers per KPI"
      icon={FunctionsOutlinedIcon}
      iconColor={theme.palette.info.main}
    >
      <Box>
        {kpis.map((kpi, idx) => (
          <Accordion
            key={idx}
            defaultExpanded={idx === 0}
            disableGutters
            sx={{
              '&:before': { display: 'none' },
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              mb: 1,
              '&.Mui-expanded': { mb: 1 },
            }}
          >
            <AccordionSummary
              expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
              sx={{ py: 0, minHeight: 52 }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{kpi.name}</Typography>
                {kpi.value != null && (
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                    Current:{' '}
                    {kpi.name.includes('ROI') || kpi.name.includes('CR')
                      ? `${kpi.value}%`
                      : kpi.name.includes('CAC')
                        ? `$${Number(kpi.value).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        : kpi.value}
                  </Typography>
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, pb: 2 }}>
              <Box
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  color: 'text.secondary',
                  mb: 1.5,
                  p: 1.25,
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  borderRadius: 1,
                }}
              >
                {kpi.formula}
              </Box>
              <Box sx={{ mb: 1.5 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
                >
                  Drivers
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
                  {(kpi.drivers || []).map((x, i) => (
                    <Chip
                      key={i}
                      size="small"
                      label={x}
                      variant="outlined"
                      sx={{ fontSize: '0.68rem', height: 20 }}
                    />
                  ))}
                </Stack>
              </Box>
              <Box sx={{ mb: 1.5 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
                >
                  Sources
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.7rem',
                    color: 'text.secondary',
                    mt: 0.5,
                  }}
                >
                  {(kpi.sources || []).join(', ')}
                </Typography>
              </Box>
              <Box sx={{ mb: 1.5 }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
                >
                  Sensitivity
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.8rem', mt: 0.5 }}>
                  {kpi.sensitivity}
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
                >
                  Levers
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
                  {(kpi.levers || []).map((x, i) => (
                    <Chip
                      key={i}
                      size="small"
                      label={x}
                      sx={{
                        fontSize: '0.68rem',
                        height: 20,
                        bgcolor: alpha(theme.palette.success.main, 0.12),
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    </BentoCard>
  );
}
