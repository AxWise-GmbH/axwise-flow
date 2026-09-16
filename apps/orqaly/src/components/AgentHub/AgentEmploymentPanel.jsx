import { Box, Typography, Chip, Paper, Stack, CircularProgress } from '@mui/material';
import WorkOutlineOutlinedIcon from '@mui/icons-material/WorkOutlineOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import LinkIcon from '@mui/icons-material/Link';

import AppIcon from '../icons/AppIcon';

/** ISO timestamp -> "dd.mm.yy" (locale-independent), or "—" when missing. */
export function fmtEmploymentDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;
}

/**
 * Where an agent is "hired": the organizations it's assigned to (with the
 * consilium governing each and the assignment start date) and the teams it's
 * on. Shared by the Agent Hub popup and the Marketplace agent dialog so both
 * render identically. Reads no data itself — caller passes the resolved
 * employment from agentEmploymentService.
 *
 * @param {{ employment: { orgs: [], teams: [] }, loading?: boolean }} props
 */
export default function AgentEmploymentPanel({
  employment = { orgs: [], teams: [] },
  loading = false,
}) {
  const orgs = employment?.orgs || [];
  const teams = employment?.teams || [];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
        <CircularProgress size={26} />
      </Box>
    );
  }

  if (orgs.length === 0 && teams.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 5 }}>
        <AppIcon
          name="WorkOutlineOutlined"
          fallback={WorkOutlineOutlinedIcon}
          sx={{ fontSize: 38, color: 'text.disabled', mb: 1 }}
        />
        <Typography variant="body2" color="text.secondary">
          Not assigned to any organization yet.
        </Typography>
      </Box>
    );
  }

  return (
    <>
      {orgs.length > 0 && (
        <>
          <Typography
            variant="overline"
            sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: '0.08em' }}
          >
            Organizations
          </Typography>
          <Stack spacing={1} sx={{ mt: 1, mb: teams.length ? 2.5 : 0 }}>
            {orgs.map((o) => (
              <Paper
                key={`${o.org_id}-${o.assigned_at}`}
                elevation={0}
                sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                  <AppIcon
                    name="BusinessOutlined"
                    fallback={BusinessOutlinedIcon}
                    sx={{ fontSize: 18, color: 'primary.main' }}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {o.org_name}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    flexWrap: 'wrap',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <AppIcon
                      name="Link"
                      fallback={LinkIcon}
                      sx={{ fontSize: 14, color: 'text.disabled' }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      Consilium:
                    </Typography>
                    {o.consilium_name ? (
                      <Chip
                        label={o.consilium_name}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.disabled">
                        No board
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Assigned {fmtEmploymentDate(o.assigned_at)}
                  </Typography>
                </Box>
              </Paper>
            ))}
          </Stack>
        </>
      )}
      {teams.length > 0 && (
        <>
          <Typography
            variant="overline"
            sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: '0.08em' }}
          >
            Teams
          </Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {teams.map((t) => (
              <Paper
                key={t.team_id}
                elevation={0}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  flexWrap: 'wrap',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t.team_name}
                  </Typography>
                  <Chip
                    label={t.role}
                    size="small"
                    sx={{ height: 20, fontSize: '0.62rem', textTransform: 'capitalize' }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Joined {fmtEmploymentDate(t.joined_at)}
                </Typography>
              </Paper>
            ))}
          </Stack>
        </>
      )}
    </>
  );
}
