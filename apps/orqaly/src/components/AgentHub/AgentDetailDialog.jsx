/**
 * AgentDetailDialog — standalone dialog showing agent overview + ratings.
 * Matches the AgentHub detail panel (Overview tab + Ratings & Reviews).
 * Used from Organizations page when clicking an agent chip.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  Divider,
  Typography,
  Chip,
  Stack,
  Paper,
  IconButton,
  Button,
  Collapse,
  TextField,
  Rating,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  Select,
  MenuItem,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

import StarOutlineIcon from '@mui/icons-material/StarOutline';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import {
  getAgentRatings,
  submitRating,
  deleteRating,
  getConsiliumRating,
  getRatingEvents,
} from '../../services/agentRatingService';
import SupervisedUserCircleOutlinedIcon from '@mui/icons-material/SupervisedUserCircleOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import { getAllJobs } from '../../services/jobService';
import { supabase, hasSupabase } from '../../lib/supabase';
import AgentAvatar from './AgentAvatar';
import ConnectedLibrariesSection from './ConnectedLibrariesSection';

import AppIcon from '../icons/AppIcon';
import AgentEnhancementTab from './AgentEnhancementTab';
import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '../../config/assistantBrain';

function formatTimestamp(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function getStatusColor(status, theme) {
  switch (status) {
    case 'available':
      return theme.palette.success.main;
    case 'busy':
      return theme.palette.warning.main;
    case 'offline':
      return theme.palette.error.main;
    default:
      return theme.palette.text.secondary;
  }
}

export default function AgentDetailDialog({ open, onClose, agent, profile, onChat }) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);

  // Ratings state
  const [ratings, setRatings] = useState([]);
  const [avgRating, setAvgRating] = useState({ average: 0, count: 0 });
  const [consiliumRating, setConsiliumRating] = useState({
    average: 0,
    count: 0,
    normalizedStars: 0,
  });
  const [ratingEvents, setRatingEvents] = useState([]);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [ratingForm, setRatingForm] = useState({
    rating: 0,
    comment: '',
    ratingType: 'individual',
    requestId: '',
  });
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratableRequests, setRatableRequests] = useState([]);

  const agentId = agent?.agent_id || agent?.id;

  // Pulse config state
  const [pulseConfig, setPulseConfig] = useState({
    pulse_enabled: false,
    pulse_mode: 'lite',
    pulse_task_focus: '',
    pulse_goal_id: '',
    autonomous_enabled: false,
    check_in_interval_ms: 28800000, // 8h default
  });
  const [pulseSaving, setPulseSaving] = useState(false);
  const [userGoals, setUserGoals] = useState([]);

  // Osja feedback-loop config (migration 109 — lives on `agents` table)
  const [osjaConfig, setOsjaConfig] = useState({
    osja_regen_threshold: 70,
    osja_regen_max_attempts: 1,
    osja_learning_enabled: true,
  });
  const [osjaSaving, setOsjaSaving] = useState(false);

  // Reset tab when dialog opens
  useEffect(() => {
    if (open) setActiveTab(0);
  }, [open]);

  // Load pulse config + user goals when dialog opens
  useEffect(() => {
    if (!open || !agentId) return;
    (async () => {
      try {
        const [agentRes, goalsRes, osjaRes] = await Promise.all([
          supabase
            .from('concilium_agents')
            .select(
              'pulse_enabled, pulse_mode, pulse_task_focus, pulse_goal_id, autonomous_enabled, check_in_interval_ms, pulse_cycle_count, next_pulse_at, pulse_best_score'
            )
            .eq('id', agentId)
            .maybeSingle(),
          supabase
            .from('goals')
            .select('id, title, status')
            .in('status', [
              'feasibility',
              'analyzing',
              'researching_customer',
              'planning',
              'active',
              'forming_team',
              'provisioning_tools',
              'estimating',
              'awaiting_context_approval',
              'awaiting_approval',
              'authorizing_execution',
            ])
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('agents')
            .select('osja_regen_threshold, osja_regen_max_attempts, osja_learning_enabled')
            .eq('id', agentId)
            .maybeSingle(),
        ]);
        if (agentRes.data) {
          setPulseConfig({
            pulse_enabled: agentRes.data.pulse_enabled || false,
            pulse_mode: agentRes.data.pulse_mode || 'lite',
            pulse_task_focus: agentRes.data.pulse_task_focus || '',
            pulse_goal_id: agentRes.data.pulse_goal_id || '',
            autonomous_enabled: agentRes.data.autonomous_enabled || false,
            check_in_interval_ms: agentRes.data.check_in_interval_ms || 28800000,
          });
        }
        if (osjaRes.data) {
          setOsjaConfig({
            osja_regen_threshold: osjaRes.data.osja_regen_threshold ?? 70,
            osja_regen_max_attempts: osjaRes.data.osja_regen_max_attempts ?? 1,
            osja_learning_enabled: osjaRes.data.osja_learning_enabled !== false,
          });
        }
        setUserGoals(goalsRes.data || []);
      } catch (e) {
        /* ignore */
      }
    })();
  }, [open, agentId]);

  const handleSavePulse = useCallback(async () => {
    if (!agentId) return;
    setPulseSaving(true);
    try {
      const nextPulse = pulseConfig.pulse_enabled
        ? new Date(Date.now() + pulseConfig.check_in_interval_ms).toISOString()
        : null;
      await supabase
        .from('concilium_agents')
        .update({
          pulse_enabled: pulseConfig.pulse_enabled,
          pulse_mode: pulseConfig.pulse_mode,
          pulse_task_focus: pulseConfig.pulse_task_focus,
          pulse_goal_id: pulseConfig.pulse_goal_id || null,
          autonomous_enabled: pulseConfig.autonomous_enabled,
          check_in_interval_ms: pulseConfig.check_in_interval_ms,
          next_pulse_at: nextPulse,
        })
        .eq('id', agentId);
    } finally {
      setPulseSaving(false);
    }
  }, [agentId, pulseConfig]);

  const handleSaveOsja = useCallback(async () => {
    if (!agentId) return;
    setOsjaSaving(true);
    try {
      await supabase
        .from('agents')
        .update({
          osja_regen_threshold: osjaConfig.osja_regen_threshold,
          osja_regen_max_attempts: osjaConfig.osja_regen_max_attempts,
          osja_learning_enabled: osjaConfig.osja_learning_enabled,
        })
        .eq('id', agentId);
    } finally {
      setOsjaSaving(false);
    }
  }, [agentId, osjaConfig]);

  const INTERVAL_OPTIONS = [
    { label: '1h', value: 3600000 },
    { label: '4h', value: 14400000 },
    { label: '8h', value: 28800000 },
    { label: '12h', value: 43200000 },
    { label: '24h', value: 86400000 },
  ];

  // Load ratings + ratable jobs when dialog opens
  useEffect(() => {
    if (!open || !agentId) {
      setRatings([]);
      setAvgRating({ average: 0, count: 0 });
      setConsiliumRating({ average: 0, count: 0, normalizedStars: 0 });
      setRatingEvents([]);
      setShowRatingForm(false);
      setRatingForm({ rating: 0, comment: '', ratingType: 'individual', requestId: '' });
      setRatableRequests([]);
      return;
    }
    (async () => {
      const [agentRatings, jobs, boardRating, events] = await Promise.all([
        getAgentRatings(agentId),
        getAllJobs().catch(() => []),
        getConsiliumRating(agentId).catch(() => ({ average: 0, count: 0, normalizedStars: 0 })),
        getRatingEvents(agentId).catch(() => []),
      ]);
      setRatings(agentRatings);
      setConsiliumRating(boardRating);
      setRatingEvents(events);
      if (agentRatings.length > 0) {
        const sum = agentRatings.reduce((acc, r) => acc + r.rating, 0);
        setAvgRating({
          average: Math.round((sum / agentRatings.length) * 10) / 10,
          count: agentRatings.length,
        });
      } else {
        setAvgRating({ average: 0, count: 0 });
      }
      const ratedIds = new Set(agentRatings.map((r) => r.request_id).filter(Boolean));
      const completedForAgent = (jobs || []).filter(
        (j) =>
          j.assignedAgentId === agentId &&
          j.status === 'completed' &&
          !ratedIds.has(j.sourceRequestId || j.id)
      );
      setRatableRequests(completedForAgent);
    })();
  }, [open, agentId]);

  const handleSubmitRating = useCallback(async () => {
    if (!agentId || ratingForm.rating === 0 || !ratingForm.requestId) return;
    setRatingSubmitting(true);
    try {
      const result = await submitRating({
        agentId,
        rating: ratingForm.rating,
        comment: ratingForm.comment,
        ratingType: ratingForm.ratingType,
        requestId: ratingForm.requestId,
      });
      if (result) {
        const updated = [result, ...ratings];
        setRatings(updated);
        const sum = updated.reduce((acc, r) => acc + r.rating, 0);
        setAvgRating({
          average: Math.round((sum / updated.length) * 10) / 10,
          count: updated.length,
        });
        setRatingForm({ rating: 0, comment: '', ratingType: 'individual', requestId: '' });
        setShowRatingForm(false);
        setRatableRequests((prev) =>
          prev.filter((j) => (j.sourceRequestId || j.id) !== ratingForm.requestId)
        );
        // The DB trigger appends this rating to the activity log; re-fetch so
        // the new "You" event shows immediately.
        getRatingEvents(agentId)
          .then(setRatingEvents)
          .catch(() => {});
      }
    } finally {
      setRatingSubmitting(false);
    }
  }, [agentId, ratingForm, ratings]);

  const handleDeleteRating = useCallback(
    async (ratingId) => {
      const ok = await deleteRating(ratingId);
      if (ok) {
        const updated = ratings.filter((r) => r.id !== ratingId);
        setRatings(updated);
        if (updated.length > 0) {
          const sum = updated.reduce((acc, r) => acc + r.rating, 0);
          setAvgRating({
            average: Math.round((sum / updated.length) * 10) / 10,
            count: updated.length,
          });
        } else {
          setAvgRating({ average: 0, count: 0 });
        }
      }
    },
    [ratings]
  );

  if (!agent) return null;

  const statusColor = getStatusColor(agent.availability_status, theme);
  const capabilities = Array.isArray(agent.capabilities)
    ? agent.capabilities
    : agent.capabilities
      ? [agent.capabilities]
      : [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 6, pb: 1 }}>
        <AgentAvatar profile={profile} size="small" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
            {agent.role || agent.name || 'Agent'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25 }}>
            {agent.category && (
              <Chip
                size="small"
                label={agent.category}
                variant="outlined"
                sx={{ height: 18, fontSize: '0.62rem' }}
              />
            )}
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ position: 'absolute', right: 8, top: 8 }}>
          <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
        </IconButton>
      </DialogTitle>
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        variant="fullWidth"
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 36,
          '& .MuiTab-root': {
            minHeight: 36,
            fontSize: '0.72rem',
            textTransform: 'none',
            fontWeight: 600,
          },
        }}
      >
        <Tab label="Overview" />
        <Tab label="Profile" />
        <Tab label="Ratings" />
        <Tab label="Pulse" />
        <Tab label="Enhancement" />
      </Tabs>
      <DialogContent sx={{ p: 0 }}>
        {/* ── Tab 0: Overview ─────────────────────────────── */}
        {activeTab === 0 && (
          <Box
            sx={{
              px: 2.5,
              py: 2,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
              gap: 2,
            }}
          >
            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  mb: 1,
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                  letterSpacing: '0.04em',
                  color: 'text.secondary',
                }}
              >
                Agent Details
              </Typography>
              <Stack spacing={1.25}>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Category
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {agent.category || '—'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Connection Type
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {(
                      agent.provider ||
                      agent.connection_type ||
                      DEFAULT_LLM_PROVIDER
                    ).toUpperCase()}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Model
                  </Typography>
                  <Chip
                    size="small"
                    label={agent.model || agent.connection_id || DEFAULT_LLM_MODEL}
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.65rem',
                      height: 22,
                      bgcolor: '#1E88E5',
                      color: '#fff',
                      borderRadius: 1.5,
                    }}
                  />
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    Created
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 500, fontFamily: 'monospace', fontSize: '0.78rem' }}
                  >
                    {formatTimestamp(agent.created_at)}
                  </Typography>
                </Box>
                {agent.added_by && (
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                      Added By
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                      <AppIcon
                        name="PersonOutline"
                        fallback={PersonOutlineIcon}
                        sx={{ fontSize: 16, color: 'text.secondary' }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {agent.added_by.email || 'Manual'}
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Stack>
            </Box>
            <Box>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  mb: 1,
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                  letterSpacing: '0.04em',
                  color: 'text.secondary',
                }}
              >
                Capabilities
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {capabilities.length === 0 ? (
                  <Typography variant="body2" color="text.disabled">
                    None
                  </Typography>
                ) : (
                  capabilities.map((c, i) => (
                    <Chip
                      key={i}
                      size="small"
                      label={c}
                      variant="outlined"
                      sx={{ fontSize: '0.72rem', borderRadius: 1.5 }}
                    />
                  ))
                )}
              </Box>
              {agent.system_prompt && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                    System Prompt
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      fontSize: '0.78rem',
                      mt: 0.25,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {agent.system_prompt}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Reporting Structure */}
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mt: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                <AppIcon
                  name="SupervisedUserCircleOutlined"
                  fallback={SupervisedUserCircleOutlinedIcon}
                  sx={{ fontSize: 16, color: 'info.main' }}
                />
                <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.68rem' }}>
                  Reporting
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.58rem', color: 'text.disabled', fontWeight: 600 }}
                  >
                    Reports To
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.76rem', fontWeight: 600 }}>
                    {agent.reports_to
                      ? agent.reports_to.replace('-', ' ').replace(/^\w/, (c) => c.toUpperCase())
                      : 'Not assigned'}
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.58rem', color: 'text.disabled', fontWeight: 600 }}
                  >
                    Schedule
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.76rem', fontWeight: 600 }}>
                    {(agent.report_schedule || 'every_check_in')
                      .replace(/_/g, ' ')
                      .replace(/^\w/, (c) => c.toUpperCase())}
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Permissions */}
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mt: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                <AppIcon
                  name="SecurityOutlined"
                  fallback={SecurityOutlinedIcon}
                  sx={{ fontSize: 16, color: 'warning.main' }}
                />
                <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.68rem' }}>
                  Permissions
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {(agent.permissions || agent.allowed_actions || []).length > 0 ? (
                  (agent.permissions || agent.allowed_actions || []).map((p) => (
                    <Chip
                      key={p}
                      label={p}
                      size="small"
                      variant="outlined"
                      color={p.includes('write') || p.includes('submit') ? 'warning' : 'info'}
                      sx={{ fontSize: '0.58rem', height: 20, fontWeight: 600 }}
                    />
                  ))
                ) : (
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.disabled', fontStyle: 'italic' }}
                  >
                    No permissions set
                  </Typography>
                )}
              </Box>
            </Paper>

            {/* Connected Libraries (MCP/Composio bindings, per-agent) */}
            <ConnectedLibrariesSection agentId={agent.id || agent.agent_id || agent._supabase_id} />
          </Box>
        )}

        {/* ── Tab 1: Profile ──────────────────────────────── */}
        {activeTab === 1 && (
          <Box sx={{ px: 2.5, py: 2 }}>
            {profile ? (
              <Box>
                {/* Header with avatar and basic info */}
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <AgentAvatar profile={profile} size="large" showRegenerate />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                      {profile.display_name}
                    </Typography>
                    {profile.pronouns && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {profile.pronouns}
                        {profile.age ? `, ${profile.age}` : ''}
                      </Typography>
                    )}
                    <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.5 }}>
                      {profile.job_title}
                      {profile.organization ? ` @ ${profile.organization}` : ''}
                    </Typography>
                    {profile.location && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        <AppIcon
                          name="LocationOnOutlined"
                          fallback={LocationOnOutlinedIcon}
                          sx={{ fontSize: 14, color: 'text.secondary' }}
                        />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {profile.location}
                          {profile.timezone ? ` (${profile.timezone})` : ''}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>

                {/* Bio */}
                {profile.bio && (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      mb: 2,
                      bgcolor: alpha(theme.palette.primary.main, 0.03),
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ fontStyle: 'italic', color: 'text.secondary', lineHeight: 1.5 }}
                    >
                      &ldquo;{profile.bio}&rdquo;
                    </Typography>
                  </Paper>
                )}

                {/* Contact */}
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      mb: 1,
                      textTransform: 'uppercase',
                      fontSize: '0.7rem',
                      letterSpacing: '0.04em',
                      color: 'text.secondary',
                    }}
                  >
                    Contact
                  </Typography>
                  <Stack spacing={0.75}>
                    {profile.email && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AppIcon
                          name="EmailOutlined"
                          fallback={EmailOutlinedIcon}
                          sx={{ fontSize: 16, color: 'text.secondary' }}
                        />
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {profile.email}
                        </Typography>
                      </Box>
                    )}
                    {profile.phone && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AppIcon
                          name="PhoneOutlined"
                          fallback={PhoneOutlinedIcon}
                          sx={{ fontSize: 16, color: 'text.secondary' }}
                        />
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {profile.phone}
                        </Typography>
                      </Box>
                    )}
                    {profile.linkedin_url && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AppIcon
                          name="LinkedIn"
                          fallback={LinkedInIcon}
                          sx={{ fontSize: 16, color: 'text.secondary' }}
                        />
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {profile.linkedin_url}
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                </Box>

                {/* Communication Tone */}
                {profile.communication_tone &&
                  Object.keys(profile.communication_tone).length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 700,
                          mb: 1,
                          textTransform: 'uppercase',
                          fontSize: '0.7rem',
                          letterSpacing: '0.04em',
                          color: 'text.secondary',
                        }}
                      >
                        Communication Style
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                        {Object.entries(profile.communication_tone).map(([key, val]) => (
                          <Chip
                            key={key}
                            size="small"
                            label={`${key}: ${val}`}
                            variant="outlined"
                            sx={{
                              fontSize: '0.68rem',
                              borderRadius: 1.5,
                              textTransform: 'capitalize',
                            }}
                          />
                        ))}
                      </Box>
                    </Box>
                  )}

                {/* Backstory */}
                {profile.backstory && (
                  <Accordion
                    disableGutters
                    elevation={0}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: '8px !important',
                      mb: 1.5,
                      '&::before': { display: 'none' },
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                      sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.7rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'text.secondary',
                        }}
                      >
                        Backstory
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', lineHeight: 1.6, fontSize: '0.8rem' }}
                      >
                        {profile.backstory}
                      </Typography>
                    </AccordionDetails>
                  </Accordion>
                )}

                {/* Message Templates */}
                {Array.isArray(profile.message_templates) &&
                  profile.message_templates.length > 0 && (
                    <Accordion
                      disableGutters
                      elevation={0}
                      sx={{
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: '8px !important',
                        mb: 1.5,
                        '&::before': { display: 'none' },
                      }}
                    >
                      <AccordionSummary
                        expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                        sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}
                      >
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.7rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: 'text.secondary',
                          }}
                        >
                          Message Templates ({profile.message_templates.length})
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ pt: 0 }}>
                        <Stack spacing={1}>
                          {profile.message_templates.map((tpl, i) => (
                            <Paper key={i} variant="outlined" sx={{ p: 1.25, borderRadius: 1.5 }}>
                              <Typography
                                variant="caption"
                                sx={{ fontWeight: 700, color: 'text.secondary' }}
                              >
                                {tpl.name}
                              </Typography>
                              {tpl.subject && (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    display: 'block',
                                    color: 'text.disabled',
                                    fontSize: '0.65rem',
                                  }}
                                >
                                  Subject: {tpl.subject}
                                </Typography>
                              )}
                              <Typography
                                variant="body2"
                                sx={{
                                  mt: 0.5,
                                  fontSize: '0.75rem',
                                  whiteSpace: 'pre-line',
                                  color: 'text.secondary',
                                }}
                              >
                                {tpl.body}
                              </Typography>
                            </Paper>
                          ))}
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  )}

                {/* Behavior Rules */}
                {profile.behavior_rules && Object.keys(profile.behavior_rules).length > 0 && (
                  <Accordion
                    disableGutters
                    elevation={0}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: '8px !important',
                      mb: 1.5,
                      '&::before': { display: 'none' },
                    }}
                  >
                    <AccordionSummary
                      expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                      sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.7rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'text.secondary',
                        }}
                      >
                        Behavior Rules
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0 }}>
                      <Stack spacing={1}>
                        {profile.behavior_rules.reply_delay_min_sec != null && (
                          <Box>
                            <Typography
                              variant="caption"
                              sx={{ color: 'text.disabled', fontWeight: 600 }}
                            >
                              Reply Delay
                            </Typography>
                            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                              {profile.behavior_rules.reply_delay_min_sec}s –{' '}
                              {profile.behavior_rules.reply_delay_max_sec}s
                            </Typography>
                          </Box>
                        )}
                        {Array.isArray(profile.behavior_rules.escalation_rules) &&
                          profile.behavior_rules.escalation_rules.length > 0 && (
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{ color: 'text.disabled', fontWeight: 600 }}
                              >
                                Escalates
                              </Typography>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                                {profile.behavior_rules.escalation_rules.map((r) => (
                                  <Chip
                                    key={r}
                                    size="small"
                                    label={r}
                                    color="warning"
                                    variant="outlined"
                                    sx={{ fontSize: '0.62rem', height: 20 }}
                                  />
                                ))}
                              </Box>
                            </Box>
                          )}
                        {Array.isArray(profile.behavior_rules.topics_to_avoid) &&
                          profile.behavior_rules.topics_to_avoid.length > 0 && (
                            <Box>
                              <Typography
                                variant="caption"
                                sx={{ color: 'text.disabled', fontWeight: 600 }}
                              >
                                Avoids
                              </Typography>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
                                {profile.behavior_rules.topics_to_avoid.map((t) => (
                                  <Chip
                                    key={t}
                                    size="small"
                                    label={t}
                                    color="error"
                                    variant="outlined"
                                    sx={{ fontSize: '0.62rem', height: 20 }}
                                  />
                                ))}
                              </Box>
                            </Box>
                          )}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                )}

                {/* Email Signature */}
                {profile.email_signature && (
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 2 }}>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}
                    >
                      Email Signature
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.72rem',
                        whiteSpace: 'pre-line',
                        color: 'text.secondary',
                      }}
                    >
                      {profile.email_signature}
                    </Typography>
                  </Paper>
                )}

                {/* Chat button */}
                {onChat && (
                  <Button
                    variant="contained"
                    fullWidth
                    startIcon={
                      <AppIcon name="ChatBubbleOutline" fallback={ChatBubbleOutlineIcon} />
                    }
                    onClick={() => onChat(agent)}
                    sx={{ textTransform: 'none', fontWeight: 600, mt: 1 }}
                  >
                    Chat with {profile.display_name || agent.name}
                  </Button>
                )}
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.disabled">
                  No profile configured for this agent yet.
                </Typography>
              </Box>
            )}
          </Box>
        )}

        {/* ── Tab 4: Enhancement (per-organization conditioning) ── */}
        {activeTab === 4 && <AgentEnhancementTab agent={agent} />}

        {/* ── Tab 3: Pulse ────────────────────────────────── */}
        {activeTab === 3 && (
          <Box sx={{ px: 2.5, py: 2 }}>
            <Paper
              variant="outlined"
              sx={{ p: 1.5, borderRadius: 2, gridColumn: { sm: '1 / -1' } }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <AppIcon
                    name="ScheduleOutlined"
                    fallback={ScheduleOutlinedIcon}
                    sx={{ fontSize: 16, color: 'primary.main' }}
                  />
                  <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.68rem' }}>
                    Pulse
                  </Typography>
                </Box>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={pulseConfig.pulse_enabled ? 'on' : 'off'}
                  onChange={(_, v) =>
                    v && setPulseConfig((p) => ({ ...p, pulse_enabled: v === 'on' }))
                  }
                >
                  <ToggleButton
                    value="off"
                    sx={{ fontSize: '0.6rem', textTransform: 'none', px: 1, py: 0.25 }}
                  >
                    Off
                  </ToggleButton>
                  <ToggleButton
                    value="on"
                    sx={{ fontSize: '0.6rem', textTransform: 'none', px: 1, py: 0.25 }}
                  >
                    On
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              <Collapse in={pulseConfig.pulse_enabled}>
                <Stack spacing={1.25}>
                  {/* Interval */}
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{ fontSize: '0.58rem', color: 'text.disabled', fontWeight: 600 }}
                    >
                      Interval
                    </Typography>
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={pulseConfig.check_in_interval_ms}
                      onChange={(_, v) =>
                        v && setPulseConfig((p) => ({ ...p, check_in_interval_ms: v }))
                      }
                      sx={{ display: 'flex', mt: 0.5 }}
                    >
                      {INTERVAL_OPTIONS.map((opt) => (
                        <ToggleButton
                          key={opt.value}
                          value={opt.value}
                          sx={{
                            fontSize: '0.62rem',
                            textTransform: 'none',
                            px: 1.25,
                            py: 0.25,
                            flex: 1,
                          }}
                        >
                          {opt.label}
                        </ToggleButton>
                      ))}
                    </ToggleButtonGroup>
                  </Box>

                  {/* Mode */}
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{ fontSize: '0.58rem', color: 'text.disabled', fontWeight: 600 }}
                    >
                      Mode
                    </Typography>
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={pulseConfig.pulse_mode}
                      onChange={(_, v) => v && setPulseConfig((p) => ({ ...p, pulse_mode: v }))}
                      sx={{ display: 'flex', mt: 0.5 }}
                    >
                      <ToggleButton
                        value="lite"
                        sx={{
                          fontSize: '0.62rem',
                          textTransform: 'none',
                          px: 1.5,
                          py: 0.25,
                          flex: 1,
                        }}
                      >
                        Lite
                      </ToggleButton>
                      <ToggleButton
                        value="full"
                        sx={{
                          fontSize: '0.62rem',
                          textTransform: 'none',
                          px: 1.5,
                          py: 0.25,
                          flex: 1,
                        }}
                      >
                        Full
                      </ToggleButton>
                    </ToggleButtonGroup>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.54rem',
                        color: 'text.disabled',
                        mt: 0.25,
                        display: 'block',
                      }}
                    >
                      {pulseConfig.pulse_mode === 'full'
                        ? 'Consilium evaluates each cycle (keep/discard)'
                        : 'Agent runs, auto-keeps results'}
                    </Typography>
                  </Box>

                  {/* Goal (optional — Consilium auto-assigns if empty) */}
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{ fontSize: '0.58rem', color: 'text.disabled', fontWeight: 600 }}
                    >
                      Goal (optional)
                    </Typography>
                    <FormControl size="small" fullWidth sx={{ mt: 0.5 }}>
                      <Select
                        value={pulseConfig.pulse_goal_id}
                        onChange={(e) =>
                          setPulseConfig((p) => ({ ...p, pulse_goal_id: e.target.value }))
                        }
                        displayEmpty
                        sx={{ fontSize: '0.72rem' }}
                      >
                        <MenuItem value="" sx={{ fontSize: '0.72rem' }}>
                          <em>Auto-assign (Consilium picks)</em>
                        </MenuItem>
                        {userGoals.map((g) => (
                          <MenuItem key={g.id} value={g.id} sx={{ fontSize: '0.72rem' }}>
                            {g.title}{' '}
                            <Chip
                              size="small"
                              label={g.status}
                              sx={{ ml: 0.75, fontSize: '0.5rem', height: 16 }}
                            />
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.54rem',
                        color: 'text.disabled',
                        mt: 0.25,
                        display: 'block',
                      }}
                    >
                      Leave empty to let Consilium auto-assign the best matching goal
                    </Typography>
                  </Box>

                  {/* Task Focus */}
                  <Box>
                    <Typography
                      variant="caption"
                      sx={{ fontSize: '0.58rem', color: 'text.disabled', fontWeight: 600 }}
                    >
                      Task Focus
                    </Typography>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="e.g. Check rank positions, Review pipeline..."
                      value={pulseConfig.pulse_task_focus}
                      onChange={(e) =>
                        setPulseConfig((p) => ({ ...p, pulse_task_focus: e.target.value }))
                      }
                      sx={{ mt: 0.5, '& .MuiInputBase-input': { fontSize: '0.72rem', py: 0.75 } }}
                    />
                  </Box>

                  {/* Autonomous toggle */}
                  <Box
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <AppIcon
                        name="PsychologyOutlined"
                        fallback={PsychologyOutlinedIcon}
                        sx={{ fontSize: 14, color: 'info.main' }}
                      />
                      <Typography variant="caption" sx={{ fontSize: '0.62rem', fontWeight: 600 }}>
                        Autonomous
                      </Typography>
                    </Box>
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={pulseConfig.autonomous_enabled ? 'on' : 'off'}
                      onChange={(_, v) =>
                        v && setPulseConfig((p) => ({ ...p, autonomous_enabled: v === 'on' }))
                      }
                    >
                      <ToggleButton
                        value="off"
                        sx={{ fontSize: '0.58rem', textTransform: 'none', px: 0.75, py: 0.15 }}
                      >
                        Off
                      </ToggleButton>
                      <ToggleButton
                        value="on"
                        sx={{ fontSize: '0.58rem', textTransform: 'none', px: 0.75, py: 0.15 }}
                      >
                        On
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                  {pulseConfig.autonomous_enabled && (
                    <Typography
                      variant="caption"
                      sx={{ fontSize: '0.54rem', color: 'text.disabled', fontStyle: 'italic' }}
                    >
                      Agent gains access to memory, past work history, and self-improves its prompt
                      every 10 cycles
                    </Typography>
                  )}

                  {/* Save button */}
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={handleSavePulse}
                      disabled={pulseSaving}
                      sx={{ fontSize: '0.68rem', textTransform: 'none', px: 2 }}
                    >
                      {pulseSaving ? 'Saving...' : 'Save Pulse Config'}
                    </Button>
                  </Box>
                </Stack>
              </Collapse>
            </Paper>

            {/* ── Quality & Learning (Osja feedback loop) ──────────── */}
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mt: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                <AppIcon
                  name="PsychologyOutlined"
                  fallback={PsychologyOutlinedIcon}
                  sx={{ fontSize: 16, color: 'secondary.main' }}
                />
                <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.68rem' }}>
                  Quality & Learning
                </Typography>
              </Box>
              <Typography
                variant="caption"
                sx={{ fontSize: '0.56rem', color: 'text.disabled', display: 'block', mb: 1 }}
              >
                Controls Osja's feedback loop: auto-regeneration of low-scoring deliverables and
                lesson capture for this agent.
              </Typography>

              <Stack spacing={1.25}>
                {/* Regen threshold */}
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.58rem', color: 'text.disabled', fontWeight: 600 }}
                  >
                    Auto-regen when Osja score is below
                  </Typography>
                  <TextField
                    size="small"
                    type="number"
                    value={osjaConfig.osja_regen_threshold}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      setOsjaConfig((p) => ({ ...p, osja_regen_threshold: v }));
                    }}
                    inputProps={{ min: 0, max: 100, step: 5 }}
                    sx={{
                      mt: 0.5,
                      width: 120,
                      '& .MuiInputBase-input': { fontSize: '0.72rem', py: 0.75 },
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.54rem', color: 'text.disabled', ml: 1 }}
                  >
                    /100 (default 70 — Osja's "competent" tier)
                  </Typography>
                </Box>

                {/* Max attempts */}
                <Box>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.58rem', color: 'text.disabled', fontWeight: 600 }}
                  >
                    Max regen attempts per deliverable
                  </Typography>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={osjaConfig.osja_regen_max_attempts}
                    onChange={(_, v) =>
                      v !== null && setOsjaConfig((p) => ({ ...p, osja_regen_max_attempts: v }))
                    }
                    sx={{ display: 'flex', mt: 0.5 }}
                  >
                    {[0, 1, 2, 3].map((n) => (
                      <ToggleButton
                        key={n}
                        value={n}
                        sx={{
                          fontSize: '0.62rem',
                          textTransform: 'none',
                          px: 1.25,
                          py: 0.25,
                          flex: 1,
                        }}
                      >
                        {n === 0 ? 'Off' : `${n}×`}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.54rem', color: 'text.disabled', mt: 0.25, display: 'block' }}
                  >
                    0 disables auto-regen. Each retry costs one extra LLM call per low-scoring
                    deliverable.
                  </Typography>
                </Box>

                {/* Learning toggle */}
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box>
                    <Typography variant="caption" sx={{ fontSize: '0.62rem', fontWeight: 600 }}>
                      Osja lesson capture
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ fontSize: '0.54rem', color: 'text.disabled', display: 'block' }}
                    >
                      Save upgrade verdicts as lessons so this agent improves over time.
                    </Typography>
                  </Box>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={osjaConfig.osja_learning_enabled ? 'on' : 'off'}
                    onChange={(_, v) =>
                      v && setOsjaConfig((p) => ({ ...p, osja_learning_enabled: v === 'on' }))
                    }
                  >
                    <ToggleButton
                      value="off"
                      sx={{ fontSize: '0.58rem', textTransform: 'none', px: 0.75, py: 0.15 }}
                    >
                      Off
                    </ToggleButton>
                    <ToggleButton
                      value="on"
                      sx={{ fontSize: '0.58rem', textTransform: 'none', px: 0.75, py: 0.15 }}
                    >
                      On
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    size="small"
                    variant="contained"
                    color="secondary"
                    onClick={handleSaveOsja}
                    disabled={osjaSaving}
                    sx={{ fontSize: '0.68rem', textTransform: 'none', px: 2 }}
                  >
                    {osjaSaving ? 'Saving...' : 'Save Quality Config'}
                  </Button>
                </Box>
              </Stack>
            </Paper>
          </Box>
        )}

        {/* ── Tab 2: Ratings ──────────────────────────────── */}
        {activeTab === 2 && (
          <Box sx={{ px: 2.5, py: 2 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1.5,
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                  letterSpacing: '0.04em',
                  color: 'text.secondary',
                }}
              >
                Ratings & Reviews
              </Typography>
              {ratableRequests.length > 0 && (
                <Button
                  size="small"
                  startIcon={
                    <AppIcon name="StarOutline" fallback={StarOutlineIcon} sx={{ fontSize: 14 }} />
                  }
                  onClick={() => setShowRatingForm((p) => !p)}
                  sx={{ fontSize: '0.72rem', textTransform: 'none' }}
                >
                  {showRatingForm ? 'Cancel' : 'Rate this Agent'}
                </Button>
              )}
            </Box>

            {/* Average (user ratings) */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Rating value={avgRating.average} precision={0.1} readOnly size="medium" />
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {avgRating.average > 0 ? `${avgRating.average} / 5` : 'No ratings yet'}
              </Typography>
              {avgRating.count > 0 && (
                <Typography variant="caption" color="text.secondary">
                  ({avgRating.count} review{avgRating.count !== 1 ? 's' : ''})
                </Typography>
              )}
            </Box>

            {/* Consilium rating (AI board) — read-only, 0-10 scale shown as stars/5 */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 1.5,
                p: 1,
                borderRadius: 1.5,
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, 0.2),
              }}
            >
              <AppIcon
                name="GavelOutlined"
                fallback={GavelOutlinedIcon}
                sx={{ fontSize: 16, color: 'primary.main' }}
              />
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: 'primary.main',
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                Consilium
              </Typography>
              <Rating
                value={consiliumRating.normalizedStars}
                precision={0.1}
                readOnly
                size="small"
              />
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {consiliumRating.count > 0
                  ? `${consiliumRating.average} / 10`
                  : 'Not yet evaluated'}
              </Typography>
              {consiliumRating.count > 0 && (
                <Typography variant="caption" color="text.secondary">
                  ({consiliumRating.count} evaluation{consiliumRating.count !== 1 ? 's' : ''})
                </Typography>
              )}
            </Box>

            {/* Rating Form */}
            <Collapse in={showRatingForm}>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1.5 }}>
                <Stack spacing={1.5}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 600, color: 'text.secondary', minWidth: 60 }}
                    >
                      Request
                    </Typography>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={ratingForm.requestId}
                        onChange={(e) =>
                          setRatingForm((p) => ({ ...p, requestId: e.target.value }))
                        }
                        displayEmpty
                        sx={{ fontSize: '0.78rem' }}
                      >
                        <MenuItem value="" disabled>
                          <em>Select completed request</em>
                        </MenuItem>
                        {ratableRequests.map((j) => (
                          <MenuItem
                            key={j.id}
                            value={j.sourceRequestId || j.id}
                            sx={{ fontSize: '0.78rem' }}
                          >
                            {j.description || j.title || j.id} — completed
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 600, color: 'text.secondary', minWidth: 60 }}
                    >
                      Score
                    </Typography>
                    <Rating
                      value={ratingForm.rating}
                      onChange={(_, v) => setRatingForm((p) => ({ ...p, rating: v }))}
                      size="large"
                    />
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 600, color: 'text.secondary', minWidth: 60 }}
                    >
                      Type
                    </Typography>
                    <ToggleButtonGroup
                      size="small"
                      exclusive
                      value={ratingForm.ratingType}
                      onChange={(_, v) => v && setRatingForm((p) => ({ ...p, ratingType: v }))}
                    >
                      <ToggleButton
                        value="individual"
                        sx={{ fontSize: '0.7rem', textTransform: 'none', px: 1.5 }}
                      >
                        Individual
                      </ToggleButton>
                      <ToggleButton
                        value="team"
                        sx={{ fontSize: '0.7rem', textTransform: 'none', px: 1.5 }}
                      >
                        Team
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                  <TextField
                    size="small"
                    multiline
                    minRows={2}
                    maxRows={4}
                    placeholder="Optional comment..."
                    value={ratingForm.comment}
                    onChange={(e) => setRatingForm((p) => ({ ...p, comment: e.target.value }))}
                    sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={
                        ratingForm.rating === 0 || !ratingForm.requestId || ratingSubmitting
                      }
                      onClick={handleSubmitRating}
                      sx={{ fontSize: '0.72rem', textTransform: 'none' }}
                    >
                      {ratingSubmitting ? 'Submitting...' : 'Submit Rating'}
                    </Button>
                  </Box>
                </Stack>
              </Paper>
            </Collapse>

            {/* Reviews list */}
            {ratings.length > 0 ? (
              <Stack spacing={1}>
                {ratings.slice(0, 5).map((r) => (
                  <Paper key={r.id} variant="outlined" sx={{ p: 1.25, borderRadius: 1.5 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Rating value={r.rating} readOnly size="small" />
                        <Chip
                          size="small"
                          label={r.rating_type === 'team' ? 'Team' : 'Individual'}
                          variant="outlined"
                          color={r.rating_type === 'team' ? 'primary' : 'default'}
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary', fontSize: '0.65rem' }}
                        >
                          {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteRating(r.id)}
                          sx={{ p: 0.25 }}
                        >
                          <AppIcon
                            name="DeleteOutline"
                            fallback={DeleteOutlineIcon}
                            sx={{ fontSize: 14, color: 'text.secondary' }}
                          />
                        </IconButton>
                      </Box>
                    </Box>
                    {r.comment && (
                      <Typography
                        variant="body2"
                        sx={{ mt: 0.75, fontSize: '0.78rem', color: 'text.secondary' }}
                      >
                        {r.comment}
                      </Typography>
                    )}
                  </Paper>
                ))}
                {ratings.length > 5 && (
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', textAlign: 'center', display: 'block' }}
                  >
                    +{ratings.length - 5} more reviews
                  </Typography>
                )}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 1 }}>
                No reviews yet
              </Typography>
            )}

            {/* Rating activity log — unified history from both sources */}
            {ratingEvents.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                    letterSpacing: '0.04em',
                    color: 'text.secondary',
                    mb: 1,
                  }}
                >
                  Rating activity
                </Typography>
                <Stack spacing={0.75}>
                  {ratingEvents.slice(0, 8).map((e) => {
                    const isBoard = e.source === 'consilium';
                    const scale = Number(e.rating_scale) || (isBoard ? 10 : 5);
                    const value = Number(e.rating_value) || 0;
                    return (
                      <Box
                        key={e.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          px: 1,
                          py: 0.75,
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <Chip
                          size="small"
                          icon={
                            isBoard ? (
                              <AppIcon
                                name="GavelOutlined"
                                fallback={GavelOutlinedIcon}
                                sx={{ fontSize: 12 }}
                              />
                            ) : (
                              <AppIcon
                                name="StarOutline"
                                fallback={StarOutlineIcon}
                                sx={{ fontSize: 12 }}
                              />
                            )
                          }
                          label={isBoard ? 'Consilium' : 'You'}
                          sx={{
                            height: 20,
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            color: isBoard
                              ? theme.palette.primary.main
                              : theme.palette.text.secondary,
                            bgcolor: isBoard
                              ? alpha(theme.palette.primary.main, 0.12)
                              : alpha(theme.palette.text.primary, 0.06),
                            '& .MuiChip-icon': { color: 'inherit', ml: 0.5 },
                          }}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
                          {value.toFixed(1)} / {scale}
                        </Typography>
                        {e.comment && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {e.comment}
                          </Typography>
                        )}
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.secondary',
                            fontSize: '0.65rem',
                            ml: 'auto',
                            flexShrink: 0,
                          }}
                        >
                          {e.created_at ? new Date(e.created_at).toLocaleDateString() : '—'}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
