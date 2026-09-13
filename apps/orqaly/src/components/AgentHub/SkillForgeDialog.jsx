/**
 * SkillForgeDialog — describe a skill, Forge generates + red-teams it,
 * user previews test report and approves or rejects.
 */
import { useState } from 'react';
import {
  Button,
  TextField,
  Typography,
  Box,
  Chip,
  Alert,
  Stack,
  CircularProgress,
  useTheme,
  alpha,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { forgeSkill, approveForgeSkill } from '../../services/agentSkillsService';
import { SKILL_CATEGORIES } from '../../config/bundledSkills';

import AppIcon from '../icons/AppIcon';

export default function SkillForgeDialog({ open, onClose, onApproved }) {
  const theme = useTheme();
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('ops');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);

  const reset = () => {
    setDescription('');
    setCategory('ops');
    setResult(null);
    setError('');
  };
  const handleClose = () => {
    if (generating || approving) return;
    reset();
    onClose?.();
  };

  const handleGenerate = async () => {
    if (description.trim().length < 10) {
      setError('Description must be at least 10 characters.');
      return;
    }
    setError('');
    setGenerating(true);
    setResult(null);
    try {
      const data = await forgeSkill({ description: description.trim(), category });
      setResult(data);
    } catch (err) {
      setError(err.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async (approve) => {
    if (!result?.skill?.id) return;
    setApproving(true);
    try {
      await approveForgeSkill(result.skill.id, approve);
      onApproved?.(approve);
      handleClose();
    } catch (err) {
      setError(err.message || 'Approval failed');
    } finally {
      setApproving(false);
    }
  };

  const passed = result?.passed === true;
  const stage = result?.stage;
  const redTeam = result?.red_team || [];
  const behaviour = result?.behaviour || [];
  const draft = result?.draft;

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      title="Skill Forge"
      icon={AutoFixHighOutlinedIcon}
      titleAdornment={
        <Chip label="Beta" size="small" color="primary" variant="outlined" sx={{ ml: 1 }} />
      }
      actions={
        <>
          {!result && (
            <>
              <Button onClick={handleClose} disabled={generating}>
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={handleGenerate}
                disabled={generating || description.trim().length < 10}
                startIcon={
                  generating ? (
                    <CircularProgress size={14} />
                  ) : (
                    <AppIcon name="AutoFixHighOutlined" fallback={AutoFixHighOutlinedIcon} />
                  )
                }
              >
                {generating ? 'Generating…' : 'Generate & Test'}
              </Button>
            </>
          )}
          {result && (
            <>
              <Button onClick={reset} disabled={approving}>
                Regenerate
              </Button>
              <Box sx={{ flex: 1 }} />
              {passed ? (
                <>
                  <Button onClick={() => handleApprove(false)} color="error" disabled={approving}>
                    Reject
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => handleApprove(true)}
                    disabled={approving}
                    startIcon={approving ? <CircularProgress size={14} /> : null}
                  >
                    {approving ? 'Saving…' : 'Approve & Save'}
                  </Button>
                </>
              ) : (
                <Button onClick={handleClose} variant="outlined">
                  Close
                </Button>
              )}
            </>
          )}
        </>
      }
    >
      {!result && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Describe the skill you want. The Forge drafts it, runs a red-team suite and a behaviour
            suite, and only persists skills that pass both.
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            label="Skill description"
            placeholder="e.g. Makes the agent ask three clarifying questions before committing to a plan."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            sx={{ mb: 2, ...FORM_FIELD_SX }}
            disabled={generating}
          />
          <FormControl size="small" fullWidth sx={{ mb: 1 }}>
            <InputLabel id="forge-cat">Category</InputLabel>
            <Select
              labelId="forge-cat"
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={generating}
            >
              {SKILL_CATEGORIES.map((c) => (
                <MenuItem key={c.value} value={c.value}>
                  {c.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {error && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {error}
            </Alert>
          )}
          {generating && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2 }}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                Drafting + red-teaming + behaviour-testing…
              </Typography>
            </Box>
          )}
        </>
      )}
      {result && (
        <Box>
          <Alert severity={passed ? 'success' : 'warning'} sx={{ mb: 2 }}>
            {passed
              ? `"${draft?.name || result.skill?.name}" passed both test suites — pending your approval.`
              : `Draft failed at stage: ${stage}. See transcripts below.`}
          </Alert>

          {draft && (
            <Box
              sx={{
                mb: 2,
                p: 2,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.primary.main, 0.06),
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {draft.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {draft.description}
              </Typography>
              <Box
                sx={{
                  mt: 1,
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap',
                  maxHeight: 240,
                  overflow: 'auto',
                }}
              >
                {draft.content}
              </Box>
            </Box>
          )}

          {redTeam.length > 0 && (
            <Accordion defaultExpanded={!passed && stage === 'red-team'}>
              <AccordionSummary
                expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
              >
                <AppIcon
                  name="SecurityOutlined"
                  fallback={SecurityOutlinedIcon}
                  sx={{
                    mr: 1,
                    color: redTeam.every((r) => r.verdict === 'safe')
                      ? 'success.main'
                      : 'error.main',
                  }}
                />
                <Typography variant="subtitle2">
                  Red-team: {redTeam.filter((r) => r.verdict === 'safe').length}/{redTeam.length}{' '}
                  safe
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1}>
                  {redTeam.map((r, i) => (
                    <Box
                      key={i}
                      sx={{
                        p: 1,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: r.verdict === 'safe' ? 'success.main' : 'error.main',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: r.verdict === 'safe' ? 'success.main' : 'error.main',
                        }}
                      >
                        {r.verdict.toUpperCase()}
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '0.78rem', mt: 0.5 }}>
                        <b>Attack:</b> {r.prompt}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.78rem', color: 'text.secondary' }}
                      >
                        <b>Response:</b> {r.response}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}

          {behaviour.length > 0 && (
            <Accordion defaultExpanded={!passed && stage === 'behaviour'}>
              <AccordionSummary
                expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
              >
                <AppIcon
                  name="PsychologyOutlined"
                  fallback={PsychologyOutlinedIcon}
                  sx={{
                    mr: 1,
                    color:
                      behaviour.filter((r) => r.verdict === 'reflects').length >
                      behaviour.length / 2
                        ? 'success.main'
                        : 'warning.main',
                  }}
                />
                <Typography variant="subtitle2">
                  Behaviour: {behaviour.filter((r) => r.verdict === 'reflects').length}/
                  {behaviour.length} reflect intent
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={1}>
                  {behaviour.map((r, i) => (
                    <Box
                      key={i}
                      sx={{
                        p: 1,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: r.verdict === 'reflects' ? 'success.main' : 'warning.main',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          color: r.verdict === 'reflects' ? 'success.main' : 'warning.main',
                        }}
                      >
                        {r.verdict.toUpperCase()}
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '0.78rem', mt: 0.5 }}>
                        <b>Prompt:</b> {r.prompt}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.78rem', color: 'text.secondary' }}
                      >
                        <b>Response:</b> {r.response}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Box>
      )}
    </FormDialog>
  );
}
