/**
 * KBSourcesPanel - connect external sources to the Knowledge Base. Each source
 * connects by one method (resolved by precedence from the server capabilities):
 * OAuth (Dropbox / OneDrive), BYOK access token, or file import. Once a source
 * is connected the other methods are hidden. Backed by kbConnectionsService.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Stack,
  Typography,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  Chip,
  Tooltip,
  IconButton,
  CircularProgress,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  alpha,
} from '@mui/material';
import CloudSyncOutlinedIcon from '@mui/icons-material/CloudSyncOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import LinkOffOutlinedIcon from '@mui/icons-material/LinkOffOutlined';
import AddLinkOutlinedIcon from '@mui/icons-material/AddLinkOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import { siNotion, siObsidian, siGoogledrive, siDropbox, siMega } from 'simple-icons';

import AppIcon from '../icons/AppIcon';
import {
  listConnections,
  saveConnection,
  syncConnection,
  deleteConnection,
  authorizeOAuth,
} from '../../services/kbConnectionsService';
import { saveUserKey } from '../../services/userKeysService';
import { syncObsidian } from '../../services/assistantIngestService';

// OneDrive has no simple-icons brand mark (Microsoft glyphs were removed), so we
// render a cloud in the OneDrive brand blue as its official-color stand-in.
const ONEDRIVE_GLYPH = {
  title: 'OneDrive',
  hex: '0364B8',
  path: 'M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z',
};

// Each source carries its official brand mark (simple-icons, CC0) as an inline
// SVG - authentic + offline. `provider` is the BYOK vault key; `credKind` is how
// the inline credential dialog collects it ('token' | 'mega' | null=no BYOK).
const SOURCES = [
  {
    type: 'notion',
    label: 'Notion',
    desc: 'Sync your Notion pages into the KB, or use them live.',
    canLive: true,
    glyph: siNotion,
    tint: '#0EA5E9',
    glyphColor: 'text.primary',
    provider: 'data:notion',
    credKind: 'token',
  },
  {
    type: 'obsidian',
    label: 'Obsidian',
    desc: 'Import a .md vault export (download only - no cloud API).',
    canLive: false,
    glyph: siObsidian,
    tint: '#7C3AED',
    glyphColor: `#${siObsidian.hex}`,
    provider: null,
    credKind: null,
  },
  {
    type: 'google-drive',
    label: 'Google Drive',
    desc: 'Sync with a Google access token, or import exported files.',
    canLive: false,
    glyph: siGoogledrive,
    tint: '#4285F4',
    glyphColor: `#${siGoogledrive.hex}`,
    provider: 'data:google-drive',
    credKind: 'token',
  },
  {
    type: 'dropbox',
    label: 'Dropbox',
    desc: 'Connect Dropbox (OAuth or token) to sync files, or import them.',
    canLive: false,
    glyph: siDropbox,
    tint: `#${siDropbox.hex}`,
    glyphColor: `#${siDropbox.hex}`,
    provider: 'data:dropbox',
    credKind: 'token',
  },
  {
    type: 'onedrive',
    label: 'OneDrive',
    desc: 'Connect OneDrive (OAuth or token) to sync files, or import them.',
    canLive: false,
    glyph: ONEDRIVE_GLYPH,
    tint: `#${ONEDRIVE_GLYPH.hex}`,
    glyphColor: `#${ONEDRIVE_GLYPH.hex}`,
    provider: 'data:onedrive',
    credKind: 'token',
  },
  {
    type: 'mega',
    label: 'Mega',
    desc: 'Sign in to sync your end-to-end encrypted Mega files, or import them.',
    canLive: false,
    glyph: siMega,
    tint: `#${siMega.hex}`,
    glyphColor: `#${siMega.hex}`,
    provider: 'data:mega',
    credKind: 'mega',
  },
];

const SOURCE_BY_TYPE = Object.fromEntries(SOURCES.map((s) => [s.type, s]));

function whenText(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

// Resolve the single connect method to offer for an unconnected source.
function primaryMethod(cap) {
  const methods = cap?.methods || [];
  if (cap?.byokPresent && methods.includes('byok')) return 'byok-saved';
  if (methods.includes('oauth') && cap?.oauthConfigured) return 'oauth';
  if (methods.includes('byok')) return 'byok-add';
  return 'import';
}

export default function KBSourcesPanel() {
  const [connections, setConnections] = useState([]);
  const [capabilities, setCapabilities] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // source_type currently mutating
  const [snack, setSnack] = useState(null);
  const [credDialog, setCredDialog] = useState(null); // { source, token, email, password }
  const fileRef = useRef(null);
  const pendingImportConn = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { connections: conns, capabilities: caps } = await listConnections();
      setConnections(conns);
      setCapabilities(caps);
    } catch (err) {
      setSnack({ severity: 'error', message: err?.message || 'Failed to load sources' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byType = Object.fromEntries(connections.map((c) => [c.source_type, c]));

  const run = useCallback(
    async (type, fn, okMsg) => {
      setBusy(type);
      try {
        await fn();
        if (okMsg) setSnack({ severity: 'success', message: okMsg });
        await load();
      } catch (err) {
        setSnack({ severity: 'error', message: err?.message || 'Action failed' });
      } finally {
        setBusy(null);
      }
    },
    [load]
  );

  const connectByokSaved = (s) =>
    run(
      s.type,
      () =>
        saveConnection({
          source_type: s.type,
          mode: 'sync',
          credential_ref: { kind: 'byok', provider: s.provider },
        }),
      `${s.label} connected`
    );
  const connectImport = (s) =>
    run(
      s.type,
      () => saveConnection({ source_type: s.type, mode: 'sync', credential_ref: { kind: 'none' } }),
      `${s.label} ready - import your files`
    );
  const connectOauth = async (s) => {
    setBusy(s.type);
    try {
      const url = await authorizeOAuth(s.type);
      if (url)
        window.location.href = url; // leaves the page for the provider consent screen
      else setBusy(null);
    } catch (err) {
      setSnack({ severity: 'error', message: err?.message || 'Could not start OAuth' });
      setBusy(null);
    }
  };

  const openCred = (s) => setCredDialog({ source: s, token: '', email: '', password: '' });
  const submitCred = () => {
    const d = credDialog;
    if (!d) return;
    const s = d.source;
    const valid = s.credKind === 'mega' ? d.email.trim() && d.password : d.token.trim();
    if (!valid) return;
    const apiKey =
      s.credKind === 'mega'
        ? JSON.stringify({ email: d.email.trim(), password: d.password })
        : d.token.trim();
    setCredDialog(null);
    run(
      s.type,
      async () => {
        await saveUserKey({ provider: s.provider, apiKey, skipProbe: true });
        await saveConnection({
          source_type: s.type,
          mode: 'sync',
          credential_ref: { kind: 'byok', provider: s.provider },
        });
      },
      `${s.label} connected`
    );
  };

  const setMode = (conn, mode) =>
    run(conn.source_type, () =>
      saveConnection({ source_type: conn.source_type, slot: conn.slot, mode, label: conn.label })
    );
  const syncNow = (conn) =>
    run(conn.source_type, async () => {
      const { synced } = await syncConnection(conn.id);
      setSnack({ severity: 'success', message: `Synced ${synced ?? 0} item(s)` });
    });
  const disconnect = (conn) =>
    run(conn.source_type, () => deleteConnection(conn.id), 'Disconnected');
  const toggleAutoSync = (conn) =>
    run(conn.source_type, () =>
      saveConnection({
        source_type: conn.source_type,
        slot: conn.slot,
        mode: conn.mode,
        label: conn.label,
        sync_interval_secs: conn.sync_interval_secs ? null : 86400,
      })
    );

  const startImport = (conn) => {
    pendingImportConn.current = conn;
    fileRef.current?.click();
  };
  const onImportFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const conn = pendingImportConn.current;
    if (!files.length || !conn) return;
    run(conn.source_type, async () => {
      const notes = await Promise.all(
        files.map(async (f) => ({ path: f.webkitRelativePath || f.name, content: await f.text() }))
      );
      const { synced } = await syncObsidian(notes, conn.id, conn.source_type);
      setSnack({ severity: 'success', message: `Imported ${synced ?? 0} file(s)` });
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
        Connected sources
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Download brings files into the Knowledge Base. Live keeps them in the source and reads them
        over the connection when needed.
      </Typography>

      <input
        ref={fileRef}
        type="file"
        hidden
        multiple
        accept=".md,.markdown,.txt,.csv,.json,text/markdown,text/plain,text/csv,application/json"
        onChange={onImportFiles}
      />

      <Stack spacing={1.5}>
        {SOURCES.map((s) => {
          const conn = byType[s.type];
          const cap = capabilities[s.type] || {};
          const isBusy = busy === s.type;
          const color = s.tint;
          const primary = primaryMethod(cap);
          const canImport = (cap.methods || []).includes('import');
          const isImport = conn?.credential_ref?.kind === 'none';
          return (
            <Box
              key={s.type}
              sx={{
                p: { xs: 1.5, sm: 2 },
                borderRadius: 2.5,
                border: '1px solid',
                borderColor: alpha(color, conn ? 0.4 : 0.18),
                background: (t) =>
                  `linear-gradient(135deg, ${alpha(color, 0.05)} 0%, ${alpha(t.palette.background.paper, 0.98)} 70%)`,
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'stretch', sm: 'center' },
                gap: { xs: 1.25, sm: 1.5 },
                transition: 'border-color .2s, box-shadow .2s',
                '&:hover': {
                  borderColor: alpha(color, 0.45),
                  boxShadow: `0 0 6px ${alpha(color, 0.5)}, 0 0 10px ${alpha(color, 0.3)}`,
                },
              }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, flex: 1, minWidth: 0 }}
              >
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    bgcolor: alpha(color, 0.15),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Box
                    component="svg"
                    viewBox="0 0 24 24"
                    role="img"
                    aria-label={s.label}
                    sx={{ width: 22, height: 22, color: s.glyphColor, display: 'block' }}
                  >
                    <path d={s.glyph.path} fill="currentColor" />
                  </Box>
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.3 }}>
                    {s.label}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      lineHeight: 1.4,
                      mt: 0.25,
                    }}
                  >
                    {s.desc}
                  </Typography>
                  {conn && (conn.last_synced_at || conn.last_sync_error) && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          flexShrink: 0,
                          bgcolor: conn.last_sync_ok === false ? 'error.main' : 'success.main',
                        }}
                      />
                      <Typography
                        variant="caption"
                        sx={{
                          minWidth: 0,
                          color: conn.last_sync_ok === false ? 'error.main' : 'text.disabled',
                        }}
                      >
                        {conn.last_sync_ok === false
                          ? `Last sync failed: ${conn.last_sync_error}`
                          : `Last synced ${whenText(conn.last_synced_at)} · ${conn.docs_synced_count || 0} docs`}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>

              <Box
                sx={{
                  flexShrink: 0,
                  display: 'flex',
                  justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                  pt: { xs: 1.25, sm: 0 },
                  mt: { xs: 0.25, sm: 0 },
                  borderTop: { xs: '1px solid', sm: 'none' },
                  borderColor: 'divider',
                }}
              >
                {!conn ? (
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={isBusy}
                      startIcon={<AppIcon fallback={AddLinkOutlinedIcon} sx={{ fontSize: 16 }} />}
                      onClick={() =>
                        primary === 'oauth'
                          ? connectOauth(s)
                          : primary === 'byok-saved'
                            ? connectByokSaved(s)
                            : primary === 'byok-add'
                              ? openCred(s)
                              : connectImport(s)
                      }
                      sx={{ textTransform: 'none', borderRadius: 2 }}
                    >
                      Connect
                    </Button>
                    {canImport && primary !== 'import' && (
                      <Button
                        size="small"
                        variant="text"
                        disabled={isBusy}
                        onClick={() => connectImport(s)}
                        sx={{ textTransform: 'none', borderRadius: 2 }}
                      >
                        Import
                      </Button>
                    )}
                    {isBusy && <CircularProgress size={16} />}
                  </Stack>
                ) : (
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    {s.canLive && (
                      <ToggleButtonGroup
                        value={conn.mode}
                        exclusive
                        size="small"
                        onChange={(_, v) => v && v !== conn.mode && setMode(conn, v)}
                        aria-label={`${s.label} mode`}
                      >
                        <ToggleButton value="sync" aria-label="Download">
                          <Tooltip title="Download into the KB">
                            <AppIcon fallback={CloudSyncOutlinedIcon} sx={{ fontSize: 16 }} />
                          </Tooltip>
                        </ToggleButton>
                        <ToggleButton value="live" aria-label="Live">
                          <Tooltip title="Use over connection (live)">
                            <AppIcon fallback={BoltOutlinedIcon} sx={{ fontSize: 16 }} />
                          </Tooltip>
                        </ToggleButton>
                      </ToggleButtonGroup>
                    )}

                    {conn.mode === 'sync' &&
                      (isImport ? (
                        <Button
                          size="small"
                          variant="contained"
                          disabled={isBusy}
                          startIcon={
                            <AppIcon fallback={UploadFileOutlinedIcon} sx={{ fontSize: 16 }} />
                          }
                          onClick={() => startImport(conn)}
                          sx={{ textTransform: 'none', borderRadius: 2 }}
                        >
                          {s.type === 'obsidian' ? 'Import .md' : 'Import files'}
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={isBusy}
                            startIcon={<AppIcon fallback={AutorenewIcon} sx={{ fontSize: 16 }} />}
                            onClick={() => syncNow(conn)}
                            sx={{ textTransform: 'none', borderRadius: 2 }}
                          >
                            Sync now
                          </Button>
                          <Tooltip
                            title={
                              conn.sync_interval_secs
                                ? 'Auto-sync daily: on'
                                : 'Auto-sync daily: off'
                            }
                          >
                            <IconButton
                              size="small"
                              disabled={isBusy}
                              onClick={() => toggleAutoSync(conn)}
                            >
                              <AppIcon
                                fallback={ScheduleOutlinedIcon}
                                sx={{
                                  fontSize: 18,
                                  color: conn.sync_interval_secs
                                    ? 'primary.main'
                                    : 'text.secondary',
                                }}
                              />
                            </IconButton>
                          </Tooltip>
                        </>
                      ))}
                    {conn.mode === 'live' && <Chip label="Live" size="small" color="primary" />}

                    <Tooltip title="Disconnect">
                      <IconButton size="small" disabled={isBusy} onClick={() => disconnect(conn)}>
                        <AppIcon
                          fallback={LinkOffOutlinedIcon}
                          sx={{ fontSize: 18, color: 'text.secondary' }}
                        />
                      </IconButton>
                    </Tooltip>
                    {isBusy && <CircularProgress size={16} />}
                  </Stack>
                )}
              </Box>
            </Box>
          );
        })}
      </Stack>

      <Dialog
        open={Boolean(credDialog)}
        onClose={() => setCredDialog(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Connect {credDialog?.source?.label}</DialogTitle>
        <DialogContent>
          {credDialog?.source?.credKind === 'mega' ? (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Mega is end-to-end encrypted, so it needs your account login. Credentials are stored
                encrypted in the vault and used only to read your files.
              </Typography>
              <TextField
                label="Mega email"
                size="small"
                type="email"
                value={credDialog.email}
                onChange={(e) => setCredDialog((c) => ({ ...c, email: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Mega password"
                size="small"
                type="password"
                value={credDialog.password}
                onChange={(e) => setCredDialog((c) => ({ ...c, password: e.target.value }))}
                fullWidth
              />
            </Stack>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Paste a {credDialog?.source?.label} access token. It is stored encrypted in the
                vault.
              </Typography>
              <TextField
                label="Access token"
                size="small"
                value={credDialog?.token || ''}
                onChange={(e) => setCredDialog((c) => ({ ...c, token: e.target.value }))}
                fullWidth
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCredDialog(null)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submitCred} sx={{ textTransform: 'none' }}>
            Connect
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack ? (
          <Alert severity={snack.severity} variant="filled" onClose={() => setSnack(null)}>
            {snack.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

export { SOURCE_BY_TYPE };
