/**
 * ToolSetupChat — Guided dialog for configuring team tool credentials.
 *
 * Shows a chat-style interface that walks the user through setting up
 * API credentials for each tool in a team. Tests credentials before saving.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Link,
  useTheme,
  alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import BuildIcon from '@mui/icons-material/Build';
import SendIcon from '@mui/icons-material/Send';
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
  if (!res.ok) throw new Error(data.error || data.message || 'Failed to save credential');
  return data;
}

// ── Status icon helper ───────────────────────────────────────────

function StatusIcon({ configured, connectionType }) {
  if (connectionType === 'internal') {
    return (
      <AppIcon
        name="CheckCircle"
        fallback={CheckCircleIcon}
        sx={{ color: 'success.main' }}
        fontSize="small"
      />
    );
  }
  if (configured) {
    return (
      <AppIcon
        name="CheckCircle"
        fallback={CheckCircleIcon}
        sx={{ color: 'success.main' }}
        fontSize="small"
      />
    );
  }
  return (
    <AppIcon
      name="RadioButtonUnchecked"
      fallback={RadioButtonUncheckedIcon}
      sx={{ color: 'text.disabled' }}
      fontSize="small"
    />
  );
}

// ── Chat message component ───────────────────────────────────────

function ChatMessage({ role, children }) {
  const theme = useTheme();
  const isSystem = role === 'system';

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: isSystem ? 'flex-start' : 'flex-end',
        mb: 1.5,
      }}
    >
      <Box
        sx={{
          maxWidth: '85%',
          px: 2,
          py: 1.5,
          borderRadius: 2,
          bgcolor: isSystem
            ? alpha(theme.palette.primary.main, 0.08)
            : alpha(theme.palette.grey[500], 0.08),
          border: '1px solid',
          borderColor: isSystem
            ? alpha(theme.palette.primary.main, 0.15)
            : alpha(theme.palette.grey[500], 0.15),
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

// ── Main component ───────────────────────────────────────────────

export default function ToolSetupChat({ open, onClose, teamName, teamToolIds }) {
  const theme = useTheme();
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTool, setActiveTool] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const chatEndRef = useRef(null);

  // Load tool statuses on open
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setActiveTool(null);
    setApiKeyInput('');
    setSaveResult(null);

    fetchToolStatuses()
      .then(({ tools: allTools }) => {
        // Filter to this team's tools
        const teamTools = teamToolIds
          ? allTools.filter((t) => teamToolIds.includes(t.id))
          : allTools;
        setTools(teamTools);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, teamToolIds]);

  // Scroll to bottom on new content
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tools, activeTool, saveResult]);

  const handleSetupTool = useCallback((tool) => {
    setActiveTool(tool);
    setApiKeyInput('');
    setSaveResult(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeTool || !apiKeyInput.trim()) return;
    setSaving(true);
    setSaveResult(null);

    try {
      const result = await saveToolCredential(activeTool.id, apiKeyInput.trim());
      setSaveResult({ success: true, message: result.message });

      // Update local state
      setTools((prev) =>
        prev.map((t) => (t.id === activeTool.id ? { ...t, configured: true, status: 'active' } : t))
      );
      setActiveTool(null);
      setApiKeyInput('');
    } catch (err) {
      setSaveResult({ success: false, message: err.message });
    } finally {
      setSaving(false);
    }
  }, [activeTool, apiKeyInput]);

  const configuredCount = tools.filter((t) => t.configured).length;
  const totalCount = tools.length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 3, maxHeight: '80vh' },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AppIcon name="Build" fallback={BuildIcon} color="primary" />
          <Typography variant="h6" fontWeight={600}>
            {teamName} Tools
          </Typography>
          {totalCount > 0 && (
            <Chip
              label={`${configuredCount}/${totalCount}`}
              size="small"
              color={configuredCount === totalCount ? 'success' : 'default'}
              variant="outlined"
            />
          )}
        </Box>
        <IconButton onClick={onClose} size="small">
          <AppIcon name="Close" fallback={CloseIcon} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Tool status list */}
            <ChatMessage role="system">
              <Typography variant="body2" fontWeight={500} gutterBottom>
                Here are the tools for your {teamName} team:
              </Typography>
              <List dense disablePadding>
                {tools.map((tool) => (
                  <ListItem
                    key={tool.id}
                    disablePadding
                    sx={{ py: 0.5 }}
                    secondaryAction={
                      tool.connectionType !== 'internal' && !tool.configured ? (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleSetupTool(tool)}
                          sx={{ minWidth: 70, textTransform: 'none' }}
                        >
                          Setup
                        </Button>
                      ) : null
                    }
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <StatusIcon
                        configured={tool.configured}
                        connectionType={tool.connectionType}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={tool.name}
                      secondary={
                        tool.connectionType === 'internal'
                          ? 'Built-in'
                          : tool.configured
                            ? 'Configured'
                            : 'Needs API key'
                      }
                      primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                      secondaryTypographyProps={{ variant: 'caption' }}
                    />
                  </ListItem>
                ))}
              </List>
            </ChatMessage>

            {/* Active tool setup */}
            {activeTool && (
              <ChatMessage role="system">
                <Typography variant="body2" fontWeight={500} gutterBottom>
                  Setting up {activeTool.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {activeTool.description}
                </Typography>

                {activeTool.credentials?.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    {activeTool.credentials.map((cred) => (
                      <Box key={cred.key} sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          {cred.helpText}
                        </Typography>
                        {cred.helpUrl && (
                          <Box>
                            <Link
                              href={cred.helpUrl}
                              target="_blank"
                              rel="noopener"
                              variant="caption"
                            >
                              Get your {cred.label}
                            </Link>
                          </Box>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    fullWidth
                    size="small"
                    type="password"
                    placeholder="Paste your API key here"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && apiKeyInput.trim()) handleSave();
                    }}
                    disabled={saving}
                    autoFocus
                  />
                  <IconButton
                    color="primary"
                    onClick={handleSave}
                    disabled={saving || !apiKeyInput.trim()}
                  >
                    {saving ? (
                      <CircularProgress size={20} />
                    ) : (
                      <AppIcon name="Send" fallback={SendIcon} />
                    )}
                  </IconButton>
                </Box>
              </ChatMessage>
            )}

            {/* Save result */}
            {saveResult && (
              <ChatMessage role="system">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {saveResult.success ? (
                    <AppIcon
                      name="CheckCircle"
                      fallback={CheckCircleIcon}
                      color="success"
                      fontSize="small"
                    />
                  ) : (
                    <AppIcon name="Error" fallback={ErrorIcon} color="error" fontSize="small" />
                  )}
                  <Typography variant="body2">{saveResult.message}</Typography>
                </Box>
              </ChatMessage>
            )}

            {/* Completion message */}
            {configuredCount === totalCount && totalCount > 0 && (
              <ChatMessage role="system">
                <Typography variant="body2" fontWeight={500} color="success.main">
                  All tools are configured! Your {teamName} team is ready to operate.
                </Typography>
              </ChatMessage>
            )}

            <div ref={chatEndRef} />
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
