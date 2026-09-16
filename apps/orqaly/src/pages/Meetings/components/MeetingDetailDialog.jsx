import { useState, useMemo, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  Stack,
  Divider,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Paper,
  Tooltip,
  Alert,
  alpha,
  useTheme,
  Collapse,
  Button,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import GroupsIcon from '@mui/icons-material/Groups';
import VideocamIcon from '@mui/icons-material/Videocam';
import TopicIcon from '@mui/icons-material/Topic';
import GavelIcon from '@mui/icons-material/Gavel';
import AssignmentIcon from '@mui/icons-material/Assignment';
import HandshakeIcon from '@mui/icons-material/Handshake';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import SummarizeIcon from '@mui/icons-material/Summarize';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FormDialog from '../../../components/Common/FormDialog';
import { MEETING_STATUS_LABELS, MEETING_STATUS_COLORS } from '../../../services/meetingService';

import AppIcon from '../../../components/icons/AppIcon';

const formatDuration = (seconds) => {
  if (!seconds) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatDateTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function SummarySection({ icon, title, items, expanded, onToggle, renderItem, theme }) {
  if (!items || items.length === 0) return null;
  return (
    <Box sx={{ mb: 2 }}>
      <Box
        onClick={onToggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          py: 0.75,
          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
          borderRadius: 1,
          px: 1,
          mx: -1,
        }}
      >
        {icon}
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          {title}
        </Typography>
        <Chip label={items.length} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
        {expanded ? (
          <AppIcon name="ExpandLess" fallback={ExpandLessIcon} fontSize="small" />
        ) : (
          <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} fontSize="small" />
        )}
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ pl: 1, pt: 0.5 }}>
          {items.map((item, i) => (
            <Box key={i}>{renderItem ? renderItem(item, i) : null}</Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

/**
 * MeetingDetailDialog
 * Full meeting viewer with: metadata, audio player, transcript (raw + timestamped),
 * searchable transcript, and structured summary with topics, decisions, action items.
 */
export default function MeetingDetailDialog({ open, onClose, meeting }) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const [historySort, setHistorySort] = useState('desc');
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    topics: true,
    decisions: true,
    actions: true,
    agreements: false,
  });
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const structured = meeting?.transcriptStructured || {};
  const timestamped = meeting?.transcriptTimestamped ?? [];

  // ─── Transcript Search (hooks must run unconditionally) ─────────────────────
  const filteredTranscript = useMemo(() => {
    if (!transcriptSearch.trim()) return timestamped;
    const q = transcriptSearch.toLowerCase();
    return timestamped.filter(
      (line) => line.text?.toLowerCase().includes(q) || line.speaker?.toLowerCase().includes(q)
    );
  }, [timestamped, transcriptSearch]);

  const analysisHistory = useMemo(() => {
    const list = Array.isArray(meeting?.analysisLogHistory) ? [...meeting.analysisLogHistory] : [];
    list.sort((a, b) => {
      const aTs = new Date(a?.createdAt || 0).getTime();
      const bTs = new Date(b?.createdAt || 0).getTime();
      return historySort === 'asc' ? aTs - bTs : bTs - aTs;
    });
    return list;
  }, [meeting?.analysisLogHistory, historySort]);

  const highlightText = useCallback(
    (text) => {
      if (!transcriptSearch.trim()) return text;
      const regex = new RegExp(
        `(${transcriptSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
        'gi'
      );
      const parts = text.split(regex);
      return parts.map((part, i) =>
        regex.test(part) ? (
          <Box
            key={i}
            component="span"
            sx={{ bgcolor: alpha('#F59E0B', 0.3), borderRadius: 0.5, px: 0.25 }}
          >
            {part}
          </Box>
        ) : (
          part
        )
      );
    },
    [transcriptSearch]
  );

  if (!meeting) return null;

  const toggleSection = (key) => setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // Audio controls
  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={meeting.title || 'Untitled Meeting'}
      subtitle={formatDateTime(meeting.datetime)}
      icon={VideocamIcon}
      maxWidth="lg"
      hideFooter
      contentDividers={false}
      contentSx={{ p: 0 }}
      paperSx={{ maxHeight: '90vh' }}
    >
      <Stack
        direction="row"
        spacing={1}
        flexWrap="wrap"
        sx={{ gap: 0.5, px: 3, pt: 1, pb: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Chip
          icon={<AppIcon name="CalendarToday" fallback={CalendarTodayIcon} sx={{ fontSize: 14 }} />}
          label={formatDateTime(meeting.datetime)}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.75rem' }}
        />
        <Chip
          icon={<AppIcon name="AccessTime" fallback={AccessTimeIcon} sx={{ fontSize: 14 }} />}
          label={formatDuration(meeting.durationSeconds)}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.75rem' }}
        />
        {meeting.channel && (
          <Chip
            icon={<AppIcon name="Videocam" fallback={VideocamIcon} sx={{ fontSize: 14 }} />}
            label={meeting.channel}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.75rem' }}
          />
        )}
        <Chip
          label={MEETING_STATUS_LABELS[meeting.status] || meeting.status}
          size="small"
          sx={{
            fontSize: '0.7rem',
            fontWeight: 600,
            bgcolor: alpha(MEETING_STATUS_COLORS[meeting.status] || '#94A3B8', 0.12),
            color: MEETING_STATUS_COLORS[meeting.status] || '#94A3B8',
          }}
        />
      </Stack>
      {/* ─── Metadata Bar ──────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          gap: 3,
          px: 3,
          py: 1.5,
          bgcolor: alpha(theme.palette.primary.main, 0.03),
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <AppIcon
            name="PersonOutline"
            fallback={PersonOutlineIcon}
            sx={{ fontSize: 18, color: 'text.secondary' }}
          />
          <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
            <b>Organizer:</b> {meeting.organizer || structured.organizer || '-'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <AppIcon
            name="Groups"
            fallback={GroupsIcon}
            sx={{ fontSize: 18, color: 'text.secondary' }}
          />
          <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
            <b>Participants:</b>{' '}
            {(meeting.participants || structured.participants || []).join(', ') || '-'}
          </Typography>
        </Box>
      </Box>
      {/* ─── Audio Player ──────────────────────────────────────────────── */}
      {(meeting.recordingBlobUrl || meeting.recordingUrl) && (
        <Box
          sx={{
            px: 3,
            py: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: alpha('#000', 0.02),
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <IconButton
              onClick={handlePlayPause}
              size="small"
              sx={{
                bgcolor: alpha(theme.palette.primary.main, 0.1),
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.2) },
              }}
            >
              {isPlaying ? (
                <AppIcon name="Pause" fallback={PauseIcon} fontSize="small" />
              ) : (
                <AppIcon name="PlayArrow" fallback={PlayArrowIcon} fontSize="small" />
              )}
            </IconButton>
            <Box sx={{ flex: 1 }}>
              <audio
                ref={audioRef}
                src={meeting.recordingBlobUrl || meeting.recordingUrl}
                controls
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                style={{ width: '100%', height: 40 }}
              />
            </Box>
          </Box>
        </Box>
      )}
      {meeting.status === 'completed' && !(meeting.recordingBlobUrl || meeting.recordingUrl) && (
        <Box sx={{ px: 3, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Audio is not retained. This meeting keeps transcript and structured notes only.
          </Alert>
        </Box>
      )}
      {/* ─── Tabs ──────────────────────────────────────────────────────── */}
      <Box sx={{ px: 3, pt: 1 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              minHeight: 40,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
            },
          }}
        >
          <Tab label="Summary" />
          <Tab label="Transcript" />
          <Tab label="Raw Text" />
          <Tab label="Version History" />
        </Tabs>
      </Box>
      <Divider />
      {/* ─── Tab: Summary ──────────────────────────────────────────────── */}
      {activeTab === 0 && (
        <Box sx={{ px: 3, py: 2.5, maxHeight: '55vh', overflow: 'auto' }}>
          {!structured.summary &&
            !(structured.topics || []).length &&
            !(structured.decisions || []).length &&
            !(structured.action_items || []).length && (
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', fontStyle: 'italic', mb: 2 }}
              >
                No transcript or summary available for this recording. Connect a transcription
                service in your environment to generate them.
              </Typography>
            )}
          {/* Executive Summary */}
          {structured.summary && (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                mb: 2.5,
                borderRadius: 2,
                bgcolor: alpha('#3B82F6', 0.05),
                border: '1px solid',
                borderColor: alpha('#3B82F6', 0.12),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AppIcon
                  name="Summarize"
                  fallback={SummarizeIcon}
                  sx={{ fontSize: 18, color: '#3B82F6' }}
                />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#3B82F6' }}>
                  Executive Summary
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ lineHeight: 1.7, color: 'text.primary' }}>
                {structured.summary}
              </Typography>
            </Paper>
          )}

          {/* Topics */}
          <SummarySection
            icon={
              <AppIcon name="Topic" fallback={TopicIcon} sx={{ fontSize: 18, color: '#8B5CF6' }} />
            }
            title="Key Discussion Points"
            items={structured.topics}
            expanded={expandedSections.topics ?? true}
            onToggle={() => toggleSection('topics')}
            theme={theme}
            renderItem={(topic) => (
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5 }}>
                <AppIcon
                  name="ArrowRight"
                  fallback={ArrowRightIcon}
                  sx={{ fontSize: 18, color: '#8B5CF6', mt: 0.15 }}
                />
                <Typography variant="body2" sx={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                  {topic}
                </Typography>
              </Box>
            )}
          />

          {/* Decisions */}
          <SummarySection
            icon={
              <AppIcon name="Gavel" fallback={GavelIcon} sx={{ fontSize: 18, color: '#F59E0B' }} />
            }
            title="Decisions Made"
            items={structured.decisions}
            expanded={expandedSections.decisions ?? true}
            onToggle={() => toggleSection('decisions')}
            theme={theme}
            renderItem={(decision) => (
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5 }}>
                <AppIcon
                  name="CheckCircle"
                  fallback={CheckCircleIcon}
                  sx={{ fontSize: 16, color: '#F59E0B', mt: 0.2 }}
                />
                <Typography variant="body2" sx={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                  {decision}
                </Typography>
              </Box>
            )}
          />

          {/* Action Items */}
          <SummarySection
            icon={
              <AppIcon
                name="Assignment"
                fallback={AssignmentIcon}
                sx={{ fontSize: 18, color: '#EF4444' }}
              />
            }
            title="Action Items / Next Steps"
            items={structured.action_items}
            expanded={expandedSections.actions ?? true}
            onToggle={() => toggleSection('actions')}
            theme={theme}
            renderItem={(item) => (
              <Paper
                elevation={0}
                sx={{
                  p: 1.5,
                  mb: 1,
                  borderRadius: 1.5,
                  bgcolor: alpha('#EF4444', 0.04),
                  border: '1px solid',
                  borderColor: alpha('#EF4444', 0.1),
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem', mb: 0.5 }}>
                  {item.task}
                </Typography>
                <Stack direction="row" spacing={1}>
                  {item.assignee && (
                    <Chip
                      icon={
                        <AppIcon
                          name="PersonOutline"
                          fallback={PersonOutlineIcon}
                          sx={{ fontSize: 14 }}
                        />
                      }
                      label={item.assignee}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 22 }}
                    />
                  )}
                  {item.deadline && (
                    <Chip
                      icon={
                        <AppIcon
                          name="CalendarToday"
                          fallback={CalendarTodayIcon}
                          sx={{ fontSize: 14 }}
                        />
                      }
                      label={item.deadline}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 22 }}
                    />
                  )}
                </Stack>
              </Paper>
            )}
          />

          {/* Agreements */}
          <SummarySection
            icon={
              <AppIcon
                name="Handshake"
                fallback={HandshakeIcon}
                sx={{ fontSize: 18, color: '#10B981' }}
              />
            }
            title="Agreements"
            items={structured.agreements}
            expanded={expandedSections.agreements ?? true}
            onToggle={() => toggleSection('agreements')}
            theme={theme}
            renderItem={(agreement) => (
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 0.5 }}>
                <AppIcon
                  name="CheckCircle"
                  fallback={CheckCircleIcon}
                  sx={{ fontSize: 16, color: '#10B981', mt: 0.2 }}
                />
                <Typography variant="body2" sx={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                  {agreement}
                </Typography>
              </Box>
            )}
          />

          {/* Tags */}
          {structured.tags?.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AppIcon
                  name="LocalOffer"
                  fallback={LocalOfferIcon}
                  sx={{ fontSize: 18, color: '#64748B' }}
                />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Tags
                </Typography>
              </Box>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ gap: 0.75 }}>
                {structured.tags.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.72rem', height: 24 }}
                  />
                ))}
              </Stack>
            </Box>
          )}
        </Box>
      )}
      {/* ─── Tab: Timestamped Transcript ───────────────────────────────── */}
      {activeTab === 1 && (
        <Box sx={{ px: 3, py: 2 }}>
          {/* Search Bar */}
          <TextField
            size="small"
            fullWidth
            placeholder="Search transcript…"
            value={transcriptSearch}
            onChange={(e) => setTranscriptSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <AppIcon name="Search" fallback={SearchIcon} sx={{ fontSize: 18 }} />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />

          {/* Results count */}
          {transcriptSearch && (
            <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1, display: 'block' }}>
              {filteredTranscript.length} of {timestamped.length} lines match
            </Typography>
          )}

          {/* Transcript lines */}
          <Box sx={{ maxHeight: '48vh', overflow: 'auto' }}>
            {filteredTranscript.length === 0 ? (
              <Typography
                variant="body2"
                sx={{ color: 'text.secondary', textAlign: 'center', py: 3 }}
              >
                {timestamped.length === 0 ? 'No transcript available.' : 'No matching lines found.'}
              </Typography>
            ) : (
              filteredTranscript.map((line, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    gap: 1.5,
                    py: 0.75,
                    px: 1,
                    borderRadius: 1,
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.disabled',
                      fontFamily: 'monospace',
                      minWidth: 40,
                      pt: 0.2,
                      fontSize: '0.72rem',
                    }}
                  >
                    {line.timestamp}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      minWidth: 60,
                      color: theme.palette.primary.main,
                      pt: 0.2,
                      fontSize: '0.78rem',
                    }}
                  >
                    {line.speaker}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ flex: 1, lineHeight: 1.6, fontSize: '0.85rem' }}
                  >
                    {highlightText(line.text)}
                  </Typography>
                </Box>
              ))
            )}
          </Box>
        </Box>
      )}
      {/* ─── Tab: Raw Text ─────────────────────────────────────────────── */}
      {activeTab === 2 && (
        <Box sx={{ px: 3, py: 2, maxHeight: '55vh', overflow: 'auto' }}>
          {meeting.transcriptRaw ? (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: alpha('#000', 0.02),
                border: '1px solid',
                borderColor: 'divider',
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                lineHeight: 1.8,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {meeting.transcriptRaw}
            </Paper>
          ) : (
            <Typography
              variant="body2"
              sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}
            >
              No raw transcript available.
            </Typography>
          )}
        </Box>
      )}
      {/* ─── Tab: Version History ───────────────────────────────────────── */}
      {activeTab === 3 && (
        <Box sx={{ px: 3, py: 2, maxHeight: '55vh', overflow: 'auto' }}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setHistorySort((s) => (s === 'desc' ? 'asc' : 'desc'))}
              sx={{ textTransform: 'none' }}
            >
              Sort: {historySort === 'desc' ? 'Newest first' : 'Oldest first'}
            </Button>
          </Box>
          {analysisHistory.length === 0 ? (
            <Typography
              variant="body2"
              sx={{ color: 'text.secondary', textAlign: 'center', py: 3 }}
            >
              No version history available for this meeting yet.
            </Typography>
          ) : (
            <Stack spacing={1.2}>
              {analysisHistory.map((entry, idx) => (
                <Paper
                  key={entry.id || `ver-${idx}`}
                  variant="outlined"
                  sx={{ p: 1.5, borderRadius: 1.5, borderColor: 'divider' }}
                >
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    Version {analysisHistory.length - idx} · {entry?.source || 'system'} ·{' '}
                    {formatDateTime(entry?.createdAt)}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.6, fontWeight: 600 }}>
                    {entry?.meeting_topic || 'Meeting analysis snapshot'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.4 }}>
                    {entry?.summary || 'No summary text in this version.'}
                  </Typography>
                  <Stack direction="row" spacing={0.75} sx={{ mt: 0.8 }} flexWrap="wrap">
                    <Chip
                      size="small"
                      label={`Requests: ${(entry?.extracted_requests || []).length}`}
                    />
                    <Chip
                      size="small"
                      label={`Actions: ${(entry?.recommended_actions || []).length}`}
                    />
                    <Chip
                      size="small"
                      label={`Workflows: ${(entry?.workflow_actions || []).length}`}
                    />
                    <Chip
                      size="small"
                      label={`Permissions: ${(entry?.permission_actions || []).length}`}
                    />
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>
      )}
    </FormDialog>
  );
}
