/**
 * Calibration Wizard - walks the user through 6 generated samples (one per
 * deliverable category) and captures their comments. Comments are weighted
 * 2× heavier than Osja's auto-detected failure modes during synthesis.
 *
 * Usage: opened from the Library Universe tab via a "Run calibration" button.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  LinearProgress,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Alert,
  Snackbar,
  Chip,
  Grid,
  Link,
  alpha,
  useTheme,
} from '@mui/material';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import {
  startCalibration,
  loadCalibrationSamples,
  saveSampleComment,
  synthesizeCalibration,
  findLatestCalibrationRun,
  getCalibrationMode,
  previewCommentImpact,
} from '../../services/calibrationService';
import FormDialog from '../../components/Common/FormDialog';
import ToolSelector from './ToolSelector';
import {
  getDefaultEnabledTool,
  listToolsForDeliverable,
} from '../../../shared/deliverableToolsCatalog';

import AppIcon from '../../components/icons/AppIcon';

const STAGE_INIT = 'init'; // before user clicks start
const STAGE_GENERATING = 'generating'; // job running, samples not ready
const STAGE_REVIEWING = 'reviewing'; // walking through samples
const STAGE_SYNTHESIZING = 'synthesizing'; // criteria being written
const STAGE_DONE = 'done';
const STAGE_ERROR = 'error';

/**
 * Click-to-load iframe wrapper for Cloudflare-deployed landing pages.
 * Loading the iframe immediately after deploy sometimes hits a DNS race
 * (the workers.dev subdomain takes a few seconds to become routable).
 * Defaulting to a click-to-load button avoids the race AND gives the user
 * an explicit "Open in new tab" path that always works.
 */
function SitePreview({ url, label }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {!loaded && (
        <Button
          size="medium"
          variant="contained"
          color="primary"
          onClick={() => setLoaded(true)}
          startIcon={
            <AppIcon
              name="VisibilityOutlined"
              fallback={VisibilityOutlinedIcon}
              sx={{ fontSize: 16 }}
            />
          }
          sx={{ textTransform: 'none', fontSize: '0.75rem' }}
        >
          Load live preview
        </Button>
      )}
      {loaded && (
        <Box
          component="iframe"
          src={url}
          title={label}
          loading="lazy"
          sx={{
            width: '100%',
            height: 220,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 0.5,
            bgcolor: '#fff',
            display: 'block',
          }}
        />
      )}
      <Link
        href={url}
        target="_blank"
        rel="noopener"
        sx={{ fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
      >
        Open in new tab <AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 12 }} />
      </Link>
    </Box>
  );
}

/**
 * Render a real artifact (Cloudflare site / Stability image / jsPDF deck)
 * inline. Falls back to text for unsupported categories or on tool failure.
 */
function ArtifactRenderer({ artifact, fallbackText, label }) {
  if (!artifact || artifact.kind === 'text') {
    const text = artifact?.text || fallbackText || '';
    return (
      <Typography
        variant="body2"
        sx={{
          whiteSpace: 'pre-wrap',
          fontSize: '0.7rem',
          lineHeight: 1.4,
          maxHeight: 220,
          overflow: 'auto',
        }}
      >
        {text}
      </Typography>
    );
  }

  if (artifact.kind === 'image') {
    return (
      <Box>
        <Box
          component="img"
          src={artifact.url}
          alt={label}
          sx={{
            width: '100%',
            maxHeight: 200,
            objectFit: 'contain',
            borderRadius: 0.5,
            display: 'block',
            mb: 0.5,
          }}
        />
        <Link
          href={artifact.url}
          target="_blank"
          rel="noopener"
          sx={{ fontSize: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
        >
          Open full size <AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 11 }} />
        </Link>
      </Box>
    );
  }

  if (artifact.kind === 'site') {
    return <SitePreview url={artifact.url} label={label} />;
  }

  if (artifact.kind === 'pdf') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0.75 }}>
        <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
          {artifact.summary || 'Slide deck'}
          {artifact.slideCount ? ` · ${artifact.slideCount} slides` : ''}
        </Typography>
        <Button
          size="medium"
          variant="contained"
          color="primary"
          href={artifact.url}
          target="_blank"
          rel="noopener"
          startIcon={<AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 16 }} />}
          sx={{ textTransform: 'none', fontSize: '0.78rem' }}
        >
          Open PDF
        </Button>
      </Box>
    );
  }

  return (
    <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
      Unknown artifact type
    </Typography>
  );
}

export default function CalibrationWizard({
  open,
  onClose,
  onComplete,
  organizationId = null,
  organizationName = null,
}) {
  const theme = useTheme();
  const [stage, setStage] = useState(STAGE_INIT);
  const [calibrationRunId, setCalibrationRunId] = useState(null);
  const [samples, setSamples] = useState([]);
  const [activeStep, setActiveStep] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [snack, setSnack] = useState(null);
  // Iteration loop state - per-step, indexed by activeStep
  // iterations[i] = [{ comment, improvedText, artifact_after, at }, ...]
  const [iterations, setIterations] = useState({});
  // lockedSteps: Set of step indices marked "OK locked in"
  const [lockedSteps, setLockedSteps] = useState(new Set());
  // selectedTool: per-step user pick from the deliverable tools catalog
  // selectedTool[stepIdx] = 'html-browserless' (or any other enabled tool id)
  const [selectedTool, setSelectedTool] = useState({});

  // Reset state every time the dialog opens
  useEffect(() => {
    if (open) {
      setStage(STAGE_INIT);
      setCalibrationRunId(null);
      setSamples([]);
      setActiveStep(0);
      setComment('');
      setError(null);
      setPreviewing(false);
      setIterations({});
      setLockedSteps(new Set());
      setSelectedTool({});
    }
  }, [open, organizationId]);

  // When stepping to a new sample, prefill the comment box from the latest
  // iteration if any, otherwise from the saved user_comment, otherwise blank.
  // Also pre-select the default enabled tool for this category if the user
  // hasn't already picked one for this step.
  useEffect(() => {
    if (stage === STAGE_REVIEWING && samples[activeStep]) {
      const stepIters = iterations[activeStep] || [];
      const latest = stepIters[stepIters.length - 1];
      if (latest) {
        setComment(latest.comment || '');
      } else {
        setComment(samples[activeStep].metadata?.user_comment || '');
      }

      // Pre-select default tool if available and not yet picked
      const dType = samples[activeStep].metadata?.deliverable_type;
      if (dType && !selectedTool[activeStep]) {
        const defaultTool = getDefaultEnabledTool(dType);
        if (defaultTool) {
          setSelectedTool((prev) => ({ ...prev, [activeStep]: defaultTool.id }));
        }
      }
    }
    // intentionally not depending on `iterations` to avoid prefill loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, activeStep, samples]);

  const handleStart = useCallback(async () => {
    setStage(STAGE_GENERATING);
    setError(null);

    let id = null;
    try {
      const mode = await getCalibrationMode(organizationId).catch(() => null);
      id = mode?.mode === 'comment' ? mode.active_run_id || null : null;
      if (!id) {
        const result = await startCalibration({
          costPreference: 'free_first',
          organizationId,
        });
        id = result.calibrationRunId;
      }
    } catch (startErr) {
      // The HTTP request may have timed out at the proxy/browser layer even
      // though the server-side job kept running. Try to recover by finding the
      // most recent calibration run for this user.
      try {
        id = await findLatestCalibrationRun(organizationId);
      } catch {
        // ignore - fall through to error
      }
      if (!id) {
        setError(`${startErr.message}. No partial run found to recover.`);
        setStage(STAGE_ERROR);
        return;
      }
    }

    try {
      setCalibrationRunId(id);
      // Poll for samples - the job may still be writing them. Up to 10 tries × 2s.
      let loaded = [];
      for (let attempt = 0; attempt < 10; attempt++) {
        loaded = await loadCalibrationSamples(id, organizationId);
        if (loaded.length >= 6) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (loaded.length === 0)
        throw new Error('Samples did not appear in time. Try again in a moment.');
      setSamples(loaded);
      setStage(STAGE_REVIEWING);
    } catch (err) {
      setError(err.message);
      setStage(STAGE_ERROR);
    }
  }, [organizationId]);

  const handleBack = useCallback(() => {
    if (activeStep > 0) setActiveStep(activeStep - 1);
  }, [activeStep]);

  // "Iterate" - runs preview, appends to iterations[activeStep], doesn't advance
  const handleIterate = useCallback(async () => {
    const current = samples[activeStep];
    if (!current) return;
    if (!comment.trim()) {
      setSnack({ severity: 'info', message: 'Type a comment first to iterate on this sample.' });
      return;
    }
    const stepIters = iterations[activeStep] || [];
    const nextIterationNum = stepIters.length + 1;
    const toolId = selectedTool[activeStep] || null;

    setPreviewing(true);
    try {
      const { improvedDescription, artifact_after } = await previewCommentImpact(
        current.id,
        comment,
        nextIterationNum,
        toolId,
        organizationId
      );
      setIterations((prev) => ({
        ...prev,
        [activeStep]: [
          ...(prev[activeStep] || []),
          {
            comment,
            improvedText: improvedDescription,
            artifact_after,
            tool_id: toolId,
            at: new Date().toISOString(),
          },
        ],
      }));
    } catch (err) {
      setSnack({ severity: 'error', message: err.message });
    } finally {
      setPreviewing(false);
    }
  }, [samples, activeStep, comment, iterations, selectedTool, organizationId]);

  // "OK, locked in" - two-step behavior:
  //   - If the user has a comment but hasn't iterated yet → run an iteration
  //     first so they SEE the impact of their comment, don't advance.
  //   - If the user has already iterated (or skipped with empty comment) →
  //     save and advance.
  // This makes Iterate effectively optional - clicking the primary button
  // alone will produce a result and require confirmation before moving on.
  const handleLockAndAdvance = useCallback(async () => {
    const current = samples[activeStep];
    if (!current) return;

    const stepIters = iterations[activeStep] || [];
    const hasIteration = stepIters.length > 0;
    const hasComment = comment.trim().length > 0;

    // Auto-iterate on first click if user typed a comment but hasn't seen
    // the AFTER result yet.
    if (hasComment && !hasIteration) {
      const nextIterationNum = 1;
      const toolId = selectedTool[activeStep] || null;
      setPreviewing(true);
      try {
        const { improvedDescription, artifact_after } = await previewCommentImpact(
          current.id,
          comment,
          nextIterationNum,
          toolId,
          organizationId
        );
        setIterations((prev) => ({
          ...prev,
          [activeStep]: [
            ...(prev[activeStep] || []),
            {
              comment,
              improvedText: improvedDescription,
              artifact_after,
              tool_id: toolId,
              at: new Date().toISOString(),
            },
          ],
        }));
        setSnack({
          severity: 'info',
          message:
            'Showing the AFTER result. Click again to lock in and move on, or refine your comment and click Apply.',
        });
      } catch (err) {
        setSnack({ severity: 'error', message: err.message });
      } finally {
        setPreviewing(false);
      }
      return; // don't advance yet - user must click again
    }

    // Normal advance path
    try {
      await saveSampleComment(current.id, comment, organizationId);
      const next = [...samples];
      next[activeStep] = {
        ...current,
        metadata: { ...current.metadata, user_comment: comment || null },
      };
      setSamples(next);
      setLockedSteps((prev) => {
        const newSet = new Set(prev);
        newSet.add(activeStep);
        return newSet;
      });

      if (activeStep < samples.length - 1) {
        setActiveStep(activeStep + 1);
      } else {
        setStage(STAGE_SYNTHESIZING);
        try {
          await synthesizeCalibration(calibrationRunId, organizationId);
          setStage(STAGE_DONE);
        } catch (synErr) {
          setError(synErr.message);
          setStage(STAGE_ERROR);
        }
      }
    } catch (err) {
      setSnack({ severity: 'error', message: err.message });
    }
  }, [samples, activeStep, comment, calibrationRunId, iterations, selectedTool, organizationId]);

  const handleClose = useCallback(() => {
    if (stage === STAGE_GENERATING || stage === STAGE_SYNTHESIZING) return; // block close mid-job
    if (stage === STAGE_DONE && onComplete) onComplete();
    onClose();
  }, [stage, onClose, onComplete]);

  const current = samples[activeStep];

  const footerActions = (() => {
    if (stage === STAGE_INIT) {
      return (
        <>
          <Button onClick={handleClose}>Cancel</Button>
          <Button variant="contained" onClick={handleStart}>
            Start calibration
          </Button>
        </>
      );
    }
    if (stage === STAGE_REVIEWING) {
      return (
        <>
          <Button onClick={handleBack} disabled={activeStep === 0 || previewing}>
            Back
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button
            onClick={handleIterate}
            disabled={previewing || !comment.trim()}
            variant="outlined"
            color="primary"
            startIcon={
              <AppIcon
                name="VisibilityOutlined"
                fallback={VisibilityOutlinedIcon}
                sx={{ fontSize: 16 }}
              />
            }
            sx={{ textTransform: 'none' }}
          >
            {(() => {
              if (previewing) return 'Regenerating…';
              const stepIters = iterations[activeStep] || [];
              return stepIters.length > 0
                ? `Apply again (${stepIters.length})`
                : 'Apply my comment';
            })()}
          </Button>
          <Button variant="contained" onClick={handleLockAndAdvance} disabled={previewing}>
            {(() => {
              const stepIters = iterations[activeStep] || [];
              const hasComment = comment.trim().length > 0;
              if (hasComment && stepIters.length === 0) return 'Apply & preview';
              return activeStep < samples.length - 1 ? 'Lock in & next' : 'Lock in & synthesize';
            })()}
          </Button>
        </>
      );
    }
    if (stage === STAGE_DONE || stage === STAGE_ERROR) {
      return (
        <Button variant="contained" onClick={handleClose}>
          Close
        </Button>
      );
    }
    return null;
  })();

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title="Library Calibration"
      subtitle={`Teach Osja your taste in 6 samples${organizationName ? ` for ${organizationName}` : ''}. Comments are the highest-value signal.`}
      icon={AutoFixHighOutlinedIcon}
      maxWidth="md"
      disableEscapeKeyDown={stage === STAGE_GENERATING || stage === STAGE_SYNTHESIZING}
      hideFooter={stage === STAGE_GENERATING || stage === STAGE_SYNTHESIZING}
      actions={footerActions}
      footerJustify={stage === STAGE_REVIEWING ? 'flex-start' : 'flex-end'}
    >
      {stage === STAGE_INIT && (
        <Box sx={{ py: 2 }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            The system will generate one sample for each of 6 deliverable categories (landing pages,
            presentations, banners, documents, tables, code). For each sample, you'll see the output
            and a comment box. Your comments shape the quality criteria that get injected into every
            future goal.
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            Estimated time: ~10 minutes. Estimated cost: ~$3 in LLM calls. Free tools are preferred
            during sample generation.
          </Alert>
          <Typography variant="caption" color="text.secondary">
            You can skip any sample (no comment) and Osja will fall back to its own analysis.
            Comments are weighted 2× heavier than auto-detection.
          </Typography>
        </Box>
      )}
      {stage === STAGE_GENERATING && (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <LinearProgress sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary">
            Generating 6 calibration samples… this takes about 30 seconds.
          </Typography>
        </Box>
      )}
      {stage === STAGE_REVIEWING && current && (
        <Box>
          <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 2 }}>
            {samples.map((s, idx) => (
              <Step key={s.id} completed={lockedSteps.has(idx)}>
                <StepLabel sx={{ '& .MuiStepLabel-label': { fontSize: '0.7rem' } }}>
                  {s.metadata?.label || s.metadata?.deliverable_type}
                </StepLabel>
              </Step>
            ))}
          </Stepper>

          {/* Sample header */}
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
              Sample {activeStep + 1} of {samples.length}: {current.metadata?.label}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', fontStyle: 'italic', fontSize: '0.7rem' }}
            >
              Prompt: {current.metadata?.sample_prompt}
            </Typography>
          </Box>

          {/* Audit details - always visible */}
          <Paper
            variant="outlined"
            sx={{ p: 1.5, mb: 1.5, bgcolor: alpha(theme.palette.info.main, 0.04) }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                fontSize: '0.65rem',
                textTransform: 'uppercase',
                color: 'text.secondary',
                display: 'block',
                mb: 0.75,
              }}
            >
              Audit details
            </Typography>

            {/* Library alignment assessment - mini-Osja read on this sample */}
            {current.metadata?.library_alignment &&
              (() => {
                const la = current.metadata.library_alignment;
                let alignColor = theme.palette.text.disabled;
                let alignLabel = 'Not scored';
                if (la.score != null) {
                  if (la.score >= 95) {
                    alignColor = theme.palette.success.main;
                    alignLabel = 'Library-grade';
                  } else if (la.score >= 85) {
                    alignColor = theme.palette.primary.main;
                    alignLabel = 'Strong';
                  } else if (la.score >= 70) {
                    alignColor = theme.palette.warning.main;
                    alignLabel = 'Competent';
                  } else {
                    alignColor = theme.palette.error.main;
                    alignLabel = 'Significant gaps';
                  }
                }
                return (
                  <Box
                    sx={{
                      mb: 1,
                      p: 1,
                      borderRadius: 0.5,
                      bgcolor: alpha(alignColor, 0.06),
                      border: `1px solid ${alpha(alignColor, 0.25)}`,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
                      {la.score != null && (
                        <Box
                          sx={{
                            minWidth: 40,
                            height: 40,
                            borderRadius: 1,
                            bgcolor: alpha(alignColor, 0.15),
                            color: alignColor,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '0.95rem',
                            flexShrink: 0,
                          }}
                        >
                          {la.score}
                        </Box>
                      )}
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.7rem',
                            color: alignColor,
                            textTransform: 'uppercase',
                            display: 'block',
                          }}
                        >
                          Library alignment · {alignLabel}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.72rem',
                            lineHeight: 1.4,
                            color: 'text.primary',
                            mt: 0.25,
                          }}
                        >
                          {la.summary}
                        </Typography>
                      </Box>
                    </Box>
                    {la.gaps && la.gaps.length > 0 && (
                      <Box sx={{ mt: 0.5, pl: la.score != null ? 6 : 0 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            fontSize: '0.6rem',
                            color: 'text.secondary',
                            textTransform: 'uppercase',
                            display: 'block',
                            mb: 0.25,
                          }}
                        >
                          Specific gaps
                        </Typography>
                        <Box
                          component="ul"
                          sx={{
                            pl: 2,
                            m: 0,
                            '& li': {
                              fontSize: '0.68rem',
                              lineHeight: 1.4,
                              mb: 0.15,
                              color: 'text.secondary',
                            },
                          }}
                        >
                          {la.gaps.map((gap, i) => (
                            <li key={i}>{gap}</li>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                );
              })()}

            {/* Library anchors compared against */}
            {(current.metadata?.library_anchors || []).length > 0 && (
              <Box sx={{ mb: 0.75 }}>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.65rem', color: 'text.secondary', mr: 0.75 }}
                >
                  Library anchors:
                </Typography>
                {(current.metadata.library_anchors || []).map((a) => (
                  <Chip
                    key={a.id}
                    size="small"
                    label={`${a.brand || a.title} ${a.quality_score}`}
                    sx={{ height: 18, fontSize: '0.65rem', mr: 0.5, mb: 0.25 }}
                  />
                ))}
              </Box>
            )}

            {/* Tool chosen */}
            {(() => {
              const toolName = current.metadata?.tool_name || 'unknown';
              const toolTier = current.metadata?.tool_tier || 'unknown';
              const toolEst = current.metadata?.tool_quality_estimate;
              const estSuffix = toolEst ? ` · est ${toolEst}/100` : '';
              let chipColor = 'default';
              if (toolTier === 'free') chipColor = 'success';
              else if (toolTier === 'free-trial') chipColor = 'warning';
              return (
                <Box sx={{ mb: 0.5 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.65rem', color: 'text.secondary', mr: 0.75 }}
                  >
                    Tool chosen:
                  </Typography>
                  <Chip
                    size="small"
                    label={`${toolName} · ${toolTier}${estSuffix}`}
                    color={chipColor}
                    sx={{ height: 18, fontSize: '0.65rem' }}
                  />
                </Box>
              );
            })()}

            {/* Alternatives ranked */}
            {(current.metadata?.tool_alternatives_considered || []).length > 0 && (
              <Box sx={{ mb: 0.5 }}>
                <Typography
                  variant="caption"
                  sx={{ fontSize: '0.65rem', color: 'text.secondary', mr: 0.75 }}
                >
                  Alternatives:
                </Typography>
                {(current.metadata.tool_alternatives_considered || []).map((alt) => (
                  <Chip
                    key={alt.id}
                    size="small"
                    label={`${alt.name} ${alt.quality_estimate}`}
                    variant="outlined"
                    sx={{ height: 16, fontSize: '0.6rem', mr: 0.25, mb: 0.25 }}
                  />
                ))}
              </Box>
            )}

            {/* LLM */}
            <Typography
              variant="caption"
              sx={{ fontSize: '0.65rem', color: 'text.secondary', display: 'block' }}
            >
              LLM: {current.metadata?.llm_provider || 'unknown'} {current.metadata?.llm_model || ''}
            </Typography>

            {/* Full LLM prompt - collapsible <details> so it doesn't dominate */}
            {current.metadata?.llm_user_prompt && (
              <Box
                component="details"
                sx={{
                  mt: 0.5,
                  '& summary': { cursor: 'pointer', fontSize: '0.65rem', color: 'text.secondary' },
                }}
              >
                <Box component="summary">Show full LLM prompt</Box>
                <Box
                  sx={{
                    mt: 0.5,
                    p: 1,
                    bgcolor: 'background.paper',
                    borderRadius: 0.5,
                    fontFamily: 'monospace',
                    fontSize: '0.65rem',
                    whiteSpace: 'pre-wrap',
                    maxHeight: 120,
                    overflow: 'auto',
                  }}
                >
                  <strong>System:</strong>
                  {'\n'}
                  {current.metadata.llm_system_prompt}
                  {'\n\n'}
                  <strong>User:</strong>
                  {'\n'}
                  {current.metadata.llm_user_prompt}
                </Box>
              </Box>
            )}
          </Paper>

          {/* Tool selector - only rendered for categories that have a tool catalog */}
          {listToolsForDeliverable(current.metadata?.deliverable_type).length > 0 && (
            <ToolSelector
              deliverableType={current.metadata.deliverable_type}
              value={selectedTool[activeStep] || null}
              onChange={(toolId) => setSelectedTool((prev) => ({ ...prev, [activeStep]: toolId }))}
            />
          )}

          {/* Three-column comparison: ANCHOR | BEFORE | AFTER */}
          <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
            {/* ANCHOR */}
            <Grid item xs={12} md={4}>
              <Paper
                variant="outlined"
                sx={{ p: 1.25, height: '100%', bgcolor: alpha(theme.palette.success.main, 0.04) }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.65rem',
                      textTransform: 'uppercase',
                      color: 'success.main',
                    }}
                  >
                    Anchor (library)
                  </Typography>
                </Box>
                {(() => {
                  const anchor = (current.metadata?.library_anchors || [])[0];
                  if (!anchor) {
                    return (
                      <Typography
                        variant="caption"
                        color="text.disabled"
                        sx={{ fontSize: '0.7rem', fontStyle: 'italic' }}
                      >
                        No library anchor available for this category.
                      </Typography>
                    );
                  }
                  return (
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mb: 0.5 }}>
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 700, fontSize: '0.75rem' }}
                            noWrap
                          >
                            {anchor.brand || anchor.title}
                          </Typography>
                          {anchor.brand && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontSize: '0.65rem' }}
                            >
                              {anchor.title}
                            </Typography>
                          )}
                        </Box>
                        <Box
                          sx={{
                            minWidth: 32,
                            height: 32,
                            borderRadius: 1,
                            bgcolor: alpha(theme.palette.success.main, 0.12),
                            color: 'success.main',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '0.8rem',
                          }}
                        >
                          {anchor.quality_score}
                        </Box>
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: '0.7rem',
                          lineHeight: 1.4,
                          color: 'text.secondary',
                          maxHeight: 160,
                          overflow: 'auto',
                        }}
                      >
                        {anchor.what_makes_it_great}
                      </Typography>
                      {anchor.asset_url && (
                        <Link
                          href={anchor.asset_url}
                          target="_blank"
                          rel="noopener"
                          sx={{
                            mt: 0.75,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.25,
                            fontSize: '0.65rem',
                          }}
                        >
                          View live{' '}
                          <AppIcon
                            name="OpenInNew"
                            fallback={OpenInNewIcon}
                            sx={{ fontSize: 11 }}
                          />
                        </Link>
                      )}
                    </Box>
                  );
                })()}
              </Paper>
            </Grid>

            {/* BEFORE */}
            <Grid item xs={12} md={4}>
              <Paper
                variant="outlined"
                sx={{ p: 1.25, height: '100%', bgcolor: 'background.default' }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    fontSize: '0.65rem',
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  Before (no comment applied)
                </Typography>
                <ArtifactRenderer
                  artifact={current.metadata?.artifact_before}
                  fallbackText={current.content}
                  label={`Before - ${current.metadata?.label || ''}`}
                />
              </Paper>
            </Grid>

            {/* AFTER */}
            {(() => {
              const stepIters = iterations[activeStep] || [];
              const latest = stepIters[stepIters.length - 1];
              return (
                <Grid item xs={12} md={4}>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.25,
                      height: '100%',
                      bgcolor: alpha(theme.palette.primary.main, 0.04),
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        mb: 0.5,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          fontSize: '0.65rem',
                          textTransform: 'uppercase',
                          color: 'primary.main',
                        }}
                      >
                        After (with your comment)
                      </Typography>
                      {stepIters.length > 0 && (
                        <Chip
                          size="small"
                          label={`Iteration ${stepIters.length}`}
                          sx={{ height: 16, fontSize: '0.6rem' }}
                        />
                      )}
                    </Box>
                    {previewing && (
                      <Box>
                        <LinearProgress sx={{ mb: 1 }} />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.7rem' }}
                        >
                          Regenerating with your comment…
                        </Typography>
                      </Box>
                    )}
                    {!previewing && !latest && (
                      <Box
                        sx={{
                          p: 1,
                          bgcolor: alpha(theme.palette.warning.main, 0.06),
                          borderRadius: 0.5,
                          border: `1px dashed ${alpha(theme.palette.warning.main, 0.3)}`,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: '0.7rem',
                            display: 'block',
                            mb: 0.5,
                            color: 'text.primary',
                          }}
                        >
                          <strong>Empty until you iterate.</strong>
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ fontSize: '0.65rem', color: 'text.secondary' }}
                        >
                          Type your feedback in the comment box below, then click{' '}
                          <strong>Apply my comment</strong> (or <strong>Apply &amp; preview</strong>
                          ) to regenerate the sample with your taste applied.
                        </Typography>
                      </Box>
                    )}
                    {!previewing && latest && (
                      <ArtifactRenderer
                        artifact={latest.artifact_after}
                        fallbackText={latest.improvedText}
                        label={`After - ${current.metadata?.label || ''}`}
                      />
                    )}
                  </Paper>
                </Grid>
              );
            })()}
          </Grid>

          <TextField
            label="What's missing? What's wrong? What's good?"
            placeholder="Be specific. Your taste becomes the system's standard."
            multiline
            minRows={2}
            maxRows={6}
            fullWidth
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            helperText="Type your feedback, then click 'Apply my comment' to see the AFTER result. Iterate until satisfied, then click 'Lock in & next' to advance."
          />
        </Box>
      )}
      {stage === STAGE_SYNTHESIZING && (
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <LinearProgress sx={{ mb: 2 }} />
          <Typography variant="body2" color="text.secondary">
            Osja is synthesizing quality criteria from your comments and the library anchors…
          </Typography>
        </Box>
      )}
      {stage === STAGE_DONE && (
        <Box sx={{ py: 2, textAlign: 'center' }}>
          <Alert severity="success" sx={{ mb: 2 }}>
            Calibration complete. Quality criteria are now injected into every new goal.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            The next goal you create will produce deliverables aligned to the standards you just
            set. Re-run calibration any time your taste evolves.
          </Typography>
        </Box>
      )}
      {stage === STAGE_ERROR && (
        <Alert severity="error" sx={{ my: 2 }}>
          {error || 'Calibration failed'}
        </Alert>
      )}
      <Snackbar
        open={!!snack}
        autoHideDuration={3500}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack ? (
          <Alert severity={snack.severity} onClose={() => setSnack(null)}>
            {snack.message}
          </Alert>
        ) : null}
      </Snackbar>
    </FormDialog>
  );
}
