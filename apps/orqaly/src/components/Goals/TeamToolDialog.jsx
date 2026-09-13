/**
 * TeamToolDialog — Orb-style dialog asking the user for API keys.
 *
 * Displays the AiOrb at the top with a greeting, then lists each tool
 * that needs credentials. Preserves all original API functionality.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  Collapse,
  LinearProgress,
  Link,
  useTheme,
  alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import SendIcon from '@mui/icons-material/Send';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import KeyIcon from '@mui/icons-material/Key';
import AiOrb from '../VoiceControl/AiOrb';
import { supabase, hasSupabase } from '../../lib/supabase';

import AppIcon from '../icons/AppIcon';

// ── API helpers ──────────────────────────────────────────────────

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

async function fetchToolStatuses() {
  const res = await fetch(`${getBase()}/api/app?path=tool-setup`, {
    headers: await getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load tool statuses');
  return res.json();
}

async function saveToolCredential(toolId, apiKey) {
  const res = await fetch(`${getBase()}/api/app?path=tool-setup`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ toolId, apiKey }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || 'Failed to save');
  return data;
}

// ── Main component ──────────────────────────────────────────────

export default function TeamToolDialog({
  open,
  onClose,
  goalId,
  goalTitle,
  teamName = 'Your Team',
  agentName = 'Team Lead',
  agentRole = 'coordinator',
  toolIds = [],
  onAllConfigured,
  onSkip,
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTool, setActiveTool] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(null); // toolId just saved
  const contentRef = useRef(null);

  // Load tool statuses
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setActiveTool(null);
    setApiKeyInput('');
    setSaveSuccess(null);

    fetchToolStatuses()
      .then(({ tools: allTools }) => {
        const filtered =
          toolIds.length > 0 ? allTools.filter((t) => toolIds.includes(t.id)) : allTools;
        setTools(filtered);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, toolIds]);

  // Check if all configured
  const configuredCount = tools.filter(
    (t) => t.configured || t.connectionType === 'internal'
  ).length;
  const needsSetup = tools.filter((t) => !t.configured && t.connectionType !== 'internal');
  const allDone = tools.length > 0 && needsSetup.length === 0;

  useEffect(() => {
    if (allDone && open) onAllConfigured?.();
  }, [allDone, open, onAllConfigured]);

  const handleSetupTool = useCallback((tool) => {
    setActiveTool((prev) => (prev?.id === tool.id ? null : tool));
    setApiKeyInput('');
    setShowKey(false);
  }, []);

  const handleSaveKey = useCallback(async () => {
    if (!activeTool || !apiKeyInput.trim()) return;
    setSaving(true);
    try {
      await saveToolCredential(activeTool.id, apiKeyInput.trim());
      const savedId = activeTool.id;
      setTools((prev) => prev.map((t) => (t.id === savedId ? { ...t, configured: true } : t)));
      setSaveSuccess(savedId);
      setActiveTool(null);
      setApiKeyInput('');
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [activeTool, apiKeyInput]);

  // Orb state based on dialog state
  const orbState = loading ? 'searching' : allDone ? 'speaking' : saving ? 'listening' : 'idle';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 4,
            maxHeight: '85vh',
            overflow: 'hidden',
            background: isDark
              ? `linear-gradient(180deg, ${alpha(theme.palette.primary.dark, 0.15)} 0%, ${alpha('#0a0a0f', 0.98)} 30%)`
              : `linear-gradient(180deg, ${alpha(theme.palette.primary.light, 0.08)} 0%, ${alpha('#fff', 0.98)} 30%)`,
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, isDark ? 0.15 : 0.1),
          },
        },
      }}
    >
      {/* Close button */}
      <IconButton
        onClick={onClose}
        size="small"
        sx={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10,
          color: 'text.secondary',
          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) },
        }}
      >
        <AppIcon name="Close" fallback={CloseIcon} fontSize="small" />
      </IconButton>
      <DialogContent ref={contentRef} sx={{ pt: 4, pb: 1, px: 3, overflow: 'auto' }}>
        {/* ── Orb + Greeting ── */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            mb: 3,
            mt: 1,
          }}
        >
          <AiOrb state={orbState} size={100} disableFloat={loading} />

          <Typography
            variant="h6"
            sx={{
              mt: 2.5,
              fontWeight: 700,
              fontSize: '1.05rem',
              textAlign: 'center',
              background: isDark
                ? `linear-gradient(135deg, ${theme.palette.primary.light}, ${theme.palette.common.white})`
                : `linear-gradient(135deg, ${theme.palette.primary.dark}, ${theme.palette.text.primary})`,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {allDone
              ? 'All set — ready to execute!'
              : loading
                ? 'Loading tools...'
                : 'I need a few API keys'}
          </Typography>

          {goalTitle && !loading && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 0.5,
                fontSize: '0.8rem',
                textAlign: 'center',
                maxWidth: 360,
              }}
            >
              For &ldquo;{goalTitle}&rdquo;
            </Typography>
          )}

          {!loading && !allDone && needsSetup.length > 0 && (
            <>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mt: 1,
                  fontSize: '0.78rem',
                  textAlign: 'center',
                  maxWidth: 380,
                  lineHeight: 1.5,
                }}
              >
                Connect{' '}
                {needsSetup.length === 1 ? 'this service' : `these ${needsSetup.length} services`}{' '}
                so {teamName} can get to work. You can also skip and proceed with limited
                capabilities.
              </Typography>
              <Alert
                severity="info"
                sx={{ mt: 1.5, maxWidth: 420, fontSize: '0.75rem', textAlign: 'left' }}
              >
                Add keys manually below. Automatic account creation is unavailable.
              </Alert>
            </>
          )}
        </Box>

        {/* ── Loading ── */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} sx={{ color: 'primary.light' }} />
          </Box>
        )}

        {/* ── Error ── */}
        {error && (
          <Alert
            severity="error"
            onClose={() => setError(null)}
            sx={{ mb: 2, fontSize: '0.78rem', borderRadius: 2 }}
          >
            {error}
          </Alert>
        )}

        {/* ── Tool cards ── */}
        {!loading && !error && tools.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {tools.map((tool) => {
              const isConfigured = tool.configured || tool.connectionType === 'internal';
              const isActive = activeTool?.id === tool.id;
              const justSaved = saveSuccess === tool.id;

              return (
                <Box
                  key={tool.id}
                  sx={{
                    borderRadius: 2.5,
                    border: '1px solid',
                    borderColor: justSaved
                      ? alpha(theme.palette.success.main, 0.4)
                      : isActive
                        ? alpha(theme.palette.primary.main, 0.3)
                        : alpha(theme.palette.divider, isDark ? 0.4 : 0.8),
                    bgcolor: isActive
                      ? alpha(theme.palette.primary.main, isDark ? 0.06 : 0.03)
                      : justSaved
                        ? alpha(theme.palette.success.main, 0.04)
                        : 'transparent',
                    transition: 'all 0.2s ease',
                    overflow: 'hidden',
                  }}
                >
                  {/* Tool row */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 2,
                      py: 1.5,
                    }}
                  >
                    {/* Status dot */}
                    {isConfigured || justSaved ? (
                      <AppIcon
                        name="CheckCircle"
                        fallback={CheckCircleIcon}
                        sx={{ color: 'success.main', fontSize: 20, flexShrink: 0 }}
                      />
                    ) : (
                      <AppIcon
                        name="RadioButtonUnchecked"
                        fallback={RadioButtonUncheckedIcon}
                        sx={{ color: 'text.disabled', fontSize: 20, flexShrink: 0 }}
                      />
                    )}

                    {/* Tool info */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.84rem' }}>
                        {tool.name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontSize: '0.7rem' }}
                      >
                        {tool.connectionType === 'internal'
                          ? 'Built-in'
                          : isConfigured
                            ? 'Connected'
                            : tool.description?.slice(0, 70) || 'Needs API key'}
                      </Typography>
                    </Box>

                    {/* Credential setup is deliberately manual. */}
                    {!isConfigured && (
                      <Button
                        size="small"
                        variant={isActive ? 'contained' : 'outlined'}
                        startIcon={
                          <AppIcon
                            name="Key"
                            fallback={KeyIcon}
                            sx={{ fontSize: '14px !important' }}
                          />
                        }
                        onClick={() => handleSetupTool(tool)}
                        sx={{
                          minWidth: 0,
                          px: 1.5,
                          py: 0.3,
                          flexShrink: 0,
                          textTransform: 'none',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          borderRadius: 2,
                        }}
                      >
                        Add key
                      </Button>
                    )}
                  </Box>
                  {/* Expandable key input */}
                  <Collapse in={isActive}>
                    <Box
                      sx={{
                        px: 2,
                        pb: 2,
                        pt: 0.5,
                        borderTop: '1px solid',
                        borderColor: alpha(theme.palette.divider, 0.3),
                      }}
                    >
                      {tool.credentials?.length > 0 && (
                        <Box sx={{ mb: 1 }}>
                          {tool.credentials.map((cred) => (
                            <Box key={cred.key}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ fontSize: '0.7rem' }}
                              >
                                {cred.helpText}
                              </Typography>
                              {cred.helpUrl && (
                                <Link
                                  href={cred.helpUrl}
                                  target="_blank"
                                  rel="noopener"
                                  variant="caption"
                                  sx={{ ml: 0.5, fontSize: '0.7rem' }}
                                >
                                  Get key
                                </Link>
                              )}
                            </Box>
                          ))}
                        </Box>
                      )}
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        <TextField
                          fullWidth
                          size="small"
                          type={showKey ? 'text' : 'password'}
                          placeholder="Paste your API key"
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && apiKeyInput.trim()) handleSaveKey();
                          }}
                          disabled={saving}
                          autoFocus
                          slotProps={{
                            input: {
                              sx: {
                                fontSize: '0.8rem',
                                borderRadius: 2,
                                pr: 0.5,
                                bgcolor: alpha(theme.palette.background.default, 0.5),
                              },
                              endAdornment: (
                                <IconButton size="small" onClick={() => setShowKey((v) => !v)}>
                                  {showKey ? (
                                    <AppIcon
                                      name="VisibilityOff"
                                      fallback={VisibilityOffIcon}
                                      sx={{ fontSize: 16 }}
                                    />
                                  ) : (
                                    <AppIcon
                                      name="Visibility"
                                      fallback={VisibilityIcon}
                                      sx={{ fontSize: 16 }}
                                    />
                                  )}
                                </IconButton>
                              ),
                            },
                          }}
                        />
                        <IconButton
                          color="primary"
                          onClick={handleSaveKey}
                          disabled={saving || !apiKeyInput.trim()}
                          size="small"
                          sx={{
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.2) },
                          }}
                        >
                          {saving ? (
                            <CircularProgress size={16} />
                          ) : (
                            <AppIcon name="Send" fallback={SendIcon} sx={{ fontSize: 18 }} />
                          )}
                        </IconButton>
                      </Box>
                    </Box>
                  </Collapse>
                </Box>
              );
            })}

            {/* Progress bar */}
            {needsSetup.length > 0 && (
              <Box sx={{ mt: 0.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                    {configuredCount} of {tools.length} connected
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                    {needsSetup.length} remaining
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={(configuredCount / tools.length) * 100}
                  sx={{
                    borderRadius: 1,
                    height: 4,
                    bgcolor: alpha(theme.palette.primary.main, 0.08),
                  }}
                />
              </Box>
            )}

            {/* All done */}
            {allDone && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  py: 1.5,
                  px: 2,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.success.main, 0.06),
                  border: '1px solid',
                  borderColor: alpha(theme.palette.success.main, 0.2),
                }}
              >
                <AppIcon
                  name="CheckCircle"
                  fallback={CheckCircleIcon}
                  sx={{ color: 'success.main', fontSize: 20 }}
                />
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, color: 'success.main', fontSize: '0.82rem' }}
                >
                  All services connected — {teamName} is ready!
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      {/* ── Footer ── */}
      <DialogActions
        sx={{
          px: 3,
          py: 2,
          borderTop: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.3),
          justifyContent: allDone ? 'center' : 'space-between',
        }}
      >
        {allDone ? (
          <Button
            variant="contained"
            onClick={onClose}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.82rem',
              borderRadius: 2.5,
              px: 4,
            }}
          >
            Continue
          </Button>
        ) : (
          <>
            <Button
              onClick={onSkip || onClose}
              sx={{ textTransform: 'none', fontSize: '0.78rem', color: 'text.secondary' }}
            >
              Skip for now
            </Button>
            <Chip
              label={`${needsSetup.length} ${needsSetup.length === 1 ? 'service' : 'services'} needed`}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.68rem', fontWeight: 500 }}
            />
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
