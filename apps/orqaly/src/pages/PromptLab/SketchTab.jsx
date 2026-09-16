import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react';
import {
  Alert,
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Typography,
  useTheme,
} from '@mui/material';
import DesignServicesOutlinedIcon from '@mui/icons-material/DesignServicesOutlined';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import {
  listSketchPrompts,
  archiveSketchPrompt,
  unarchiveSketchPrompt,
  deleteSketchPrompt,
} from '../../services/sketchPromptService';
import { getAgents } from '../../services/agentHubService';

import AppIcon from '../../components/icons/AppIcon';

const SketchImportDialog = lazy(() => import('./SketchImportDialog.jsx'));

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'applied', label: 'Applied' },
  { id: 'draft', label: 'Drafts' },
  { id: 'archived', label: 'Archived' },
];

const STATUS_STYLE = {
  applied: { color: '#059669', label: 'Applied' },
  draft: { color: '#2563EB', label: 'Draft' },
  archived: { color: '#6B7280', label: 'Archived' },
};

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

function truncate(s, max = 140) {
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function SketchCard({
  prompt,
  agentLabel,
  theme,
  onApplyAnother,
  onArchive,
  onUnarchive,
  onDelete,
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const status = STATUS_STYLE[prompt.status] || STATUS_STYLE.draft;
  const openMenu = (e) => setAnchorEl(e.currentTarget);
  const closeMenu = () => setAnchorEl(null);

  return (
    <Card variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.85rem', mr: 'auto' }}>
            {prompt.name}
          </Typography>
          <Chip
            label={status.label}
            size="small"
            sx={{
              height: 18,
              fontSize: '0.6rem',
              fontWeight: 700,
              bgcolor: alpha(status.color, 0.12),
              color: status.color,
            }}
          />
          <IconButton size="small" onClick={openMenu} sx={{ p: 0.25 }}>
            <AppIcon name="MoreVert" fallback={MoreVertIcon} sx={{ fontSize: 15 }} />
          </IconButton>
        </Box>

        {prompt.description && (
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              fontSize: '0.72rem',
              display: 'block',
              lineHeight: 1.45,
              mb: 0.75,
            }}
          >
            {truncate(prompt.description, 180)}
          </Typography>
        )}

        <Typography
          variant="caption"
          sx={{
            display: 'block',
            fontFamily: 'monospace',
            fontSize: '0.68rem',
            color: 'text.secondary',
            bgcolor: alpha(theme.palette.text.primary, 0.03),
            p: 0.75,
            borderRadius: 1,
            mb: 0.75,
            whiteSpace: 'pre-wrap',
            maxHeight: 76,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {truncate(prompt.content, 240)}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <Chip
            label={`Source: ${prompt.source_type}`}
            size="small"
            variant="outlined"
            sx={{ height: 18, fontSize: '0.58rem' }}
          />
          {agentLabel && (
            <Chip
              label={`→ ${agentLabel}`}
              size="small"
              variant="outlined"
              sx={{
                height: 18,
                fontSize: '0.58rem',
                borderColor: alpha('#059669', 0.4),
                color: '#059669',
              }}
            />
          )}
          {Array.isArray(prompt.tags) &&
            prompt.tags
              .slice(0, 3)
              .map((t) => (
                <Chip key={t} label={t} size="small" sx={{ height: 16, fontSize: '0.56rem' }} />
              ))}
          <Typography
            variant="caption"
            sx={{ color: 'text.disabled', ml: 'auto', fontSize: '0.62rem' }}
          >
            {formatDate(prompt.applied_at || prompt.created_at)}
          </Typography>
        </Box>
      </CardContent>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            closeMenu();
            onApplyAnother(prompt);
          }}
          disabled={prompt.status === 'archived'}
        >
          {prompt.agent_id ? 'Apply to another agent' : 'Apply to an agent'}
        </MenuItem>
        {prompt.status !== 'archived' ? (
          <MenuItem
            onClick={() => {
              closeMenu();
              onArchive(prompt);
            }}
          >
            Archive
          </MenuItem>
        ) : (
          <MenuItem
            onClick={() => {
              closeMenu();
              onUnarchive(prompt);
            }}
          >
            Unarchive
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            closeMenu();
            onDelete(prompt);
          }}
          sx={{ color: 'error.main' }}
        >
          Delete
        </MenuItem>
      </Menu>
    </Card>
  );
}

export default function SketchTab() {
  const theme = useTheme();
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSeed, setDialogSeed] = useState(null); // { existingPromptId, initialAgentId }

  const agents = useMemo(() => getAgents(), []);
  const agentLabelById = useMemo(() => {
    const map = new Map();
    for (const a of agents) {
      const key = a._supabase_id || a.id;
      if (key) map.set(key, a.name || a.role || 'Agent');
    }
    return map;
  }, [agents]);

  const load = useCallback(() => {
    setLoading(true);
    listSketchPrompts()
      .then((rows) => {
        setPrompts(rows);
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        setToast({ open: true, message: err.message, severity: 'error' });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (status === 'all') return prompts;
    return prompts.filter((p) => p.status === status);
  }, [prompts, status]);

  const handleOpenNew = () => {
    setDialogSeed(null);
    setDialogOpen(true);
  };
  const handleApplyAnother = (p) => {
    setDialogSeed({ existingPromptId: p.id });
    setDialogOpen(true);
  };

  const handleArchive = async (p) => {
    try {
      await archiveSketchPrompt(p.id);
      setToast({ open: true, message: 'Archived', severity: 'info' });
      load();
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };
  const handleUnarchive = async (p) => {
    try {
      await unarchiveSketchPrompt(p.id);
      setToast({ open: true, message: 'Unarchived', severity: 'success' });
      load();
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };
  const handleDelete = async (p) => {
    if (!window.confirm(`Delete “${p.name}”? This cannot be undone.`)) return;
    try {
      await deleteSketchPrompt(p.id);
      setToast({ open: true, message: 'Deleted', severity: 'info' });
      load();
    } catch (err) {
      setToast({ open: true, message: err.message, severity: 'error' });
    }
  };

  const handleDialogClose = (result) => {
    setDialogOpen(false);
    setDialogSeed(null);
    if (result?.saved) {
      setToast({
        open: true,
        message: result.applied ? 'Prompt imported and applied' : 'Prompt saved as draft',
        severity: 'success',
      });
      load();
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 800, fontSize: '0.85rem', lineHeight: 1.2 }}
          >
            Sketch prompts
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
            Import prompts from the outside world and apply them to an agent. Applied prompts are
            spliced into that agent&apos;s instructions at task execution time.
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<AppIcon name="Add" fallback={AddIcon} sx={{ fontSize: 16 }} />}
          onClick={handleOpenNew}
          sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 700 }}
        >
          Import prompt
        </Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, mb: 1.25, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map((f) => (
          <Chip
            key={f.id}
            label={f.label}
            size="small"
            onClick={() => setStatus(f.id)}
            variant={status === f.id ? 'filled' : 'outlined'}
            color={status === f.id ? 'primary' : 'default'}
            sx={{ height: 22, fontSize: '0.68rem', fontWeight: 600 }}
          />
        ))}
      </Box>
      {loading && <LinearProgress sx={{ mb: 1 }} />}
      {!loading && filtered.length === 0 && (
        <Paper
          variant="outlined"
          sx={{ borderRadius: 2, py: 5, textAlign: 'center', borderStyle: 'dashed' }}
        >
          <AppIcon
            name="DesignServicesOutlined"
            fallback={DesignServicesOutlinedIcon}
            sx={{ fontSize: 40, color: 'text.disabled', mb: 1, opacity: 0.45 }}
          />
          <Typography color="text.secondary" sx={{ fontSize: '0.85rem', mb: 0.5 }}>
            {prompts.length === 0 ? 'No imported prompts yet.' : 'Nothing matches this filter.'}
          </Typography>
          {prompts.length === 0 && (
            <>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ display: 'block', mb: 1.5 }}
              >
                Import your first prompt from a <b>.md</b>, <b>.json</b>, or <b>.txt</b> file.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={
                  <AppIcon
                    name="InsertDriveFileOutlined"
                    fallback={InsertDriveFileOutlinedIcon}
                    sx={{ fontSize: 15 }}
                  />
                }
                onClick={handleOpenNew}
                sx={{ textTransform: 'none', borderRadius: 2 }}
              >
                Import a file
              </Button>
            </>
          )}
        </Paper>
      )}
      {!loading && filtered.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map((p) => (
            <SketchCard
              key={p.id}
              prompt={p}
              agentLabel={p.agent_id ? agentLabelById.get(p.agent_id) : null}
              theme={theme}
              onApplyAnother={handleApplyAnother}
              onArchive={handleArchive}
              onUnarchive={handleUnarchive}
              onDelete={handleDelete}
            />
          ))}
        </Box>
      )}
      {dialogOpen && (
        <Suspense fallback={null}>
          <SketchImportDialog
            open
            onClose={handleDialogClose}
            agents={agents}
            existingPromptId={dialogSeed?.existingPromptId || null}
          />
        </Suspense>
      )}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
