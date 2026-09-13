import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Chip, Typography, Alert, CircularProgress } from '@mui/material';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import SetupCardShell from '../../../../components/Assistant/cards/SetupCardShell';
import AppIcon from '../../../../components/icons/AppIcon';
import { fetchArenaStack } from '../../../../services/arenaService';
import { getMcpAppById } from '../../../../config/mcpToolCatalog';
import { initiateComposioConnection } from '../../../../services/composioService';

/**
 * Guide step 3 — connect what the quiz ticked. One row per covered tool; the
 * button opens the sign-in popup, and status is re-proven against the live
 * connection state when the popup closes (connect is initiate-only upstream,
 * so nothing here trusts its own optimism).
 *
 * Every connection is read-only evidence: Arena sees what was done and by
 * whom. It never changes anything in the connected tool.
 */
export default function ConnectStackCard({ onComplete, onSkip, embedded }) {
  const [rows, setRows] = useState([]);
  const [composioConfigured, setComposioConfigured] = useState(true);
  const [connecting, setConnecting] = useState(null); // key of the row mid-popup
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await fetchArenaStack();
      setRows((data.rows || []).filter((r) => r.source === 'catalog'));
      setComposioConfigured(!!data.composioConfigured);
    } catch (err) {
      setError(err.message || 'Could not read your stack');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleConnect = async (row) => {
    setConnecting(row.key);
    setError(null);
    try {
      const app = getMcpAppById(row.key)?.composioApp;
      if (!app) throw new Error(`${row.label} cannot connect by button`);
      const res = await initiateComposioConnection(app);
      if (res?.redirectUrl) {
        const popup = window.open(res.redirectUrl, 'arena-connect', 'width=600,height=700');
        // Re-prove status when the popup closes; the server reconciles against
        // the live connection list on every stack read.
        const timer = setInterval(async () => {
          if (!popup || popup.closed) {
            clearInterval(timer);
            await reload();
            setConnecting(null);
          }
        }, 1200);
      } else {
        await reload();
        setConnecting(null);
      }
    } catch (err) {
      setError(err.message || `Could not start connecting ${row.label}`);
      setConnecting(null);
    }
  };

  const connected = rows.filter((r) => r.status === 'connected').length;
  const allDone = rows.length > 0 && connected === rows.length;

  return (
    <SetupCardShell
      title="Connect what you ticked"
      embedded={embedded}
      primaryLabel={allDone ? 'All connected - continue' : 'Continue'}
      onPrimary={() => onComplete({ connect: true })}
      busy={false}
      onSkip={onSkip}
      error={error}
    >
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={22} />
        </Box>
      ) : !composioConfigured ? (
        <Alert severity="info">
          Connections are not switched on for this workspace yet, so nothing can connect by button
          today. Every tool you ticked will be handled in the next step instead - the guide still
          finishes.
        </Alert>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Nothing from the quiz needs connecting here. If you added your own tools, the next step
          takes care of them.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {rows.map((row) => (
            <Box key={row.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
                {row.label}
              </Typography>
              {row.status === 'connected' ? (
                <Chip
                  size="small"
                  color="success"
                  variant="outlined"
                  icon={<AppIcon name="CheckCircleRounded" fallback={CheckCircleRoundedIcon} />}
                  label="Connected"
                  sx={{ fontWeight: 700 }}
                />
              ) : (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={connecting === row.key}
                  onClick={() => handleConnect(row)}
                  startIcon={
                    connecting === row.key ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <AppIcon
                        name="LinkRounded"
                        fallback={LinkRoundedIcon}
                        sx={{ fontSize: 16 }}
                      />
                    )
                  }
                  sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                >
                  {connecting === row.key ? 'Waiting for sign-in' : 'Connect'}
                </Button>
              )}
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            Read-only: Arena sees what was done and by whom. It never changes anything in your
            tools. {connected} of {rows.length} connected.
          </Typography>
        </Box>
      )}
    </SetupCardShell>
  );
}
