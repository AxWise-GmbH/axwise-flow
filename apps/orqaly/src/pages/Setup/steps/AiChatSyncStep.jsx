import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Stack,
  Chip,
  Alert,
  Typography,
  TextField,
  Collapse,
  Divider,
  useTheme,
  alpha,
} from '@mui/material';
import { getAssistantHistory } from '../../../services/assistantHistoryService';
import { syncAssistantChat, importChatExportBatched } from '../../../services/assistantIngestService';
import { listConnections } from '../../../services/kbConnectionsService';
import { parseExportFile } from '../../../services/chatExportParsers';
import StepShell from './StepShell';

const PLATFORM = 'platform';

// External AI apps to import from. None expose a history API, so each row explains
// how to grab that app's official export file, which we then parse client-side.
const IMPORT_PROVIDERS = [
  { id: 'chatgpt', name: 'ChatGPT', hint: 'Settings → Data controls → Export. Upload the .zip or conversations.json.' },
  { id: 'claude', name: 'Claude', hint: 'Settings → Privacy → Export data. Upload the .json.' },
  { id: 'gemini', name: 'Gemini', hint: 'Google Takeout → Gemini (JSON). Upload the .zip.' },
  { id: 'perplexity', name: 'Perplexity', hint: 'Export your data, then upload the file.' },
  { id: 'deepseek', name: 'DeepSeek', hint: 'Export your chats, then upload the JSON.' },
  { id: 'qwen', name: 'Qwen', hint: 'Export your chats, then upload the JSON.' },
  { id: 'kimi', name: 'Kimi', hint: 'Export your chats, then upload the JSON.' },
  { id: 'generic', name: 'Other', hint: 'Upload a JSON / markdown / text transcript.' },
];

function OptionTile({ tint, title, sub, action, onAction, selected, disabled }) {
  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: 2,
        border: '1px solid',
        borderColor: selected ? tint : 'divider',
        bgcolor: selected ? alpha(tint, 0.06) : 'transparent',
        opacity: disabled ? 0.55 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
        {sub}
      </Typography>
      {selected ? (
        <Chip size="small" color="success" label="Selected" sx={{ alignSelf: 'flex-start' }} />
      ) : action ? (
        <Button
          size="small"
          variant="outlined"
          onClick={onAction}
          disabled={disabled}
          sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
        >
          {action}
        </Button>
      ) : null}
    </Box>
  );
}

/**
 * Step - AI Chat Synchronization. Pick where the chat history lands (the platform
 * Knowledge Base, or a connected KB space), then sync. If no external space is
 * connected, offer to connect one in the Knowledge Base.
 */
export default function AiChatSyncStep({ progress }) {
  const theme = useTheme();
  const tint = theme.palette.primary.main;
  const navigate = useNavigate();

  const [space, setSpace] = useState('Assistant Chats');
  const [dest, setDest] = useState(PLATFORM); // PLATFORM | <connection id>
  const [messages, setMessages] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // External AI-app import state.
  const fileInputRef = useRef(null);
  const importHintRef = useRef('generic');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null); // { provider, conversations, warnings }
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [rows, conn] = await Promise.all([
          getAssistantHistory(300).catch(() => []),
          listConnections()
            .then((d) => d.connections || [])
            .catch(() => []),
        ]);
        if (!active) return;
        setMessages(Array.isArray(rows) ? rows : []);
        setConnections(conn.filter((c) => c.enabled !== false));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const conversationCount = useMemo(() => {
    const ids = new Set(messages.map((m) => m.conversation_id).filter(Boolean));
    return ids.size;
  }, [messages]);

  const selectedConn = connections.find((c) => c.id === dest) || null;
  const canSync = conversationCount > 0 && !syncing && (dest === PLATFORM ? space.trim().length > 0 : true);
  // Destination the import lands in - mirrors the "Sync now" target.
  const targetSpaceLabel = selectedConn
    ? selectedConn.label || selectedConn.source_type
    : space.trim() || 'Imported Chats';

  const handleSync = async () => {
    if (!canSync) return;
    setSyncing(true);
    setError(null);
    setResult(null);
    try {
      const targetSpace = selectedConn
        ? selectedConn.label || selectedConn.source_type
        : space.trim();
      const res = await syncAssistantChat({
        space: targetSpace,
        connectionId: selectedConn ? selectedConn.id : undefined,
      });
      setResult({ ...res, space: targetSpace });
      if (res.synced > 0) progress.aiChatSync.markDone();
    } catch (e) {
      setError(e.message || 'Failed to sync chat history');
    } finally {
      setSyncing(false);
    }
  };

  const pickFileFor = (providerId) => {
    importHintRef.current = providerId;
    setParsed(null);
    setImportResult(null);
    setImportError(null);
    fileInputRef.current?.click();
  };

  const onFilePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the user re-pick the same file
    if (!file) return;
    setParsing(true);
    setImportError(null);
    setImportResult(null);
    setParsed(null);
    try {
      const res = await parseExportFile(file, importHintRef.current);
      setParsed(res);
      if (!res.conversations.length) {
        setImportError(res.warnings[0] || 'No conversations found in that file.');
      }
    } catch (err) {
      setImportError(err.message || 'Could not read that file.');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!parsed?.conversations?.length || importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await importChatExportBatched({
        provider: parsed.provider,
        space: targetSpaceLabel,
        connectionId: selectedConn ? selectedConn.id : undefined,
        conversations: parsed.conversations,
      });
      setImportResult({ ...res, space: targetSpaceLabel });
      if (res.synced > 0) progress.aiChatSync.markDone();
      setParsed(null);
    } catch (err) {
      setImportError(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <StepShell
      topic="AI Chat"
      title="Sync AI Chat to Knowledge Base"
      done={progress.aiChatSync.done}
      description="Import your assistant conversation history into a space so it becomes searchable and reusable by your agents. Pick the platform Knowledge Base, or a connected space."
    >
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            color={conversationCount > 0 ? 'primary' : 'default'}
            variant="outlined"
            label={
              loading
                ? 'Checking history…'
                : `${conversationCount} conversation${conversationCount === 1 ? '' : 's'} ready`
            }
          />
        </Box>

        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Destination space
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          <OptionTile
            tint={tint}
            selected={dest === PLATFORM}
            title="Knowledge Base"
            sub="Stored on this platform. No setup - searchable by your agents."
            action="Use this"
            onAction={() => setDest(PLATFORM)}
          />
          {connections.map((c) => (
            <OptionTile
              key={c.id}
              tint={tint}
              selected={dest === c.id}
              title={c.label || c.source_type}
              sub={`Connected ${c.source_type} space.`}
              action="Use this"
              onAction={() => setDest(c.id)}
            />
          ))}
          <OptionTile
            tint={tint}
            title="Connect a space"
            sub="Link Notion, Dropbox, Google Drive, OneDrive and more."
            action="Connect"
            onAction={() => navigate('/knowledge-base')}
          />
        </Box>

        <Collapse in={dest === PLATFORM} unmountOnExit>
          <TextField
            label="Knowledge Base space"
            value={space}
            onChange={(e) => setSpace(e.target.value)}
            size="small"
            fullWidth
            helperText="Conversations are stored under this category in your Knowledge Base."
          />
        </Collapse>

        {conversationCount === 0 && !loading && (
          <Alert severity="info">
            No AI chat history yet - pick a destination now; “Sync now” unlocks once you have
            conversations with the assistant.
          </Alert>
        )}

        <Box>
          <Button
            variant="contained"
            onClick={handleSync}
            disabled={!canSync}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </Box>

        {result && (
          <Alert severity="success" onClose={() => setResult(null)}>
            Synced {result.synced} of {result.conversations} conversation
            {result.conversations === 1 ? '' : 's'} into “{result.space}”.
            {result.truncated ? ' Some history was capped for this sync.' : ''}
          </Alert>
        )}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Divider sx={{ mt: 1 }} />

        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Import from another AI app
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            These apps have no history API - download your export from the app, upload it here, and
            we parse it into the destination selected above ({`“${targetSpaceLabel}”`}).
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
          {IMPORT_PROVIDERS.map((p) => (
            <OptionTile
              key={p.id}
              tint={tint}
              title={p.name}
              sub={p.hint}
              action="Import file"
              onAction={() => pickFileFor(p.id)}
            />
          ))}
        </Box>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.zip,.md,.txt,application/json,application/zip,text/markdown,text/plain"
          onChange={onFilePicked}
          style={{ display: 'none' }}
        />

        {parsing && (
          <Typography variant="body2" color="text.secondary">
            Reading export file…
          </Typography>
        )}

        {parsed && parsed.conversations.length > 0 && (
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: alpha(tint, 0.25),
              display: 'flex',
              flexDirection: 'column',
              gap: 1.25,
            }}
          >
            <Typography variant="body2">
              Found <strong>{parsed.conversations.length}</strong> conversation
              {parsed.conversations.length === 1 ? '' : 's'} from <strong>{parsed.provider}</strong>.
            </Typography>
            {parsed.warnings?.map((w, i) => (
              <Alert key={i} severity="warning" sx={{ py: 0 }}>
                {w}
              </Alert>
            ))}
            <Box>
              <Button
                variant="contained"
                onClick={handleImport}
                disabled={importing}
                sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
              >
                {importing ? 'Importing…' : `Import into “${targetSpaceLabel}”`}
              </Button>
            </Box>
          </Box>
        )}

        {importResult && (
          <Alert severity="success" onClose={() => setImportResult(null)}>
            Imported {importResult.synced} of {importResult.conversations} conversation
            {importResult.conversations === 1 ? '' : 's'} into “{importResult.space}”.
          </Alert>
        )}
        {importError && (
          <Alert severity="error" onClose={() => setImportError(null)}>
            {importError}
          </Alert>
        )}
      </Stack>
    </StepShell>
  );
}
