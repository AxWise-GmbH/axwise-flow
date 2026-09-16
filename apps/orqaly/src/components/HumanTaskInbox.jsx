import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Stack,
  Link as MuiLink,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { hasSupabase, supabase } from '../lib/supabase.js';

import AppIcon from './icons/AppIcon';

const POLL_MS = 15_000;
const KYC_REASON_PATTERN =
  /kyc|identity.*verif|upload.*id|selfie|passport|driver.*license|government.*id/i;

function useHumanTasks(userId, enabled) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!enabled || !userId || !hasSupabase()) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('human_tasks')
        .select('*')
        .in('status', ['pending', 'claimed'])
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (version === requestVersion.current && !error) setTasks(data || []);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [enabled, userId]);

  useEffect(() => {
    requestVersion.current += 1;
    setTasks([]);
    setLoading(false);
    if (!enabled || !userId || !hasSupabase()) return undefined;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => {
      requestVersion.current += 1;
      clearInterval(id);
    };
  }, [enabled, userId, refresh]);

  return { tasks, loading, refresh };
}

export default function HumanTaskInbox({ open, onClose, userId }) {
  const { tasks, loading, refresh } = useHumanTasks(userId, open);

  const pending = useMemo(
    () => tasks.filter((t) => t.status !== 'completed' && t.status !== 'cancelled'),
    [tasks]
  );

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 480, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            mb: 1.5,
          }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Human Task Inbox
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Tasks that need your input before work can continue.
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <AppIcon name="Close" fallback={CloseIcon} />
          </IconButton>
        </Box>
        <Divider sx={{ mb: 1 }} />

        {loading && pending.length === 0 ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : pending.length === 0 ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No tasks waiting.
            </Typography>
          </Box>
        ) : (
          <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
            {pending.map((task) => (
              <HumanTaskRow key={task.id} task={task} onDone={refresh} />
            ))}
          </List>
        )}
      </Box>
    </Drawer>
  );
}

function HumanTaskRow({ task, onDone }) {
  const [apiKey, setApiKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  // A brief carries a document for the in-house developer, not a credential:
  // no key form, no countdown — Copy and "Mark as done" instead.
  const isBrief = task.type === 'integration_brief';
  const isKyc =
    !isBrief && (task.reason_code === 'kyc_required' || KYC_REASON_PATTERN.test(task.reason || ''));
  const isManualCredential = !isBrief && !isKyc;
  const isLegacyDispatchLocked = !isBrief && Boolean(task.escalated_at);

  const callEndpoint = useCallback(async (payload) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not signed in');
    const res = await fetch('/api/human-task-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  }, []);

  const handleCopyBrief = async () => {
    try {
      await navigator.clipboard.writeText(task.instructions || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy — select the text and copy it by hand.');
    }
  };

  const handleMarkDone = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await callEndpoint({ human_task_id: task.id, mark_done: true });
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (apiKey.trim().length < 8) {
      setError('Paste the full API key (at least 8 characters).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await callEndpoint({ human_task_id: task.id, api_key: apiKey.trim() });
      setApiKey('');
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ListItem
      alignItems="flex-start"
      sx={{ px: 0, py: 1.5, flexDirection: 'column', alignItems: 'stretch' }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {task.recommended_provider || task.tool_id}
        </Typography>
        {isBrief && <Chip size="small" color="info" label="For your developer" />}
        {isKyc && (
          <Chip
            icon={<AppIcon name="WarningAmber" fallback={WarningAmberIcon} />}
            size="small"
            color="warning"
            label="Identity check required"
          />
        )}
        {isManualCredential && <Chip size="small" color="info" label="Manual key required" />}
        {isLegacyDispatchLocked && (
          <Chip size="small" color="warning" label="Credential handoff in progress" />
        )}
      </Stack>
      <ListItemText
        secondary={
          <>
            {task.reason && (
              <Typography
                component="span"
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block' }}
              >
                Reason: {task.reason}
              </Typography>
            )}
            {task.instructions && (
              <Typography
                component="span"
                variant="body2"
                sx={{
                  display: 'block',
                  whiteSpace: isBrief ? 'pre-wrap' : 'pre-line',
                  mt: 0.5,
                  ...(isBrief && !showAll
                    ? {
                        maxHeight: 180,
                        overflow: 'hidden',
                        maskImage: 'linear-gradient(#000 70%, transparent)',
                      }
                    : {}),
                  ...(isBrief
                    ? { fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem' }
                    : {}),
                }}
              >
                {task.instructions}
              </Typography>
            )}
            {isBrief && (task.instructions || '').length > 400 && (
              <MuiLink
                component="button"
                type="button"
                onClick={() => setShowAll((v) => !v)}
                sx={{ mt: 0.5, fontSize: '0.8rem' }}
              >
                {showAll ? 'Show less' : 'Show all'}
              </MuiLink>
            )}
            {task.provider_url && (
              <MuiLink
                href={task.provider_url}
                target="_blank"
                rel="noopener"
                sx={{ display: 'inline-flex', alignItems: 'center', mt: 0.5 }}
              >
                Open provider{' '}
                <AppIcon
                  name="OpenInNew"
                  fallback={OpenInNewIcon}
                  fontSize="inherit"
                  sx={{ ml: 0.3 }}
                />
              </MuiLink>
            )}
            {task.partial_context?.temp_email && (
              <Typography
                component="span"
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5 }}
              >
                Sandris used temp email: <code>{task.partial_context.temp_email}</code>
              </Typography>
            )}
          </>
        }
      />
      <Stack spacing={1} sx={{ mt: 1 }}>
        {isBrief ? (
          <Stack direction="row" spacing={1}>
            <Button onClick={handleCopyBrief} disabled={submitting} variant="outlined" size="small">
              {copied ? 'Copied' : 'Copy the brief'}
            </Button>
            <Button onClick={handleMarkDone} disabled={submitting} variant="contained" size="small">
              Mark as done
            </Button>
          </Stack>
        ) : (
          <>
            <TextField
              label="Paste API key"
              size="small"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={submitting || isLegacyDispatchLocked}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <Button
                onClick={handleSubmit}
                disabled={submitting || isLegacyDispatchLocked || apiKey.length < 8}
                variant="contained"
                size="small"
              >
                Submit key
              </Button>
            </Stack>
          </>
        )}
        {error && (
          <Alert severity="error" sx={{ fontSize: '0.85rem' }}>
            {error}
          </Alert>
        )}
      </Stack>
      <Divider sx={{ mt: 1.5 }} />
    </ListItem>
  );
}

// Exported for tests — the row is where the credential/brief branch lives.
export { HumanTaskRow };
