/**
 * Osja Review Panel — surfaces the post-completion verdict on a goal's
 * deliverables. Pulls the latest knowledge_documents row with category=
 * 'osja_review' for the given goal id.
 *
 * Renders:
 *   - Overall grade circle (0-100)
 *   - Counts: N upgrades · M approved
 *   - Per-deliverable accordion: verdict, what_to_change, recreate_prompt,
 *     recommended tool, alternative MCPs
 *
 * If Osja hasn't reviewed yet (cheap goal under threshold, or in-flight),
 * the panel doesn't render — silent fallback.
 */
import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Tooltip,
  Button,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import { supabase, hasSupabase } from '../../lib/supabase';
import { rerunGoalQualityReview } from '../../services/goalService';
import {
  getOsjaReviewDisplayState,
  getOsjaReviewItemDisplayState,
  getSafeHttpsUrl,
  normalizeOsjaReviewItem,
} from '../../utils/goalTruthFormatters';

import AppIcon from '../icons/AppIcon';

function gradeColor(score, theme) {
  if (score >= 95) return theme.palette.success.main;
  if (score >= 85) return theme.palette.primary.main;
  if (score >= 70) return theme.palette.warning.main;
  return theme.palette.error.main;
}

function gradeLabel(score) {
  if (score >= 95) return 'Library-grade';
  if (score >= 85) return 'Strong';
  if (score >= 70) return 'Competent';
  return 'Needs work';
}

async function fetchReviewPanelData(goalId, { includeGoal = true } = {}) {
  const reviewPromise = supabase
    .from('knowledge_documents')
    .select('id, content, metadata, created_at')
    .eq('category', 'osja_review')
    .eq('metadata->>goal_id', goalId)
    .order('created_at', { ascending: false })
    .limit(1);
  const goalPromise = includeGoal
    ? supabase.from('goals').select('data').eq('id', goalId).maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const [reviewRes, goalRes] = await Promise.all([reviewPromise, goalPromise]);

  if (reviewRes.error) throw new Error(reviewRes.error.message || 'Unable to load quality review');
  if (goalRes.error) throw new Error(goalRes.error.message || 'Unable to load goal deliverables');

  let latestReview = null;
  if (reviewRes.data?.length > 0) {
    try {
      const parsed = JSON.parse(reviewRes.data[0].content);
      latestReview = {
        ...parsed,
        _docId: reviewRes.data[0].id,
        _createdAt: reviewRes.data[0].created_at,
      };
    } catch {
      latestReview = null;
    }
  }

  const dMap = {};
  if (includeGoal) {
    for (const deliverable of goalRes.data?.data?.deliverables || []) {
      if (deliverable?.id != null) dMap[String(deliverable.id)] = deliverable;
    }
  }

  return { review: latestReview, deliverablesById: dMap };
}

function waitForRetryPoll(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export default function OsjaReviewPanel({ goalId }) {
  const theme = useTheme();
  const [review, setReview] = useState(null);
  const [deliverablesById, setDeliverablesById] = useState({});
  const [loading, setLoading] = useState(() => Boolean(goalId && hasSupabase()));
  const [copiedKey, setCopiedKey] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');
  const [retryMessage, setRetryMessage] = useState('');
  const retryRunRef = useRef(0);

  useEffect(() => {
    if (!goalId || !hasSupabase()) {
      return undefined;
    }
    let cancelled = false;
    retryRunRef.current += 1;
    setRetrying(false);
    setRetryError('');
    setRetryMessage('');
    setLoading(true);
    (async () => {
      try {
        const next = await fetchReviewPanelData(goalId);
        if (cancelled) return;
        setReview(next.review);
        setDeliverablesById(next.deliverablesById);
      } catch {
        if (cancelled) return;
        setReview(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      retryRunRef.current += 1;
    };
  }, [goalId]);

  if (loading || !review) return null;

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  };

  const handleRetryReview = async () => {
    if (retrying || !review?._docId) return;

    const previousDocId = review._docId;
    const runId = retryRunRef.current + 1;
    retryRunRef.current = runId;
    setRetrying(true);
    setRetryError('');
    setRetryMessage('Queueing a fresh task-scoped quality review…');

    try {
      const queued = await rerunGoalQualityReview(goalId);
      if (retryRunRef.current !== runId) return;
      setRetryMessage(
        queued?.already_queued
          ? 'A quality review is already running. Waiting for its result…'
          : 'Quality review queued. Waiting for its result…'
      );

      // Bound refresh work to 30 seconds. The durable worker can take longer;
      // in that case the user gets an explicit refresh message and can retry
      // without creating a duplicate active job.
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await waitForRetryPoll(2500);
        if (retryRunRef.current !== runId) return;
        const next = await fetchReviewPanelData(goalId, { includeGoal: false });
        if (next.review?._docId && next.review._docId !== previousDocId) {
          setReview(next.review);
          setRetryMessage('Quality review updated.');
          return;
        }
      }

      setRetryMessage('The review is still running. Refresh this page in a moment.');
    } catch (error) {
      if (retryRunRef.current === runId) {
        setRetryError(error?.message || 'Unable to queue the quality review');
        setRetryMessage('');
      }
    } finally {
      if (retryRunRef.current === runId) setRetrying(false);
    }
  };

  const reviewDisplay = getOsjaReviewDisplayState(review);
  const gColor = reviewDisplay.incomplete
    ? theme.palette.warning.main
    : gradeColor(reviewDisplay.overallGrade, theme);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderRadius: 2, mb: 2, borderColor: alpha(gColor, 0.4) }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            bgcolor: alpha(gColor, 0.12),
            color: gColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '1.2rem',
            flexShrink: 0,
          }}
        >
          {reviewDisplay.overallGrade ?? '—'}
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
            }}
          >
            <AppIcon
              name="AutoAwesomeOutlined"
              fallback={AutoAwesomeOutlinedIcon}
              sx={{ fontSize: 16, color: gColor }}
            />
            Osja Review —{' '}
            {reviewDisplay.incomplete
              ? 'Review incomplete'
              : gradeLabel(reviewDisplay.overallGrade)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            {reviewDisplay.incomplete
              ? `Validated ${reviewDisplay.validatedCount} of ${reviewDisplay.attemptedCount} attempted deliverable reviews.`
              : `Compared ${reviewDisplay.attemptedCount} deliverables against the Library Universe.`}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
            {reviewDisplay.incomplete ? (
              <>
                <Chip
                  size="small"
                  label="Review incomplete"
                  sx={{ height: 18, fontSize: '0.65rem' }}
                  color="warning"
                />
                <Chip
                  size="small"
                  label={`${reviewDisplay.invalidCount} invalid`}
                  sx={{ height: 18, fontSize: '0.65rem' }}
                  color="error"
                  variant="outlined"
                />
              </>
            ) : (
              <>
                <Chip
                  size="small"
                  label={`${review.upgrade_count || 0} to upgrade`}
                  sx={{ height: 18, fontSize: '0.65rem' }}
                  color={review.upgrade_count > 0 ? 'warning' : 'default'}
                />
                <Chip
                  size="small"
                  label={`${review.keep_count || 0} approved`}
                  sx={{ height: 18, fontSize: '0.65rem' }}
                  color={review.keep_count > 0 ? 'success' : 'default'}
                />
                {review.promoted_count > 0 && (
                  <Chip
                    size="small"
                    label={`${review.promoted_count} promoted to library`}
                    sx={{ height: 18, fontSize: '0.65rem' }}
                    color="secondary"
                  />
                )}
              </>
            )}
            <Tooltip
              title={
                Number(review.schema_version || 0) >= 2
                  ? 'Each artifact was reviewed against its assigned task using complete output or explicit balanced excerpts.'
                  : 'This historical review predates task-scoped, excerpt-safe review and may contain false truncation or scope findings.'
              }
            >
              <Chip
                size="small"
                label={
                  Number(review.schema_version || 0) >= 2 ? 'Scoped review v2' : 'Legacy review'
                }
                sx={{ height: 18, fontSize: '0.65rem' }}
                color={Number(review.schema_version || 0) >= 2 ? 'info' : 'warning'}
                variant="outlined"
              />
            </Tooltip>
          </Box>
          {reviewDisplay.incomplete && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                disabled={retrying}
                onClick={handleRetryReview}
                startIcon={
                  retrying ? (
                    <CircularProgress size={12} color="inherit" />
                  ) : (
                    <AppIcon name="Replay" fallback={ReplayIcon} sx={{ fontSize: 14 }} />
                  )
                }
                sx={{ fontSize: '0.68rem', textTransform: 'none', py: 0.25 }}
              >
                {retrying ? 'Review running…' : 'Retry review'}
              </Button>
              {(retryMessage || retryError) && (
                <Typography
                  variant="caption"
                  color={retryError ? 'error.main' : 'text.secondary'}
                  role={retryError ? 'alert' : 'status'}
                  sx={{ fontSize: '0.66rem' }}
                >
                  {retryError || retryMessage}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </Box>
      {(review.reviews || []).map((rawReview, idx) => {
        const r = normalizeOsjaReviewItem(rawReview);
        const itemDisplay = getOsjaReviewItemDisplayState(rawReview, {
          reportIncomplete: reviewDisplay.incomplete,
        });
        const deliverable = deliverablesById[String(r.deliverable_id)];
        const regenCount = deliverable?.osja_regen_count || 0;
        const previousVersions = deliverable?.previous_versions || [];
        return (
          <Accordion
            key={r.deliverable_id || idx}
            disableGutters
            elevation={0}
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              mb: 0.5,
              '&:before': { display: 'none' },
            }}
          >
            <AccordionSummary
              expandIcon={<AppIcon name="ExpandMore" fallback={ExpandMoreIcon} />}
              sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.75 } }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', minWidth: 0 }}
              >
                <Box
                  sx={{
                    minWidth: 36,
                    height: 24,
                    borderRadius: 0.75,
                    bgcolor: alpha(
                      itemDisplay.valid
                        ? gradeColor(itemDisplay.score, theme)
                        : theme.palette.warning.main,
                      0.12
                    ),
                    color: itemDisplay.valid
                      ? gradeColor(itemDisplay.score, theme)
                      : theme.palette.warning.main,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.7rem',
                  }}
                >
                  {itemDisplay.score ?? '—'}
                </Box>
                <Typography
                  variant="body2"
                  sx={{ fontSize: '0.75rem', fontWeight: 600, flexGrow: 1, minWidth: 0 }}
                  noWrap
                >
                  {r.deliverable_title || r.deliverable_type}
                </Typography>
                {regenCount > 0 && (
                  <Chip
                    size="small"
                    label={`Regenerated ×${regenCount}`}
                    color="info"
                    variant="outlined"
                    sx={{ height: 18, fontSize: '0.6rem' }}
                  />
                )}
                <Chip
                  size="small"
                  label={
                    itemDisplay.valid
                      ? itemDisplay.verdict === 'keep'
                        ? 'Keep'
                        : 'Upgrade'
                      : 'Review incomplete'
                  }
                  color={
                    itemDisplay.valid
                      ? itemDisplay.verdict === 'keep'
                        ? 'success'
                        : 'warning'
                      : 'error'
                  }
                  variant={itemDisplay.valid ? 'filled' : 'outlined'}
                  sx={{ height: 18, fontSize: '0.6rem' }}
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
              <Typography
                variant="body2"
                sx={{ fontSize: '0.75rem', mb: 1, fontStyle: 'italic', color: 'text.secondary' }}
              >
                {r.reasoning}
              </Typography>

              {r.what_to_change?.length > 0 && (
                <Box sx={{ mb: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.65rem',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                    }}
                  >
                    What to change
                  </Typography>
                  <Box
                    component="ul"
                    sx={{ pl: 2, m: 0.5, '& li': { fontSize: '0.72rem', mb: 0.25 } }}
                  >
                    {r.what_to_change.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </Box>
                </Box>
              )}

              {r.recreate_prompt && (
                <Box sx={{ mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.65rem',
                        textTransform: 'uppercase',
                        color: 'text.secondary',
                      }}
                    >
                      Recreate prompt
                    </Typography>
                    <Tooltip title={copiedKey === `prompt-${idx}` ? 'Copied' : 'Copy'}>
                      <IconButton
                        size="small"
                        onClick={() => handleCopy(r.recreate_prompt, `prompt-${idx}`)}
                      >
                        <AppIcon
                          name="ContentCopyOutlined"
                          fallback={ContentCopyOutlinedIcon}
                          sx={{ fontSize: 12 }}
                        />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: '0.7rem',
                      bgcolor: 'background.default',
                      p: 0.75,
                      borderRadius: 0.5,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {r.recreate_prompt}
                  </Typography>
                </Box>
              )}

              {r.recommended_tool && (
                <Box sx={{ mb: 0.5 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.65rem', color: 'text.secondary' }}
                  >
                    Recommended tool: <strong>{r.recommended_tool}</strong>
                  </Typography>
                </Box>
              )}

              {r.alternative_mcps?.some((alt) => getSafeHttpsUrl(alt?.url)) && (
                <Box sx={{ mt: 0.75 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.65rem',
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                    }}
                  >
                    Free / trial alternatives
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                    {r.alternative_mcps.map((alt, i) => {
                      const safeUrl = getSafeHttpsUrl(alt?.url);
                      if (!safeUrl) return null;
                      return (
                        <Button
                          key={i}
                          size="small"
                          variant="outlined"
                          endIcon={
                            <AppIcon
                              name="OpenInNew"
                              fallback={OpenInNewIcon}
                              sx={{ fontSize: 12 }}
                            />
                          }
                          href={safeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ fontSize: '0.65rem', textTransform: 'none', py: 0.25 }}
                        >
                          {alt.name} ({alt.tier})
                        </Button>
                      );
                    })}
                  </Box>
                </Box>
              )}

              {previousVersions.length > 0 && (
                <Accordion
                  disableGutters
                  elevation={0}
                  sx={{
                    mt: 1,
                    border: '1px dashed',
                    borderColor: 'divider',
                    borderRadius: 1,
                    '&:before': { display: 'none' },
                  }}
                >
                  <AccordionSummary
                    expandIcon={
                      <AppIcon name="ExpandMore" fallback={ExpandMoreIcon} sx={{ fontSize: 16 }} />
                    }
                    sx={{ minHeight: 32, '& .MuiAccordionSummary-content': { my: 0.5 } }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary' }}
                    >
                      Previous versions ({previousVersions.length})
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0, pb: 1 }}>
                    {previousVersions.map((pv, i) => (
                      <Box
                        key={pv.archived_at || i}
                        sx={{ mb: 0.75, pl: 1, borderLeft: '2px solid', borderColor: 'divider' }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ fontSize: '0.6rem', color: 'text.disabled' }}
                        >
                          {pv.archived_at
                            ? new Date(pv.archived_at).toLocaleString()
                            : 'unknown date'}
                          {pv.score != null && ` · previous score ${pv.score}/100`}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: '0.68rem',
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            bgcolor: 'background.default',
                            p: 0.75,
                            borderRadius: 0.5,
                            mt: 0.25,
                            maxHeight: 140,
                            overflow: 'auto',
                          }}
                        >
                          {String(pv.output || '').slice(0, 600)}
                          {String(pv.output || '').length > 600 ? '…' : ''}
                        </Typography>
                      </Box>
                    ))}
                  </AccordionDetails>
                </Accordion>
              )}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Paper>
  );
}
