/**
 * MemberDetailDialog — Full member profile with Profile/Core/Activity/Chat tabs.
 * Activity tab uses work-log style with org banner and collapsible accordion sections.
 */
import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  Chip,
  IconButton,
  Button,
  Tooltip,
  alpha,
  useTheme,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  InputAdornment,
  CircularProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  FormControl,
  InputLabel,
  Select,
  Slider,
  Switch,
  Stack,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import BlockIcon from '@mui/icons-material/Block';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import TimelineIcon from '@mui/icons-material/Timeline';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import AgentAvatar from '../AgentHub/AgentAvatar';
import AgentMemoryPanel from '../Common/AgentMemoryPanel';
import { enqueueAndWait } from '../../services/agentJobService';
import { addDocument } from '../../services/knowledgeBaseService';
import {
  MEMBER_PROVIDERS,
  PROVIDER_MODELS,
  resolveMemberLlmPair,
} from '../../services/conciliumMembersService';

import AppIcon from '../icons/AppIcon';

const PROVIDER_COLORS = {
  groq: '#F55036',
  openai: '#10A37F',
  anthropic: '#D4A574',
  deepseek: '#5B6EF5',
  glm: '#1E88E5',
  gemini: '#4285F4',
};
const ROLE_COLORS = {
  chairman: '#7C3AED',
  evaluator: '#2563EB',
  auditor: '#D97706',
  specialist: '#059669',
  observer: '#64748B',
};

const TABS = [
  { id: 'profile', label: 'Profile', icon: DescriptionOutlinedIcon },
  { id: 'core', label: 'Core', icon: SettingsOutlinedIcon },
  { id: 'activity', label: 'Activity', icon: TimelineIcon },
  { id: 'chat', label: 'Chat', icon: ChatOutlinedIcon },
];

export default function MemberDetailDialog({
  member,
  open,
  onClose,
  onEdit,
  onSave,
  onDelete,
  onQuarantine,
  onUnquarantine,
  board,
  isDark,
}) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState('profile');
  const [actionsAnchor, setActionsAnchor] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [autoSave, setAutoSave] = useState(false);
  // Core-tab inline edit state. Hydrated from `member` whenever the dialog
  // opens onto a different member; resets on Discard or Save.
  const initialEditForm = () => {
    const llm = resolveMemberLlmPair({ provider: member?.provider, model: member?.model });
    return {
      ...llm,
      temperature: member?.temperature ?? 0.7,
      maxTokens: member?.maxTokens ?? 2048,
      resume: member?.resume || '',
    };
  };
  const [editForm, setEditForm] = useState(initialEditForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Reset chat + rehydrate edit form when the dialog switches members
  useEffect(() => {
    setChatMessages([]);
    setChatInput('');
    setChatLoading(false);
    setActiveTab('profile');
    setEditForm(initialEditForm());
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  const memberProvVal =
    typeof member?.provider === 'object' ? member?.provider?.value : member?.provider;
  const memberModelVal = typeof member?.model === 'object' ? member?.model?.value : member?.model;
  const memberLlm = resolveMemberLlmPair({ provider: memberProvVal, model: memberModelVal });
  const isDirty =
    !!member &&
    (editForm.provider !== memberLlm.provider ||
      editForm.model !== memberLlm.model ||
      Number(editForm.temperature) !== Number(member?.temperature ?? 0.7) ||
      Number(editForm.maxTokens) !== Number(member?.maxTokens ?? 2048) ||
      (editForm.resume || '') !== (member?.resume || ''));

  const handleProviderChange = (nextProvider) => {
    const models = PROVIDER_MODELS[nextProvider] || [];
    setEditForm((f) => ({ ...f, provider: nextProvider, model: models[0]?.value || '' }));
  };

  const handleDiscard = () => {
    setEditForm(initialEditForm());
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!member || !isDirty || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        provider: editForm.provider,
        model: editForm.model,
        temperature: Number(editForm.temperature),
        maxTokens: Number(editForm.maxTokens),
        resume: editForm.resume,
      };
      if (typeof onSave === 'function') {
        await onSave(member.id, payload);
      }
    } catch (err) {
      setSaveError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const userMsg = { role: 'user', content: text };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    try {
      const roleV = typeof member.role === 'object' ? member.role?.value : member.role;
      const provV = typeof member.provider === 'object' ? member.provider?.value : member.provider;
      const modelV = typeof member.model === 'object' ? member.model?.value : member.model;
      const llm = resolveMemberLlmPair({ provider: provV, model: modelV });
      const systemPrompt = [
        `You are ${member.name}, a ${roleV} on the "${board?.name || 'Consilium'}" evaluation board.`,
        member.resume ? `Your background: ${member.resume}` : '',
        member.skills?.length ? `Your skills: ${member.skills.join(', ')}.` : '',
        `You work as a ${roleV} — respond in character with expertise and a friendly, human-like tone.`,
        'Be concise but helpful. Use your knowledge to assist the user. If asked about your evaluations or board work, answer based on your role and abilities.',
      ]
        .filter(Boolean)
        .join('\n');
      const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));
      const result = await enqueueAndWait({
        type: 'run-llm',
        prompt: text,
        systemPrompt,
        provider: llm.provider,
        model: llm.model,
        temperature: member.temperature ?? 0.7,
        maxTokens: member.maxTokens ?? 2048,
        history,
        memory: { owner_type: 'agent', owner_id: member.id },
      });
      const reply =
        result?.result?.content ||
        result?.result?.message ||
        result?.error ||
        'No response received.';

      // Auto-save conversation to agent memory
      if (autoSave) {
        try {
          await addDocument({
            title: `Chat — ${new Date().toLocaleDateString()}`,
            content: `User: ${text}\n${member.name}: ${reply}`.slice(0, 5000),
            content_type: 'conversation',
            owner_type: 'agent',
            owner_id: member.id,
            source: 'auto-save',
            category: 'conversation',
            tags: ['auto-memory', 'chat'],
          });
        } catch {
          /* non-critical */
        }
      }
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply, name: member.name },
      ]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message}`, name: 'System' },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  if (!member) return null;

  const roleVal = typeof member.role === 'object' ? member.role?.value : member.role;
  const provVal = typeof member.provider === 'object' ? member.provider?.value : member.provider;
  const modelVal = typeof member.model === 'object' ? member.model?.value : member.model;
  const roleColor = ROLE_COLORS[roleVal] || '#888';
  const provColor = PROVIDER_COLORS[provVal] || '#888';

  const accSx = {
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: '10px !important',
    '&:before': { display: 'none' },
    bgcolor: 'transparent',
    boxShadow: 'none',
    '&.Mui-expanded': { m: '0 0 8px 0' },
    m: '0 0 8px 0',
  };
  const accSumSx = {
    minHeight: 42,
    '& .MuiAccordionSummary-content': { m: '8px 0', gap: 1, alignItems: 'center' },
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      scroll="paper"
      slotProps={{ paper: { sx: { borderRadius: 3, maxHeight: '90vh' } } }}
    >
      {/* ===== Header ===== */}
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
        <AgentAvatar profile={{ display_name: member.name }} size="medium" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              lineHeight: 1.2,
            }}
          >
            {member.name}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.03em' }}
          >
            {roleVal} &middot; {board?.name || 'Board'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Tooltip title="Long-Term Memory">
            <IconButton
              size="small"
              onClick={() => setMemoryOpen(true)}
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
            >
              <AppIcon
                name="MenuBookOutlined"
                fallback={MenuBookOutlinedIcon}
                sx={{ fontSize: 16 }}
              />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={onClose}>
            <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Box>
      {/* ===== Tabs ===== */}
      <Box
        sx={{ display: 'flex', gap: 0, borderBottom: '1px solid', borderColor: 'divider', px: 3 }}
      >
        {TABS.map((tab) => (
          <Box
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 2,
              py: 1.25,
              cursor: 'pointer',
              borderBottom: '2px solid',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderColor: activeTab === tab.id ? '#34d399' : 'transparent',
              color: activeTab === tab.id ? '#34d399' : 'text.secondary',
              transition: 'all 0.2s',
              '&:hover': { color: 'text.primary' },
            }}
          >
            <AppIcon fallback={tab.icon} sx={{ fontSize: 16 }} /> {tab.label}
          </Box>
        ))}
      </Box>
      <DialogContent sx={{ p: 0 }}>
        {/* ===== PROFILE TAB ===== */}
        {activeTab === 'profile' && (
          <Box sx={{ p: 3 }}>
            {/* Quote */}
            {member.resume && (
              <Box
                sx={{
                  p: 2,
                  bgcolor: alpha(theme.palette.text.primary, 0.03),
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: alpha(theme.palette.divider, 0.5),
                  mb: 2.5,
                  fontStyle: 'italic',
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ color: 'text.secondary', lineHeight: 1.6, fontSize: '0.82rem' }}
                >
                  &ldquo;{member.resume}&rdquo;
                </Typography>
              </Box>
            )}

            {/* About / Impact grid */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, mb: 2.5 }}>
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: 'text.secondary',
                    fontSize: '0.65rem',
                  }}
                >
                  About
                </Typography>
                {[
                  ['Role', roleVal],
                  ['Provider', provVal],
                  ['Board', board?.name || '—'],
                  ['Model', modelVal || 'Default'],
                ].map(([label, value]) => (
                  <Box
                    key={label}
                    sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
                    >
                      {label}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'capitalize' }}
                    >
                      {value}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Box>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: 'text.secondary',
                    fontSize: '0.65rem',
                  }}
                >
                  Performance
                </Typography>
                {[
                  ['Evaluations', member.totalEvaluations || 0],
                  ['Avg Time', member.avgResponseTimeMs ? `${member.avgResponseTimeMs}ms` : '—'],
                  ['Avg Cost', `$${member.avgCostUsd?.toFixed(4) || '0.0000'}`],
                  ['Temperature', member.temperature ?? 0.7],
                ].map(([label, value]) => (
                  <Box
                    key={label}
                    sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
                    >
                      {label}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
                      {value}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>

            {/* Action buttons */}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5 }}>
              <Button
                fullWidth
                variant="contained"
                onClick={() => setActiveTab('chat')}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  borderRadius: 2,
                  bgcolor: '#34d399',
                  color: '#0a0a0f',
                  '&:hover': { bgcolor: '#2dd4a0' },
                }}
                startIcon={<AppIcon name="ChatOutlined" fallback={ChatOutlinedIcon} />}
              >
                Chat
              </Button>
              <Button
                fullWidth
                variant="outlined"
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  borderRadius: 2,
                  borderColor: '#34d399',
                  color: '#34d399',
                }}
                startIcon={<AppIcon name="PersonOutline" fallback={PersonOutlineIcon} />}
              >
                Assign
              </Button>
            </Box>

            {/* Skills */}
            {member.skills?.length > 0 && (
              <Box sx={{ mb: 2.5 }}>
                <Typography
                  variant="overline"
                  sx={{
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: 'text.secondary',
                    fontSize: '0.65rem',
                  }}
                >
                  Abilities & Skills
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
                  {member.skills.map((s) => (
                    <Chip
                      key={s}
                      label={s}
                      size="small"
                      sx={{
                        height: 26,
                        fontSize: '0.7rem',
                        fontWeight: 500,
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        bgcolor: alpha(theme.palette.text.primary, 0.03),
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}

            {/* Metrics cards */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mb: 2 }}>
              {[
                ['Evaluations', member.totalEvaluations || 0, null],
                [
                  'Avg Time',
                  member.avgResponseTimeMs ? `${member.avgResponseTimeMs}ms` : '—',
                  member.avgResponseTimeMs && member.avgResponseTimeMs < 1500
                    ? 'success.main'
                    : null,
                ],
                [
                  'Cost/Eval',
                  `$${member.avgCostUsd?.toFixed(3) || '0.000'}`,
                  member.avgCostUsd && member.avgCostUsd < 0.005 ? 'success.main' : null,
                ],
                ['Max Tokens', member.maxTokens || 2048, null],
              ].map(([label, value, color]) => (
                <Box
                  key={label}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.5),
                    bgcolor: alpha(theme.palette.text.primary, 0.02),
                    textAlign: 'center',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      fontSize: '0.58rem',
                      display: 'block',
                      mb: 0.25,
                    }}
                  >
                    {label}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 800, fontSize: '1rem', color: color || 'text.primary' }}
                  >
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Backstory collapsible */}
            <Accordion sx={accSx}>
              <AccordionSummary
                expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                sx={accSumSx}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'text.secondary',
                  }}
                >
                  Backstory
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
                <Typography
                  variant="body2"
                  sx={{ color: 'text.secondary', lineHeight: 1.6, fontSize: '0.78rem' }}
                >
                  {member.resume || 'No backstory available for this member.'}
                </Typography>
              </AccordionDetails>
            </Accordion>
          </Box>
        )}

        {/* ===== CORE TAB ===== */}
        {activeTab === 'core' && (
          <Box sx={{ p: 3 }}>
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'text.secondary',
                fontSize: '0.65rem',
                display: 'block',
                mb: 1.5,
              }}
            >
              Model & Provider
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Provider</InputLabel>
                <Select
                  label="Provider"
                  value={editForm.provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  {MEMBER_PROVIDERS.map((p) => (
                    <MenuItem key={p.value} value={p.value}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: PROVIDER_COLORS[p.value] || '#888',
                          }}
                        />
                        {p.label}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: 1.4 }}>
                <InputLabel>Model</InputLabel>
                <Select
                  label="Model"
                  value={editForm.model}
                  onChange={(e) => setEditForm((f) => ({ ...f, model: e.target.value }))}
                >
                  {(PROVIDER_MODELS[editForm.provider] || []).map((m) => (
                    <MenuItem key={m.value} value={m.value}>
                      {m.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ mb: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontSize: '0.7rem', display: 'block', mb: 0.5 }}
                >
                  Temperature:{' '}
                  <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    {Number(editForm.temperature).toFixed(2)}
                  </Box>
                </Typography>
                <Slider
                  size="small"
                  value={Number(editForm.temperature)}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(_, v) => setEditForm((f) => ({ ...f, temperature: v }))}
                  sx={{ color: '#34d399' }}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontSize: '0.7rem', display: 'block', mb: 0.5 }}
                >
                  Max Tokens:{' '}
                  <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    {editForm.maxTokens}
                  </Box>
                </Typography>
                <Slider
                  size="small"
                  value={Number(editForm.maxTokens)}
                  min={256}
                  max={32000}
                  step={256}
                  onChange={(_, v) => setEditForm((f) => ({ ...f, maxTokens: v }))}
                  sx={{ color: '#34d399' }}
                />
              </Box>
            </Stack>

            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'text.secondary',
                fontSize: '0.65rem',
                display: 'block',
                mt: 3,
                mb: 1.5,
              }}
            >
              Performance Metrics
            </Typography>
            {[
              ['Total Evaluations', member.totalEvaluations || 0],
              [
                'Avg Response Time',
                member.avgResponseTimeMs ? `${member.avgResponseTimeMs}ms` : '—',
              ],
              ['Avg Cost', `$${member.avgCostUsd?.toFixed(4) || '0.0000'}`],
              ['Success Rate', member.totalEvaluations ? '—' : '—'],
            ].map(([label, value]) => (
              <Box
                key={label}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  py: 0.75,
                  borderBottom: '1px solid',
                  borderColor: alpha(theme.palette.divider, 0.3),
                }}
              >
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  {label}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, fontSize: '0.75rem', fontFamily: 'monospace' }}
                >
                  {String(value)}
                </Typography>
              </Box>
            ))}

            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'text.secondary',
                fontSize: '0.65rem',
                display: 'block',
                mt: 3,
                mb: 1.5,
              }}
            >
              System Prompt / Resume
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={6}
              maxRows={16}
              value={editForm.resume}
              onChange={(e) => setEditForm((f) => ({ ...f, resume: e.target.value }))}
              placeholder="System prompt / resume describing this member's role, expertise, and tone."
              slotProps={{
                input: { sx: { fontFamily: 'monospace', fontSize: '0.78rem', lineHeight: 1.55 } },
              }}
            />

            {saveError && (
              <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mt: 1.5 }}>
                {saveError}
              </Typography>
            )}
          </Box>
        )}

        {/* ===== ACTIVITY TAB (Work Log Style) ===== */}
        {activeTab === 'activity' && (
          <Box sx={{ p: 3 }}>
            {/* Accent gradient */}
            <Box
              sx={{
                height: 2,
                background: 'linear-gradient(90deg, #34d399, #818cf8, #a78bfa)',
                borderRadius: 1,
                mb: 2,
              }}
            />

            {/* Organization banner */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1.5,
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                border: '1px solid',
                borderColor: alpha(theme.palette.primary.main, 0.12),
                borderRadius: 2.5,
                mb: 2,
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AppIcon
                  name="BusinessOutlined"
                  fallback={BusinessOutlinedIcon}
                  sx={{ fontSize: 18, color: 'primary.main' }}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.82rem' }}>
                  Board Member
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
                  {board?.name || 'Consilium Board'}
                </Typography>
              </Box>
              <Chip
                label={board?.name || 'Board'}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.6rem',
                  fontWeight: 600,
                  bgcolor: alpha('#7C3AED', 0.12),
                  color: '#a78bfa',
                }}
              />
            </Box>

            {/* Accordion: Evaluations */}
            <Accordion defaultExpanded sx={accSx}>
              <AccordionSummary
                expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                sx={accSumSx}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '7px',
                    bgcolor: alpha('#60a5fa', 0.12),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AppIcon
                    name="AssessmentOutlined"
                    fallback={AssessmentOutlinedIcon}
                    sx={{ fontSize: 15, color: '#60a5fa' }}
                  />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                  Evaluations
                </Typography>
                <Chip
                  label={`${member.totalEvaluations || 0} total`}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    bgcolor: alpha('#34d399', 0.12),
                    color: '#34d399',
                  }}
                />
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
                <ActivityLogItem
                  icon={
                    <AppIcon
                      name="AssessmentOutlined"
                      fallback={AssessmentOutlinedIcon}
                      sx={{ fontSize: 13 }}
                    />
                  }
                  iconColor="#60a5fa"
                  title={`${member.totalEvaluations || 0} evaluations processed`}
                  desc={`Average response time: ${member.avgResponseTimeMs || '—'}ms. Average cost: $${member.avgCostUsd?.toFixed(4) || '0.0000'}.`}
                  tags={[{ label: 'Evaluation', color: '#60a5fa' }]}
                  time="ongoing"
                  theme={theme}
                />
              </AccordionDetails>
            </Accordion>

            {/* Accordion: Goals */}
            <Accordion sx={accSx}>
              <AccordionSummary
                expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                sx={accSumSx}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '7px',
                    bgcolor: alpha('#fbbf24', 0.12),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AppIcon
                    name="FlagOutlined"
                    fallback={FlagOutlinedIcon}
                    sx={{ fontSize: 15, color: '#fbbf24' }}
                  />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                  Goals
                </Typography>
                <Chip
                  label="—"
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    bgcolor: alpha('#fbbf24', 0.12),
                    color: '#fbbf24',
                  }}
                />
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  No goals tracked for this member yet.
                </Typography>
              </AccordionDetails>
            </Accordion>

            {/* Accordion: AI Agent Interactions */}
            <Accordion sx={accSx}>
              <AccordionSummary
                expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                sx={accSumSx}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '7px',
                    bgcolor: alpha('#a78bfa', 0.12),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AppIcon
                    name="SmartToyOutlined"
                    fallback={SmartToyOutlinedIcon}
                    sx={{ fontSize: 15, color: '#a78bfa' }}
                  />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                  AI Agent Interactions
                </Typography>
                <Chip
                  label="—"
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    bgcolor: alpha('#a78bfa', 0.12),
                    color: '#a78bfa',
                  }}
                />
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  No agent interactions recorded yet.
                </Typography>
              </AccordionDetails>
            </Accordion>

            {/* Accordion: Organization */}
            <Accordion sx={accSx}>
              <AccordionSummary
                expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                sx={accSumSx}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '7px',
                    bgcolor: alpha('#f472b6', 0.12),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AppIcon
                    name="BusinessOutlined"
                    fallback={BusinessOutlinedIcon}
                    sx={{ fontSize: 15, color: '#f472b6' }}
                  />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                  Organization
                </Typography>
                <Chip
                  label="—"
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    bgcolor: alpha('#f472b6', 0.12),
                    color: '#f472b6',
                  }}
                />
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  No organization changes recorded.
                </Typography>
              </AccordionDetails>
            </Accordion>

            {/* Accordion: Communications */}
            <Accordion sx={accSx}>
              <AccordionSummary
                expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                sx={accSumSx}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '7px',
                    bgcolor: alpha('#34d399', 0.12),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AppIcon
                    name="ForumOutlined"
                    fallback={ForumOutlinedIcon}
                    sx={{ fontSize: 15, color: '#34d399' }}
                  />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                  Communications
                </Typography>
                <Chip
                  label="—"
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    bgcolor: alpha('#34d399', 0.12),
                    color: '#34d399',
                  }}
                />
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  No communications recorded yet.
                </Typography>
              </AccordionDetails>
            </Accordion>

            {/* Accordion: Security Events */}
            {member.quarantined && (
              <Accordion sx={accSx}>
                <AccordionSummary
                  expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
                  sx={accSumSx}
                >
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '7px',
                      bgcolor: alpha('#f87171', 0.12),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AppIcon
                      name="SecurityOutlined"
                      fallback={SecurityOutlinedIcon}
                      sx={{ fontSize: 15, color: '#f87171' }}
                    />
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                    Security Events
                  </Typography>
                  <Chip
                    label="1 alert"
                    size="small"
                    sx={{
                      height: 22,
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      bgcolor: alpha('#f87171', 0.12),
                      color: '#f87171',
                    }}
                  />
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
                  <ActivityLogItem
                    icon={
                      <AppIcon
                        name="SecurityOutlined"
                        fallback={SecurityOutlinedIcon}
                        sx={{ fontSize: 13 }}
                      />
                    }
                    iconColor="#f87171"
                    title="Member quarantined"
                    desc="This member has been quarantined due to detected issues."
                    tags={[
                      { label: 'Security', color: '#f87171' },
                      { label: 'Quarantine', color: '#fbbf24' },
                    ]}
                    time="active"
                    theme={theme}
                  />
                </AccordionDetails>
              </Accordion>
            )}
          </Box>
        )}

        {/* ===== CHAT TAB ===== */}
        {activeTab === 'chat' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', height: 420 }}>
            {/* Messages area */}
            <Box
              sx={{
                flex: 1,
                overflowY: 'auto',
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
              }}
            >
              {chatMessages.length === 0 && !chatLoading && (
                <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  <AppIcon
                    name="ChatOutlined"
                    fallback={ChatOutlinedIcon}
                    sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Chat with {member.name}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                    Ask about their role, evaluations, or anything related to the board.
                  </Typography>
                </Box>
              )}
              {chatMessages.map((msg, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    gap: 1,
                  }}
                >
                  {msg.role === 'assistant' && (
                    <AgentAvatar
                      profile={{ display_name: member.name }}
                      size="small"
                      sx={{ mt: 0.5 }}
                    />
                  )}
                  <Box
                    sx={{
                      maxWidth: '78%',
                      p: 1.5,
                      borderRadius: 2.5,
                      bgcolor:
                        msg.role === 'user'
                          ? alpha('#34d399', 0.15)
                          : alpha(theme.palette.text.primary, 0.06),
                      borderBottomRightRadius: msg.role === 'user' ? 4 : undefined,
                      borderBottomLeftRadius: msg.role === 'assistant' ? 4 : undefined,
                    }}
                  >
                    {msg.role === 'assistant' && (
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: '#34d399',
                          display: 'block',
                          mb: 0.25,
                          fontSize: '0.65rem',
                        }}
                      >
                        {msg.name || member.name}
                      </Typography>
                    )}
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: '0.82rem',
                        lineHeight: 1.55,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {msg.content}
                    </Typography>
                  </Box>
                </Box>
              ))}
              {chatLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AgentAvatar profile={{ display_name: member.name }} size="small" />
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 2.5,
                      bgcolor: alpha(theme.palette.text.primary, 0.06),
                      borderBottomLeftRadius: 4,
                    }}
                  >
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                      <CircularProgress size={14} thickness={5} sx={{ color: '#34d399' }} />
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontSize: '0.72rem' }}
                      >
                        {member.name} is typing...
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )}
              <div ref={chatEndRef} />
            </Box>

            {/* Input area */}
            <Box
              sx={{
                p: 1.5,
                borderTop: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                gap: 1,
                alignItems: 'center',
              }}
            >
              <TextField
                fullWidth
                size="small"
                placeholder={`Message ${member.name}...`}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                disabled={chatLoading}
                multiline
                maxRows={3}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2.5 } }}
              />
              <IconButton
                onClick={sendMessage}
                disabled={!chatInput.trim() || chatLoading}
                sx={{
                  bgcolor: chatInput.trim() ? '#34d399' : alpha(theme.palette.text.primary, 0.06),
                  color: chatInput.trim() ? '#0a0a0f' : 'text.disabled',
                  '&:hover': { bgcolor: '#2dd4a0' },
                  width: 38,
                  height: 38,
                }}
              >
                <AppIcon name="Send" fallback={SendIcon} sx={{ fontSize: 18 }} />
              </IconButton>
              <Tooltip title={autoSave ? 'Auto-save ON' : 'Auto-save OFF'}>
                <Switch
                  size="small"
                  checked={autoSave}
                  onChange={(e) => setAutoSave(e.target.checked)}
                  sx={{
                    ml: 0.5,
                    '& .MuiSwitch-thumb': { width: 14, height: 14 },
                    '& .MuiSwitch-switchBase': { p: '4px' },
                  }}
                />
              </Tooltip>
            </Box>
          </Box>
        )}
      </DialogContent>
      {/* ===== Footer ===== */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 2,
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Button
          size="small"
          variant="outlined"
          endIcon={<AppIcon name="ArrowDropDown" fallback={ArrowDropDownIcon} />}
          onClick={(e) => setActionsAnchor(e.currentTarget)}
          sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, fontSize: '0.75rem' }}
        >
          Actions
        </Button>
        <Menu
          anchorEl={actionsAnchor}
          open={Boolean(actionsAnchor)}
          onClose={() => setActionsAnchor(null)}
          slotProps={{
            paper: { sx: { minWidth: 200, bgcolor: 'background.paper', backgroundImage: 'none' } },
          }}
        >
          <MenuItem
            onClick={() => {
              setActionsAnchor(null);
              onEdit();
              onClose();
            }}
          >
            <ListItemIcon>
              <AppIcon name="EditOutlined" fallback={EditOutlinedIcon} fontSize="small" />
            </ListItemIcon>
            <ListItemText>Edit</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={() => {
              setActionsAnchor(null);
            }}
          >
            <ListItemIcon>
              <AppIcon
                name="AssessmentOutlined"
                fallback={AssessmentOutlinedIcon}
                fontSize="small"
              />
            </ListItemIcon>
            <ListItemText>Reports</ListItemText>
          </MenuItem>
          <Divider sx={{ my: 0.5 }} />
          {member.quarantined ? (
            <MenuItem
              onClick={() => {
                setActionsAnchor(null);
                onUnquarantine();
                onClose();
              }}
            >
              <ListItemIcon>
                <AppIcon
                  name="CheckCircleOutline"
                  fallback={CheckCircleOutlineIcon}
                  fontSize="small"
                  sx={{ color: 'success.main' }}
                />
              </ListItemIcon>
              <ListItemText>Unquarantine</ListItemText>
            </MenuItem>
          ) : (
            <MenuItem
              onClick={() => {
                setActionsAnchor(null);
                onQuarantine();
                onClose();
              }}
            >
              <ListItemIcon>
                <AppIcon
                  name="Block"
                  fallback={BlockIcon}
                  fontSize="small"
                  sx={{ color: 'warning.main' }}
                />
              </ListItemIcon>
              <ListItemText>Quarantine</ListItemText>
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              setActionsAnchor(null);
              onDelete();
              onClose();
            }}
          >
            <ListItemIcon>
              <AppIcon
                name="DeleteOutline"
                fallback={DeleteOutlineIcon}
                fontSize="small"
                sx={{ color: 'error.main' }}
              />
            </ListItemIcon>
            <ListItemText sx={{ color: 'error.main' }}>Remove</ListItemText>
          </MenuItem>
        </Menu>
        <Box sx={{ flex: 1 }} />
        {isDirty && (
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AppIcon name="Undo" fallback={UndoIcon} sx={{ fontSize: 16 }} />}
              onClick={handleDiscard}
              disabled={saving}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, fontSize: '0.75rem' }}
            >
              Discard
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={
                saving ? (
                  <CircularProgress size={14} thickness={5} sx={{ color: '#0a0a0f' }} />
                ) : (
                  <AppIcon name="SaveOutlined" fallback={SaveOutlinedIcon} sx={{ fontSize: 16 }} />
                )
              }
              onClick={handleSave}
              disabled={saving}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2,
                fontSize: '0.75rem',
                px: 2.5,
                bgcolor: '#34d399',
                color: '#0a0a0f',
                '&:hover': { bgcolor: '#2dd4a0' },
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        )}
        {!isDirty && (
          <Button
            size="small"
            variant="contained"
            onClick={onClose}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 2,
              fontSize: '0.75rem',
              px: 2.5,
            }}
          >
            Close
          </Button>
        )}
      </Box>
      {/* Agent Memory Panel */}
      <AgentMemoryPanel
        ownerType="agent"
        ownerId={member?.id}
        ownerName={member?.name}
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
      />
    </Dialog>
  );
}

/** Reusable activity log item row */
function ActivityLogItem({ icon, iconColor, title, desc, tags, time, theme }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.25,
        py: 1,
        borderBottom: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.3),
        '&:last-child': { borderBottom: 'none' },
      }}
    >
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: '7px',
          bgcolor: alpha(iconColor, 0.12),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: iconColor,
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.78rem', mb: 0.25 }}>
          {title}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', lineHeight: 1.4, fontSize: '0.7rem' }}
        >
          {desc}
        </Typography>
        {tags?.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
            {tags.map((t) => (
              <Chip
                key={t.label}
                label={t.label}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.55rem',
                  fontWeight: 600,
                  bgcolor: alpha(t.color, 0.12),
                  color: t.color,
                }}
              />
            ))}
          </Box>
        )}
      </Box>
      <Typography
        variant="caption"
        sx={{ color: 'text.disabled', fontSize: '0.62rem', whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        {time}
      </Typography>
    </Box>
  );
}
