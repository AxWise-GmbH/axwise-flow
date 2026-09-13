/**
 * [module: design-system + connection-hub]
 * StrangersTab - admin-only view of unknown Telegram users who DM'd the bot.
 * Threshold alerts fire when >5 distinct strangers appear in 1h.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Snackbar,
  useTheme,
  alpha,
  useMediaQuery,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import { getStrangers, ignoreStranger, getUserRole } from '../../../services/communicatorService';
import PaneStatusStrip from '../components/PaneStatusStrip';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';

import AppIcon from '../../../components/icons/AppIcon';

export default function StrangersTab() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [role, setRole] = useState(null);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    getUserRole()
      .then(setRole)
      .catch(() => setRole('member'));
  }, []);

  async function reload() {
    setErr('');
    setRows(null);
    try {
      setRows(await getStrangers());
    } catch (e) {
      setErr(e.message);
      setRows([]);
    }
  }

  useEffect(() => {
    if (role === 'admin') reload();
  }, [role]);

  async function ignore(r) {
    if (!confirm('Remove this stranger record? They can DM again and will be re-logged.')) return;
    try {
      await ignoreStranger(r.id);
      setRows((cur) => cur.filter((x) => x.id !== r.id));
      setToast('✓ Removed');
    } catch (e) {
      setToast(`✕ ${e.message}`);
    }
  }

  if (role === null) {
    return (
      <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (role !== 'admin') {
    return (
      <Box
        sx={{
          py: 5,
          px: 2,
          textAlign: 'center',
          borderRadius: 3,
          bgcolor: alpha(theme.palette.warning.main, 0.06),
          border: '1px solid',
          borderColor: alpha(theme.palette.warning.main, 0.2),
        }}
      >
        <AppIcon
          name="LockOutlined"
          fallback={LockOutlinedIcon}
          sx={{ fontSize: 32, color: 'warning.main', mb: 1 }}
        />
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.92rem', mb: 0.5 }}>
          Admin only
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', display: 'block', fontSize: '0.78rem' }}
        >
          This view shows unknown Telegram users probing the bot - only admins can see it.
        </Typography>
      </Box>
    );
  }

  // Threshold alert summary
  const recentHour = (rows || []).filter(
    (r) => Date.now() - new Date(r.first_seen_at).getTime() < 3600_000
  );
  const today = (rows || []).filter((r) => {
    const d = new Date(r.first_seen_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  const totalAttempts = (rows || []).reduce((a, r) => a + (Number(r.attempt_count) || 0), 0);

  return (
    <Box>
      <PaneStatusStrip
        stats={[
          {
            value: today.length,
            label: 'New today',
            color: today.length > 0 ? 'warning' : 'neutral',
            icon: PersonOffOutlinedIcon,
          },
          {
            value: recentHour.length,
            label: 'Last hour',
            color: recentHour.length >= 5 ? 'danger' : 'neutral',
            icon: AccessTimeOutlinedIcon,
          },
          {
            value: totalAttempts,
            label: 'Total attempts',
            color: 'info',
            icon: BarChartOutlinedIcon,
          },
        ]}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.92rem', flex: 1 }}>
          Stranger DMs
        </Typography>
        {recentHour.length >= 5 && (
          <Chip
            size="small"
            color="warning"
            variant="filled"
            label={`⚠️ ${recentHour.length} in last hour`}
            sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700 }}
          />
        )}
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={reload}>
            <AppIcon name="Refresh" fallback={RefreshIcon} sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
      {err && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 1.5 }}>
          {err}
        </Alert>
      )}
      {rows === null && (
        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={24} />
        </Box>
      )}
      {rows?.length === 0 && (
        <Box
          sx={{
            py: 5,
            px: 2,
            textAlign: 'center',
            borderRadius: 3,
            bgcolor: alpha(theme.palette.success.main, 0.04),
            border: '1px dashed',
            borderColor: 'divider',
          }}
        >
          <AppIcon
            name="PersonOffOutlined"
            fallback={PersonOffOutlinedIcon}
            sx={{ fontSize: 28, color: 'text.disabled', mb: 1 }}
          />
          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.88rem', mb: 0.5 }}>
            No stranger DMs
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', display: 'block', fontSize: '0.76rem' }}
          >
            The bot only logs Telegram users who message it without being linked. None so far - your
            bot's allowlist is doing its job.
          </Typography>
        </Box>
      )}
      {rows?.length > 0 &&
        (isMobile ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {rows.map((r) => (
              <StrangerCard key={r.id} row={r} onIgnore={() => ignore(r)} />
            ))}
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2.5 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>User</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Telegram ID</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>First message</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }} align="right">
                    Attempts
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>First seen</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.72rem' }}>Last seen</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.72rem' }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ fontSize: '0.78rem' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 600 }}>
                          {r.first_name || ''} {r.last_name || ''}
                        </Typography>
                        {r.telegram_username && (
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', fontSize: '0.68rem' }}
                          >
                            @{r.telegram_username}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'text.secondary' }}
                    >
                      {r.telegram_user_id}
                    </TableCell>
                    <TableCell
                      sx={{
                        fontSize: '0.72rem',
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.first_message || '(empty)'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.78rem', fontWeight: 600 }}>
                      {r.attempt_count}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                      {fmtDate(r.first_seen_at)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                      {fmtDate(r.last_seen_at)}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Remove record">
                        <IconButton
                          size="small"
                          onClick={() => ignore(r)}
                          sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                        >
                          <AppIcon
                            name="DeleteOutline"
                            fallback={DeleteOutlineIcon}
                            sx={{ fontSize: 16 }}
                          />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ))}
      <Snackbar
        open={!!toast}
        autoHideDuration={1800}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}

function StrangerCard({ row, onIgnore }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
            {row.first_name || ''} {row.last_name || ''}
            {row.telegram_username && (
              <Typography
                component="span"
                variant="caption"
                sx={{ color: 'text.secondary', ml: 1 }}
              >
                @{row.telegram_username}
              </Typography>
            )}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', display: 'block', fontSize: '0.7rem' }}
          >
            {row.attempt_count} attempt{row.attempt_count === 1 ? '' : 's'} · last{' '}
            {fmtDate(row.last_seen_at)}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              display: 'block',
              fontSize: '0.7rem',
              fontStyle: 'italic',
              mt: 0.5,
            }}
          >
            "{(row.first_message || '').slice(0, 80)}"
          </Typography>
        </Box>
        <IconButton
          size="small"
          onClick={onIgnore}
          sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
        >
          <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    </Paper>
  );
}

function fmtDate(s) {
  if (!s) return '-';
  return new Date(s).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
