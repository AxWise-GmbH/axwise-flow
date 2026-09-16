import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Paper,
  Button,
  CircularProgress,
  Chip,
  useTheme,
  alpha,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { fetchAxwiseHealth, fetchAxwiseImpact } from '../../services/axwiseAnalyticsService';

function Kpi({ label, value, hint, tone }) {
  const theme = useTheme();
  const color = tone ? theme.palette[tone]?.main : theme.palette.text.primary;
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 3,
        flex: '1 1 160px',
        minWidth: 160,
        bgcolor: alpha(theme.palette.primary.main, 0.03),
      }}
    >
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, color }}>
        {value}
      </Typography>
      {hint && (
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          {hint}
        </Typography>
      )}
    </Paper>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 800 }}>
        {children}
      </Typography>
      {sub && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

export default function AxwiseAnalytics() {
  const theme = useTheme();
  const [health, setHealth] = useState(null);
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, i] = await Promise.all([
        fetchAxwiseHealth({ forceRefresh: true }),
        fetchAxwiseImpact({ forceRefresh: true }),
      ]);
      setHealth(h);
      setImpact(i);
    } catch (err) {
      setError(err?.message || 'Failed to load AxWise analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = health?.totals || {};
  const calls = totals.calls || 0;
  const errorCalls = totals.errorCalls || 0;
  const degradedPct = calls > 0 ? Math.round((errorCalls / calls) * 100) : 0;
  const imp = impact?.totals || {};

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900 }}>
            AxWise analytics
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Is the AxWise cognition layer healthy, and is it changing decisions vs. the local
            heuristics it replaced?
          </Typography>
        </Box>
        <Button
          onClick={load}
          startIcon={<RefreshRoundedIcon />}
          disabled={loading}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Refresh
        </Button>
      </Stack>

      {loading && (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      )}

      {error && !loading && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, borderColor: 'error.main' }}>
          <Typography color="error">{error}</Typography>
        </Paper>
      )}

      {!loading && !error && (
        <Stack spacing={3}>
          {/* Health */}
          <Stack spacing={1.5}>
            <SectionTitle sub="Operational: is it running without breaking?">Health</SectionTitle>
            {calls === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                No AxWise calls recorded in this range yet.
              </Typography>
            ) : (
              <Stack direction="row" flexWrap="wrap" gap={1.5}>
                <Kpi label="Calls" value={calls} />
                <Kpi
                  label="Degraded"
                  value={`${degradedPct}%`}
                  hint={`${errorCalls} of ${calls}`}
                  tone={degradedPct > 0 ? 'warning' : 'success'}
                />
                <Kpi label="Avg latency" value={`${Math.round(totals.avgDurationMs || 0)}ms`} />
                <Kpi label="p95 latency" value={`${Math.round(totals.p95DurationMs || 0)}ms`} />
                <Kpi label="Cost" value={`$${Number(totals.cost || 0).toFixed(3)}`} />
              </Stack>
            )}
          </Stack>

          {/* Impact */}
          <Stack spacing={1.5}>
            <SectionTitle sub="Impact: how often AxWise decides differently than the local heuristic.">
              Decision impact
            </SectionTitle>
            {(imp.paired || 0) === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                No paired decisions yet. Impact appears once agent generation or copilot chats run
                with AxWise enabled (both an AxWise and a local verdict get recorded). Empty is
                expected right after enabling.
              </Typography>
            ) : (
              <>
                <Stack direction="row" flexWrap="wrap" gap={1.5}>
                  <Kpi label="Paired decisions" value={imp.paired} hint="both verdicts present" />
                  <Kpi
                    label="AxWise stricter"
                    value={imp.axStricter}
                    hint="blocked where local allowed"
                    tone={imp.axStricter > 0 ? 'warning' : undefined}
                  />
                  <Kpi
                    label="Local stricter"
                    value={imp.localStricter}
                    hint="local flagged, AxWise allowed"
                    tone={imp.localStricter > 0 ? 'warning' : undefined}
                  />
                  <Kpi label="Agree" value={imp.agree} tone="success" />
                </Stack>

                {Array.isArray(impact?.byOperation) && impact.byOperation.length > 0 && (
                  <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
                    {impact.byOperation.map((op) => (
                      <Stack
                        key={op.operation}
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        sx={{
                          px: 2,
                          py: 1.25,
                          '&:not(:last-of-type)': {
                            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                          },
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
                          {op.operation}
                        </Typography>
                        <Chip size="small" label={`${op.calls} calls`} />
                        {op.axStricter > 0 && (
                          <Chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            label={`AxWise +${op.axStricter}`}
                          />
                        )}
                        {op.localStricter > 0 && (
                          <Chip
                            size="small"
                            color="warning"
                            variant="outlined"
                            label={`local +${op.localStricter}`}
                          />
                        )}
                        {op.degraded > 0 && (
                          <Chip
                            size="small"
                            color="error"
                            variant="outlined"
                            label={`${op.degraded} degraded`}
                          />
                        )}
                      </Stack>
                    ))}
                  </Paper>
                )}
              </>
            )}
          </Stack>
        </Stack>
      )}
    </Box>
  );
}
