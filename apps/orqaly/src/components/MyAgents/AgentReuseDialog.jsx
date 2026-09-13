import { useState, useMemo, useCallback } from 'react';
import {
  Button,
  TextField,
  Box,
  Typography,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  Collapse,
  FormControl,
  Select,
  MenuItem,
  useTheme,
  alpha,
  CircularProgress,
} from '@mui/material';
import FormDialog from '../Common/FormDialog';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { scoreComplexity, recommendDelegation } from '../../services/pipelineService';
import { estimateCost } from '../../services/myAgentsService';
import { createRequest } from '../../services/requestService';

import AppIcon from '../icons/AppIcon';

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];
const PRIORITY_COLORS = { low: 'default', medium: 'info', high: 'warning', urgent: 'error' };

export default function AgentReuseDialog({
  open,
  onClose,
  agent,
  isTeam = false,
  teamMembers = [],
  onSubmitted,
}) {
  const theme = useTheme();
  const [requestText, setRequestText] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assignMode, setAssignMode] = useState('individual'); // individual | team
  const [selectedMember, setSelectedMember] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);

  const complexity = useMemo(() => {
    if (!requestText.trim()) return null;
    return scoreComplexity(requestText, priority);
  }, [requestText, priority]);

  const delegation = useMemo(() => {
    if (!complexity || !isTeam) return null;
    return recommendDelegation(complexity.tier, teamMembers);
  }, [complexity, isTeam, teamMembers]);

  const cost = useMemo(() => {
    if (!complexity || !agent) return null;
    return estimateCost(agent, complexity.tier);
  }, [complexity, agent]);

  const tierColor = {
    simple: theme.palette.success.main,
    standard: theme.palette.warning.main,
    complex: theme.palette.error.main,
  };

  const tierLabel = { simple: 'Quick task', standard: 'Moderate', complex: 'Complex' };

  const handleSubmit = useCallback(async () => {
    if (!requestText.trim() || !agent) return;
    setSubmitting(true);
    try {
      const agentId = agent.agentId || agent.id;
      const req = await createRequest({
        requestText,
        parsedPriority: priority,
        parsedCategory: agent.category || null,
        resultAgentId: isTeam && assignMode === 'team' ? null : selectedMember || agentId,
        teamId: isTeam ? agent.teamId || agent.agentId : null,
      });
      if (req) {
        onSubmitted?.(req);
        handleClose();
      }
    } catch (e) {
      console.error('[AgentReuseDialog] submit failed:', e);
    } finally {
      setSubmitting(false);
    }
  }, [requestText, priority, agent, isTeam, assignMode, selectedMember, onSubmitted]);

  const handleClose = useCallback(() => {
    setRequestText('');
    setPriority('medium');
    setAssignMode('individual');
    setSelectedMember('');
    setShowPrevious(false);
    onClose();
  }, [onClose]);

  if (!agent) return null;

  const recentJobs = agent.recentJobs || [];

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title={`New request for ${agent.agentName || agent.name || 'Agent'}`}
      icon={isTeam ? GroupsOutlinedIcon : SmartToyOutlinedIcon}
      primaryLabel={submitting ? 'Sending…' : 'Send Request'}
      onPrimary={handleSubmit}
      primaryDisabled={
        !requestText.trim() ||
        submitting ||
        (isTeam && assignMode === 'individual' && !selectedMember)
      }
      primaryLoading={submitting}
    >
      {/* Agent banner */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1.5,
          mb: 2,
          borderRadius: 2,
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          border: '1px solid',
          borderColor: alpha(theme.palette.primary.main, 0.12),
        }}
      >
        {isTeam ? (
          <AppIcon
            name="GroupsOutlined"
            fallback={GroupsOutlinedIcon}
            sx={{ fontSize: 24, color: 'primary.main' }}
          />
        ) : (
          <AppIcon
            name="SmartToyOutlined"
            fallback={SmartToyOutlinedIcon}
            sx={{ fontSize: 24, color: 'primary.main' }}
          />
        )}
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {agent.agentName || agent.name}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
            {agent.role && (
              <Chip
                size="small"
                label={agent.role}
                variant="outlined"
                sx={{ fontSize: '0.6rem', height: 16 }}
              />
            )}
            {(agent.capabilities || []).slice(0, 3).map((c, i) => (
              <Chip
                key={i}
                size="small"
                label={c}
                variant="outlined"
                sx={{ fontSize: '0.6rem', height: 16 }}
              />
            ))}
          </Box>
        </Box>
      </Box>
      {/* Team assignment toggle */}
      {isTeam && teamMembers.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}
          >
            Assignment
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={assignMode}
            onChange={(_, v) => v && setAssignMode(v)}
            sx={{ mb: 1 }}
          >
            <ToggleButton value="team" sx={{ fontSize: '0.72rem', textTransform: 'none' }}>
              Whole team
            </ToggleButton>
            <ToggleButton value="individual" sx={{ fontSize: '0.72rem', textTransform: 'none' }}>
              Pick member
            </ToggleButton>
          </ToggleButtonGroup>
          {assignMode === 'individual' && (
            <FormControl size="small" fullWidth>
              <Select
                value={selectedMember}
                onChange={(e) => setSelectedMember(e.target.value)}
                displayEmpty
                sx={{ fontSize: '0.78rem' }}
              >
                <MenuItem value="" disabled>
                  <em>Select team member</em>
                </MenuItem>
                {teamMembers.map((m) => (
                  <MenuItem
                    key={m.id || m.agent_id}
                    value={m.id || m.agent_id}
                    sx={{ fontSize: '0.78rem' }}
                  >
                    {m.role || m.name || m.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      )}
      {/* Request text */}
      <TextField
        fullWidth
        multiline
        minRows={3}
        maxRows={6}
        placeholder="What would you like this agent to do?"
        value={requestText}
        onChange={(e) => setRequestText(e.target.value)}
        sx={{ mb: 1.5, '& .MuiInputBase-input': { fontSize: '0.85rem' } }}
      />
      {/* Priority */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
          Priority
        </Typography>
        {PRIORITY_OPTIONS.map((p) => (
          <Chip
            key={p}
            label={p}
            size="small"
            color={priority === p ? PRIORITY_COLORS[p] : 'default'}
            variant={priority === p ? 'filled' : 'outlined'}
            onClick={() => setPriority(p)}
            sx={{ fontSize: '0.68rem', textTransform: 'capitalize', cursor: 'pointer' }}
          />
        ))}
      </Box>
      {/* Complexity chip + delegation recommendation + cost */}
      {complexity && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label={tierLabel[complexity.tier]}
            sx={{
              fontSize: '0.68rem',
              fontWeight: 700,
              bgcolor: alpha(tierColor[complexity.tier], 0.12),
              color: tierColor[complexity.tier],
              border: '1px solid',
              borderColor: alpha(tierColor[complexity.tier], 0.3),
            }}
          />
          {delegation && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {delegation.reason}
            </Typography>
          )}
          {cost && (
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', ml: 'auto', fontWeight: 600 }}
            >
              Est. ${cost.min.toFixed(2)} – ${cost.max.toFixed(2)}
            </Typography>
          )}
        </Box>
      )}
      {/* Previous requests */}
      {recentJobs.length > 0 && (
        <Box>
          <Button
            size="small"
            onClick={() => setShowPrevious((p) => !p)}
            endIcon={
              showPrevious ? (
                <AppIcon name="ExpandLess" fallback={ExpandLessIcon} />
              ) : (
                <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />
              )
            }
            sx={{ fontSize: '0.72rem', textTransform: 'none', color: 'text.secondary', px: 0 }}
          >
            Previous requests ({recentJobs.length})
          </Button>
          <Collapse in={showPrevious}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
              {recentJobs.map((j) => (
                <Chip
                  key={j.id}
                  label={j.description || j.id}
                  size="small"
                  variant="outlined"
                  onClick={() => setRequestText(j.description || '')}
                  sx={{
                    fontSize: '0.68rem',
                    justifyContent: 'flex-start',
                    cursor: 'pointer',
                    maxWidth: '100%',
                  }}
                />
              ))}
            </Box>
          </Collapse>
        </Box>
      )}
    </FormDialog>
  );
}
