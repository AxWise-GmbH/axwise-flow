/**
 * AgentMemoryPanel — Shared dialog for managing agent long-term memory.
 *
 * Two modes:
 *   1. Activation gate (when !isActivated) — shows preview counts of existing memory
 *      and an Activate button that flips agent.metadata.long_term_memory_enabled.
 *   2. Active panel (when isActivated) — Manual section (Notes/Files/Links/Conversations,
 *      user-editable) and Auto section (Reports/Jobs/Work/Lessons/Goal-linked, read-only).
 *      Records from the Auto section come from backend writers (goal/job handlers, OSJA).
 */
import { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Button,
  TextField,
  CircularProgress,
  alpha,
  useTheme,
  Tooltip,
  Stack,
  Divider,
} from '@mui/material';
import FormDialog from './FormDialog';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import WorkOutlineOutlinedIcon from '@mui/icons-material/WorkOutlineOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import { useAgentMemory } from '../../hooks/useAgentMemory';
import { uploadKBFile } from '../../services/kbFileService';

import AppIcon from '../icons/AppIcon';

// Tab definitions. `predicate(m)` decides whether a record belongs on this tab.
// Manual tabs filter by content_type (user-editable). Auto tabs filter by category
// (system-authored, read-only).
const AUTO_CATEGORIES = new Set(['agent-report', 'job-memory', 'agent-work-memory', 'osja_lesson']);

const MANUAL_TABS = [
  {
    id: 'notes',
    countKey: 'notes',
    label: 'Notes',
    icon: NoteAddOutlinedIcon,
    predicate: (m) =>
      (m.content_type || 'note') === 'note' &&
      !AUTO_CATEGORIES.has(m.category) &&
      m.source_tag !== 'goal-linked',
  },
  {
    id: 'files',
    countKey: 'files',
    label: 'Files',
    icon: UploadFileOutlinedIcon,
    predicate: (m) => m.content_type === 'file',
  },
  {
    id: 'links',
    countKey: 'links',
    label: 'Links',
    icon: LinkOutlinedIcon,
    predicate: (m) => m.content_type === 'link',
  },
  {
    id: 'conversations',
    countKey: 'conversations',
    label: 'Conversations',
    icon: ChatOutlinedIcon,
    predicate: (m) => m.content_type === 'conversation',
  },
];

const AUTO_TABS = [
  {
    id: 'reports',
    countKey: 'reports',
    label: 'Reports',
    icon: AssessmentOutlinedIcon,
    predicate: (m) => m.category === 'agent-report',
  },
  {
    id: 'jobs',
    countKey: 'jobs',
    label: 'Jobs',
    icon: WorkOutlineOutlinedIcon,
    predicate: (m) => m.category === 'job-memory',
  },
  {
    id: 'work',
    countKey: 'work',
    label: 'Work',
    icon: BuildOutlinedIcon,
    predicate: (m) => m.category === 'agent-work-memory',
  },
  {
    id: 'lessons',
    countKey: 'lessons',
    label: 'Lessons',
    icon: SchoolOutlinedIcon,
    predicate: (m) => m.category === 'osja_lesson',
  },
  {
    id: 'goal-linked',
    countKey: 'goalLinked',
    label: 'From Goals',
    icon: FlagOutlinedIcon,
    predicate: (m) => m.source_tag === 'goal-linked',
  },
];

const ALL_TABS = [...MANUAL_TABS, ...AUTO_TABS];
const AUTO_TAB_IDS = new Set(AUTO_TABS.map((t) => t.id));

function formatRelative(iso) {
  if (!iso) return 'never';
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return 'never';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function AgentMemoryPanel({
  ownerType = 'agent',
  ownerId,
  ownerName,
  open,
  onClose,
  isActivated = true,
  activatedAt = null,
  onActivate,
  onDeactivate,
}) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState('notes');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fileRef = useRef(null);

  const { memories, loading, counts, lastSearchMs, addMemory, removeMemory } = useAgentMemory(
    ownerType,
    ownerId
  );

  const currentTab = ALL_TABS.find((t) => t.id === activeTab) || MANUAL_TABS[0];
  const filtered = memories.filter((m) => {
    if (!currentTab.predicate(m)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        (m.title || '').toLowerCase().includes(q) || (m.content || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleActivate = async () => {
    if (!onActivate) return;
    setActivating(true);
    try {
      await onActivate();
    } finally {
      setActivating(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    setSaving(true);
    try {
      await addMemory({
        title: noteTitle.trim() || noteContent.slice(0, 80),
        content: noteContent.trim(),
        content_type: 'note',
        source: 'manual',
        category: 'agent-memory',
        tags: ['memory', 'manual'],
      });
      setNoteTitle('');
      setNoteContent('');
    } finally {
      setSaving(false);
    }
  };

  const handleAddLink = async () => {
    if (!linkUrl.trim()) return;
    setSaving(true);
    try {
      await addMemory({
        title: linkTitle.trim() || linkUrl,
        content: '',
        content_type: 'link',
        url: linkUrl.trim(),
        source: 'manual',
        category: 'agent-memory',
        tags: ['memory', 'link'],
      });
      setLinkUrl('');
      setLinkTitle('');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const uploaded = await uploadKBFile(ownerId, file);
      await addMemory({
        title: file.name,
        content: `Uploaded file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
        content_type: 'file',
        file_path: uploaded.path,
        file_name: uploaded.name || file.name,
        file_size: file.size,
        file_mime: file.type,
        source: 'upload',
        category: 'agent-memory',
        tags: ['memory', 'file'],
      });
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const isAutoTab = AUTO_TAB_IDS.has(activeTab);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Long-Term Memory"
      subtitle={`${ownerName || 'Agent'} · ${isActivated ? `${counts.total} memories` : 'Deactivated'}`}
      icon={MenuBookOutlinedIcon}
      maxWidth="sm"
      paperSx={{ maxHeight: '85vh' }}
      hideFooter
      contentDividers={false}
      contentSx={{ p: 0 }}
    >
      {isActivated ? (
        <>
          {/* Status Bar */}
          <Box
            sx={{
              px: 2,
              py: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
              bgcolor: alpha(theme.palette.success.main, 0.04),
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Chip
              size="small"
              icon={
                <AppIcon
                  name="CheckCircleOutline"
                  fallback={CheckCircleOutlineIcon}
                  sx={{ fontSize: 14 }}
                />
              }
              label="Active"
              color="success"
              variant="outlined"
              sx={{ height: 22, fontSize: '0.65rem', fontWeight: 600 }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem' }}>
              {counts.total} total &middot; Updated {formatRelative(counts.lastUpdatedAt)}
              {activatedAt ? ` · Since ${new Date(activatedAt).toLocaleDateString()}` : ''}
            </Typography>
            {lastSearchMs != null && (
              <Chip
                size="small"
                icon={
                  <AppIcon name="BoltOutlined" fallback={BoltOutlinedIcon} sx={{ fontSize: 12 }} />
                }
                label={`${lastSearchMs}ms`}
                variant="outlined"
                sx={{ height: 20, fontSize: '0.6rem' }}
              />
            )}
            {onDeactivate && (
              <Button
                size="small"
                onClick={onDeactivate}
                sx={{
                  ml: 'auto',
                  textTransform: 'none',
                  fontSize: '0.65rem',
                  color: 'text.secondary',
                  minWidth: 'auto',
                }}
              >
                Deactivate
              </Button>
            )}
          </Box>

          {/* Tabs — Manual + Auto, with a subtle separator */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              borderBottom: '1px solid',
              borderColor: 'divider',
              px: 1.5,
              overflowX: 'auto',
            }}
          >
            {MANUAL_TABS.map((tab) => (
              <TabButton
                key={tab.id}
                tab={tab}
                count={counts[tab.countKey]}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1 }} />
            {AUTO_TABS.map((tab) => (
              <TabButton
                key={tab.id}
                tab={tab}
                count={counts[tab.countKey]}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              />
            ))}
          </Box>

          <Box>
            {/* Search */}
            <Box
              sx={{
                p: 1.5,
                borderBottom: '1px solid',
                borderColor: alpha(theme.palette.divider, 0.5),
              }}
            >
              <TextField
                fullWidth
                size="small"
                placeholder="Search memories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <AppIcon
                      name="SearchOutlined"
                      fallback={SearchOutlinedIcon}
                      sx={{ fontSize: 16, color: 'text.secondary', mr: 0.5 }}
                    />
                  ),
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Box>

            {/* Add forms — only on Manual tabs */}
            {activeTab === 'notes' && (
              <Box
                sx={{
                  p: 2,
                  borderBottom: '1px solid',
                  borderColor: alpha(theme.palette.divider, 0.5),
                }}
              >
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Title (optional)"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Write a memory note..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  multiline
                  rows={2}
                  sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleAddNote}
                  disabled={!noteContent.trim() || saving}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 2,
                    bgcolor: '#34d399',
                    color: '#0a0a0f',
                    '&:hover': { bgcolor: '#2dd4a0' },
                  }}
                >
                  {saving ? <CircularProgress size={16} /> : 'Save Note'}
                </Button>
              </Box>
            )}

            {activeTab === 'files' && (
              <Box
                sx={{
                  p: 2,
                  borderBottom: '1px solid',
                  borderColor: alpha(theme.palette.divider, 0.5),
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.png,.jpg,.jpeg"
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => fileRef.current?.click()}
                  disabled={saving}
                  startIcon={
                    saving ? (
                      <CircularProgress size={14} />
                    ) : (
                      <AppIcon name="UploadFileOutlined" fallback={UploadFileOutlinedIcon} />
                    )
                  }
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                >
                  Upload File
                </Button>
                <Typography variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>
                  PDF, docs, images, CSV, JSON (max 25MB)
                </Typography>
              </Box>
            )}

            {activeTab === 'links' && (
              <Box
                sx={{
                  p: 2,
                  borderBottom: '1px solid',
                  borderColor: alpha(theme.palette.divider, 0.5),
                }}
              >
                <TextField
                  fullWidth
                  size="small"
                  placeholder="https://..."
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Title (optional — auto-scraped)"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                />
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleAddLink}
                  disabled={!linkUrl.trim() || saving}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 600,
                    borderRadius: 2,
                    bgcolor: '#34d399',
                    color: '#0a0a0f',
                    '&:hover': { bgcolor: '#2dd4a0' },
                  }}
                >
                  {saving ? <CircularProgress size={16} /> : 'Save Link'}
                </Button>
              </Box>
            )}

            {isAutoTab && (
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  borderBottom: '1px solid',
                  borderColor: alpha(theme.palette.divider, 0.5),
                  bgcolor: alpha(theme.palette.info.main, 0.04),
                }}
              >
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem' }}>
                  System-authored memory — read-only. Written by goal & job handlers as work
                  completes.
                </Typography>
              </Box>
            )}

            {/* List */}
            <Box sx={{ p: 1.5, minHeight: 200 }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : filtered.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  <AppIcon
                    name="DescriptionOutlined"
                    fallback={DescriptionOutlinedIcon}
                    sx={{ fontSize: 32, color: 'text.disabled', mb: 0.5 }}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    No memories yet
                  </Typography>
                  <Typography variant="caption">
                    {isAutoTab
                      ? 'Records will appear here as this agent works.'
                      : 'Add notes, files, or links to build long-term memory.'}
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {filtered.map((mem) => (
                    <MemoryRow
                      key={mem.id}
                      mem={mem}
                      readOnly={isAutoTab}
                      onDelete={() => removeMemory(mem.id)}
                    />
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        </>
      ) : (
        <ActivationView
          ownerName={ownerName}
          counts={counts}
          loading={loading}
          activating={activating}
          onActivate={handleActivate}
        />
      )}
    </FormDialog>
  );
}

function TabButton({ tab, count, active, onClick }) {
  const Icon = tab.icon;
  return (
    <Box
      onClick={onClick}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.25,
        py: 1,
        cursor: 'pointer',
        borderBottom: '2px solid',
        fontSize: '0.68rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        borderColor: active ? 'primary.main' : 'transparent',
        color: active ? 'primary.main' : 'text.secondary',
        transition: 'all 0.2s',
        '&:hover': { color: 'text.primary' },
      }}
    >
      <AppIcon fallback={Icon} sx={{ fontSize: 14 }} /> {tab.label}
      {count > 0 && (
        <Chip
          label={count}
          size="small"
          sx={{
            height: 15,
            fontSize: '0.55rem',
            fontWeight: 700,
            ml: 0.25,
            '& .MuiChip-label': { px: 0.5 },
          }}
        />
      )}
    </Box>
  );
}

function MemoryRow({ mem, readOnly, onDelete }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        transition: 'border-color 0.15s',
        '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.3) },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              mb: 0.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {mem.title || 'Untitled'}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.4,
              fontSize: '0.7rem',
            }}
          >
            {mem.content?.slice(0, 200) || '—'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              label={mem.category || mem.content_type || 'note'}
              size="small"
              sx={{ height: 18, fontSize: '0.55rem', fontWeight: 600, textTransform: 'capitalize' }}
            />
            {mem.source_tag === 'goal-linked' && mem.goal_title && (
              <Chip
                label={`Goal: ${mem.goal_title}`}
                size="small"
                color="info"
                variant="outlined"
                sx={{ height: 18, fontSize: '0.55rem', maxWidth: 180 }}
              />
            )}
            {mem.url && (
              <Chip
                label="Link"
                size="small"
                color="info"
                variant="outlined"
                sx={{ height: 18, fontSize: '0.55rem' }}
              />
            )}
            <Typography
              variant="caption"
              sx={{ color: 'text.disabled', fontSize: '0.58rem', ml: 'auto' }}
            >
              {mem.created_at ? new Date(mem.created_at).toLocaleDateString() : ''}
            </Typography>
          </Box>
        </Box>
        {!readOnly && (
          <Tooltip title="Delete">
            <IconButton
              size="small"
              onClick={onDelete}
              sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
            >
              <AppIcon name="DeleteOutline" fallback={DeleteOutlineIcon} sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

function ActivationView({ ownerName, counts, loading, activating, onActivate }) {
  const theme = useTheme();
  const previewRows = [
    { key: 'reports', label: 'Reports', icon: AssessmentOutlinedIcon, value: counts.reports },
    { key: 'jobs', label: 'Job memory', icon: WorkOutlineOutlinedIcon, value: counts.jobs },
    { key: 'work', label: 'Work memory', icon: BuildOutlinedIcon, value: counts.work },
    { key: 'lessons', label: 'Lessons', icon: SchoolOutlinedIcon, value: counts.lessons },
    { key: 'goal-linked', label: 'From goals', icon: FlagOutlinedIcon, value: counts.goalLinked },
    {
      key: 'manual',
      label: 'Notes / Files / Links / Conversations',
      icon: NoteAddOutlinedIcon,
      value: counts.notes + counts.files + counts.links + counts.conversations,
    },
  ];
  const hasPreview = previewRows.some((r) => r.value > 0);

  return (
    <Box sx={{ p: 3, textAlign: 'center' }}>
      <Box
        sx={{
          width: 56,
          height: 56,
          mx: 'auto',
          mb: 1.5,
          borderRadius: '50%',
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppIcon
          name="MenuBookOutlined"
          fallback={MenuBookOutlinedIcon}
          sx={{ fontSize: 28, color: 'primary.main' }}
        />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
        Memory is deactivated
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
        {ownerName || 'This agent'} is disconnected from its accumulated memory. Reactivate to
        reconnect it to the reports, job history, lessons, and goal context it has already produced.
      </Typography>
      <Box
        sx={{
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          p: 2,
          mb: 2,
          textAlign: 'left',
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            color: 'text.secondary',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            display: 'block',
            mb: 1,
          }}
        >
          What will reconnect
        </Typography>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : (
          <Stack spacing={0.75}>
            {previewRows.map((row) => {
              const Icon = row.icon;
              return (
                <Box key={row.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AppIcon fallback={Icon} sx={{ fontSize: 14, color: 'text.secondary' }} />
                  <Typography variant="body2" sx={{ fontSize: '0.78rem', flex: 1 }}>
                    {row.label}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: row.value > 0 ? 'primary.main' : 'text.disabled',
                    }}
                  >
                    {row.value}
                  </Typography>
                </Box>
              );
            })}
            {!hasPreview && (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                No accumulated memory yet — records will appear as this agent works.
              </Typography>
            )}
          </Stack>
        )}
      </Box>
      <Button
        variant="contained"
        onClick={onActivate}
        disabled={activating}
        startIcon={
          activating ? (
            <CircularProgress size={14} />
          ) : (
            <AppIcon name="BoltOutlined" fallback={BoltOutlinedIcon} />
          )
        }
        sx={{
          textTransform: 'none',
          fontWeight: 700,
          borderRadius: 2,
          px: 3,
          bgcolor: '#34d399',
          color: '#0a0a0f',
          '&:hover': { bgcolor: '#2dd4a0' },
        }}
      >
        {activating ? 'Reactivating…' : 'Reactivate Long-Term Memory'}
      </Button>
      <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', mt: 1 }}>
        No data was deleted when deactivated — reactivating restores full access.
      </Typography>
    </Box>
  );
}
