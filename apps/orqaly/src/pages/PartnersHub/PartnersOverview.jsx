import { useEffect, useState } from 'react';
import { Box, Grid, Paper, Typography, alpha, useTheme, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { listEntities } from '../../services/partnerEntityService';
import { formatMetricValue } from './utils/fieldFormat';
import { entityTypeIcon } from './utils/entityIcons';

/**
 * Cross-type rollup: one card per entity type with its headline metrics,
 * linking through to that type's list page.
 */
export default function PartnersOverview({ types = [] }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const [byType, setByType] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const entries = await Promise.all(
        types.map(async (t) => {
          try {
            const res = await listEntities(t.type_key, {});
            return [t.type_key, res.metrics || []];
          } catch {
            return [t.type_key, []];
          }
        })
      );
      if (alive) {
        setByType(Object.fromEntries(entries));
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [types]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 1.25, sm: 1.5 }, py: 1 }}>
      <Grid container spacing={2}>
        {types.map((t) => {
          const color = t.color || theme.palette.primary.main;
          const Icon = entityTypeIcon(t.icon);
          const metrics = byType[t.type_key] || [];
          return (
            <Grid key={t.type_key} size={{ xs: 12, sm: 6, md: 6, lg: 3 }}>
              <Paper
                elevation={0}
                onClick={() => navigate(`/partners-hub/${t.type_key}`)}
                sx={{
                  p: 2,
                  height: '100%',
                  cursor: 'pointer',
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: alpha(color, 0.22),
                  transition: 'transform .15s, border-color .15s',
                  '&:hover': { transform: 'translateY(-2px)', borderColor: color },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
                  {Icon && (
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 2,
                        bgcolor: alpha(color, 0.16),
                        color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon sx={{ fontSize: 20 }} />
                    </Box>
                  )}
                  <Typography sx={{ fontWeight: 700, color }}>{t.label}</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, minHeight: 36 }}>
                  {t.description}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {metrics.slice(0, 3).map((m) => (
                    <Box key={m.key} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">
                        {m.label}
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {formatMetricValue(m.format, m.value)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
