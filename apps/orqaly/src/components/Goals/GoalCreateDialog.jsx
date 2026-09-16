import { useState, useCallback, useRef } from 'react';
import {
  TextField,
  Slider,
  Typography,
  Box,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  Collapse,
  useTheme,
  alpha,
} from '@mui/material';
import FormDialog from '../Common/FormDialog';
import Switch from '@mui/material/Switch';
import AutoGraphOutlinedIcon from '@mui/icons-material/AutoGraphOutlined';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import BoltIcon from '@mui/icons-material/Bolt';
import TuneIcon from '@mui/icons-material/Tune';
import SpeedIcon from '@mui/icons-material/Speed';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import GlassIcon from '../icons/GlassIcon';

import { createGoal, createGoalSourceRequestId } from '../../services/goalService';
import ExecutorPicker from './ExecutorPicker';
import { ADVANCED_GOAL_MODE_DESCRIPTION } from './goalModeCopy';
import LoopSwitchBlock from './LoopSwitchBlock';

export default function GoalCreateDialog({ open, onClose, onCreated }) {
  const theme = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState('');
  const [budget, setBudget] = useState(10);
  const [mode, setMode] = useState('simple');
  const [poDepth, setPoDepth] = useState('standard');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [theoryMode, setTheoryMode] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const createIntentRef = useRef(null);

  // Executor assignment
  const [executorType, setExecutorType] = useState('organization');
  const [orgId, setOrgId] = useState(null);
  const [executorId, setExecutorId] = useState(null);
  const [conciliumId, setConciliumId] = useState(null);

  const isAdvanced = mode === 'advanced';

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) return setError('Tell the system what you want to achieve');
    if (!orgId) return setError('Select an organization to handle this goal');
    setLoading(true);
    setError('');
    try {
      const payload = {
        title: title.trim(),
        budget_usd: budget,
        mode,
        po_depth: isAdvanced ? poDepth : 'quick',
        executor_type: executorType,
        org_id: orgId,
        executor_id: executorId,
        concilium_id: conciliumId,
        theory_mode: theoryMode,
        loop_enabled: loopEnabled,
      };
      if (isAdvanced) {
        if (description.trim()) payload.description = description.trim();
        if (requirements.trim()) payload.parsed_requirements = requirements.trim();
      }
      const intentFingerprint = JSON.stringify(payload);
      if (createIntentRef.current?.fingerprint !== intentFingerprint) {
        createIntentRef.current = {
          fingerprint: intentFingerprint,
          sourceRequestId: createGoalSourceRequestId(),
        };
      }
      payload.source_request_id = createIntentRef.current.sourceRequestId;
      const goal = await createGoal(payload);
      createIntentRef.current = null;
      setTitle('');
      setDescription('');
      setRequirements('');
      setBudget(10);
      setMode('simple');
      setPoDepth('standard');
      setTheoryMode(false);
      setLoopEnabled(false);
      setExecutorType('organization');
      setOrgId(null);
      setExecutorId(null);
      setConciliumId(null);
      onCreated?.(goal);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create goal');
    } finally {
      setLoading(false);
    }
  }, [
    title,
    description,
    requirements,
    budget,
    mode,
    isAdvanced,
    poDepth,
    theoryMode,
    loopEnabled,
    executorType,
    orgId,
    executorId,
    conciliumId,
    onCreated,
    onClose,
  ]);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="New Goal"
      headerIcon={
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'primary.main',
          }}
        >
          <GlassIcon name="TrackChanges" fallback={TrackChangesOutlinedIcon} size={22} />
        </Box>
      }
      primaryLabel={loading ? 'Creating...' : 'Launch Goal'}
      onPrimary={handleSubmit}
      primaryDisabled={loading || !title.trim()}
      primaryLoading={loading}
    >
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2, fontSize: '0.8rem' }}>
          {error}
        </Alert>
      )}

      {/* Mode Toggle */}
      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={(_, v) => v && setMode(v)}
        size="small"
        fullWidth
        sx={{ mb: 2 }}
      >
        <ToggleButton value="simple" sx={{ textTransform: 'none', fontSize: '0.8rem', gap: 0.5 }}>
          <GlassIcon name="Bolt" fallback={BoltIcon} size={16} /> Simple
        </ToggleButton>
        <ToggleButton value="advanced" sx={{ textTransform: 'none', fontSize: '0.8rem', gap: 0.5 }}>
          <GlassIcon name="Tune" fallback={TuneIcon} size={16} /> Advanced
        </ToggleButton>
      </ToggleButtonGroup>

      <Box
        sx={{
          mb: 2,
          p: 1,
          borderRadius: 1.5,
          fontSize: '0.7rem',
          color: 'text.secondary',
          bgcolor: alpha(isAdvanced ? theme.palette.warning.main : theme.palette.info.main, 0.05),
          border: '1px solid',
          borderColor: alpha(
            isAdvanced ? theme.palette.warning.main : theme.palette.info.main,
            0.15
          ),
        }}
      >
        {isAdvanced
          ? ADVANCED_GOAL_MODE_DESCRIPTION
          : 'Fast pipeline: quick analysis and automatic team formation, with customer-context and final execution confirmation. Best for simple tasks and low budgets.'}
      </Box>

      {/* Executor assignment */}
      <ExecutorPicker
        executorType={executorType}
        setExecutorType={setExecutorType}
        orgId={orgId}
        setOrgId={setOrgId}
        executorId={executorId}
        setExecutorId={setExecutorId}
        conciliumId={conciliumId}
        setConciliumId={setConciliumId}
      />

      <TextField
        autoFocus
        fullWidth
        label="What do you want to achieve?"
        placeholder="e.g. Earn $5000, Build a marketing strategy, Research competitors..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        multiline
        minRows={2}
        maxRows={4}
        sx={{ mb: 2, '& .MuiInputBase-input': { fontSize: '0.88rem' } }}
      />

      {/* Advanced fields */}
      <Collapse in={isAdvanced}>
        {/* PO Depth selector */}
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 700,
              fontSize: '0.7rem',
              color: 'text.secondary',
              mb: 0.5,
              display: 'block',
            }}
          >
            PO Depth
          </Typography>
          <ToggleButtonGroup
            value={poDepth}
            exclusive
            onChange={(_, v) => v && setPoDepth(v)}
            size="small"
            fullWidth
          >
            <ToggleButton
              value="quick"
              sx={{ textTransform: 'none', fontSize: '0.75rem', gap: 0.5 }}
            >
              <GlassIcon name="Speed" fallback={SpeedIcon} size={14} /> Quick
            </ToggleButton>
            <ToggleButton
              value="standard"
              sx={{ textTransform: 'none', fontSize: '0.75rem', gap: 0.5 }}
            >
              <GlassIcon name="Tune" fallback={TuneIcon} size={14} /> Standard
            </ToggleButton>
            <ToggleButton
              value="expert"
              sx={{ textTransform: 'none', fontSize: '0.75rem', gap: 0.5 }}
            >
              <GlassIcon name="PsychologyOutlined" fallback={PsychologyOutlinedIcon} size={14} />{' '}
              Expert
            </ToggleButton>
          </ToggleButtonGroup>
          <Typography
            variant="caption"
            sx={{ fontSize: '0.6rem', color: 'text.disabled', mt: 0.5, display: 'block' }}
          >
            {poDepth === 'quick' && 'Fast summary PRD. Best for simple goals.'}
            {poDepth === 'standard' &&
              'Full PRD with MoSCoW requirements, success tiers, exit criteria.'}
            {poDepth === 'expert' &&
              'PO asks smart questions first, then generates detailed PRD with user stories, RACI, timeline.'}
          </Typography>
        </Box>

        <TextField
          fullWidth
          label="Detailed description"
          placeholder="Describe what you want in detail — context, target audience, constraints..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          multiline
          minRows={2}
          maxRows={4}
          sx={{ mb: 2, '& .MuiInputBase-input': { fontSize: '0.85rem' } }}
        />
        <TextField
          fullWidth
          label="Requirements & constraints"
          placeholder="Must use specific tools, budget limits, quality standards, deadlines..."
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          multiline
          minRows={2}
          maxRows={3}
          sx={{ mb: 2, '& .MuiInputBase-input': { fontSize: '0.85rem' } }}
        />
      </Collapse>

      <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, fontSize: '0.82rem' }}>
        Budget: ${budget}
      </Typography>
      <Slider
        value={budget}
        onChange={(_, v) => setBudget(v)}
        min={1}
        max={100}
        step={1}
        marks={[
          { value: 1, label: '$1' },
          { value: 25, label: '$25' },
          { value: 50, label: '$50' },
          { value: 100, label: '$100' },
        ]}
        valueLabelDisplay="auto"
        valueLabelFormat={(v) => `$${v}`}
        sx={{ mb: 1.5 }}
      />

      {/* Theory Mode toggle */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1.5,
          borderRadius: 2,
          bgcolor: theoryMode
            ? alpha(theme.palette.info.main, 0.08)
            : alpha(theme.palette.text.primary, 0.03),
          border: '1px solid',
          borderColor: theoryMode ? alpha(theme.palette.info.main, 0.25) : 'divider',
          transition: 'all 0.2s',
        }}
      >
        <GlassIcon
          name="AutoGraphOutlined"
          fallback={AutoGraphOutlinedIcon}
          size={20}
          tone={theoryMode ? theme.palette.info.main : 'neutral'}
        />
        <Box sx={{ flex: 1 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              fontSize: '0.8rem',
              color: theoryMode ? 'info.main' : 'text.primary',
            }}
          >
            Theory Mode
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
            Business projections: revenue, ROI, competitors, action plans (1mo / 3mo / 6mo / 1yr)
          </Typography>
        </Box>
        <Switch
          checked={theoryMode}
          onChange={(e) => setTheoryMode(e.target.checked)}
          size="small"
          color="info"
        />
      </Box>

      {/* Loop switch — autonomous chain of continuation goals */}
      <Box sx={{ mt: 1.5 }}>
        <LoopSwitchBlock value={loopEnabled} onChange={setLoopEnabled} context="create" />
      </Box>
    </FormDialog>
  );
}
