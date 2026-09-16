/**
 * VersionPicker — pill row of versions (v1 / v2 / v3) + "Improve quality"
 * button for the user's "Improve Quality" feature.
 *
 * v1 is always the original (passed in via props, not fetched). v2/v3 are
 * rows from `deliverable_refinements`. The picker calls onSelectVersion()
 * with the appropriate content (or url) whenever the user toggles, so the
 * parent (doc viewer / PageBuilder / ImageGrid row) can swap what it renders.
 *
 * Props:
 *   kind            — 'knowledge_document' | 'landing_page' | 'goal_artifact'
 *   parentId        — the deliverable id (string)
 *   originalValue   — the v1 text content (markdown / html) for text deliverables
 *   originalUrl     — the v1 image URL for image deliverables (optional)
 *   onSelectVersion(value) — invoked when the user switches version. `value` is
 *                     the new content string (text) OR the new image URL.
 *   compact         — render in a tighter layout (used inside image rows)
 *   onChange()      — optional callback after a successful refinement so parent
 *                     can refresh its own counters
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Box,
  ButtonGroup,
  Button,
  Tooltip,
  Chip,
  alpha,
  useTheme,
  CircularProgress,
} from '@mui/material';
import PropTypes from 'prop-types';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { listRefinements, startRefinement } from './deliverableRefineApi';
import RefineModal from './RefineModal';

import AppIcon from '../icons/AppIcon';

const MAX_REFINEMENTS = 2;

function pickValueFromRefinement(r, kind) {
  if (kind === 'goal_artifact') {
    // image / banner artifacts return refined_url; text artifacts return refined_content
    return r.refined_url || r.refined_content || '';
  }
  return r.refined_content || '';
}

export default function VersionPicker({
  kind,
  parentId,
  originalValue = '',
  originalUrl = null,
  onSelectVersion,
  onChange,
  compact = false,
  // disabledKinds + artifactKind let the row tell us when the backend
  // doesn't yet support refining this specific goal_artifact subkind
  // (pdf/deck/data today). The Improve button stays visible but greyed
  // with a clearer tooltip instead of round-tripping to a 400.
  disabledKinds = [],
  artifactKind = null,
}) {
  const theme = useTheme();
  const [refinements, setRefinements] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Load existing refinements on mount + whenever the parent id changes.
  useEffect(() => {
    if (!parentId || !kind) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listRefinements(kind, parentId)
      .then((rows) => {
        if (cancelled) return;
        // Only show successfully-refined versions; pending/failed don't make
        // sense as pills (they're invisible to the user — the modal handles them).
        const done = (Array.isArray(rows) ? rows : []).filter((r) => r.status === 'done');
        setRefinements(done);
      })
      .catch(() => {
        if (!cancelled) setRefinements([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, parentId]);

  const versionsList = useMemo(() => {
    const list = [{ version: 1, label: 'v1', isOriginal: true }];
    for (const r of refinements)
      list.push({ version: r.version, label: `v${r.version}`, refinement: r });
    return list;
  }, [refinements]);

  const remaining = Math.max(0, MAX_REFINEMENTS - refinements.length);
  const atLimit = remaining === 0;

  // Kind-level disable check: certain goal_artifact kinds aren't supported
  // by the backend refiner yet. We still want the button visible so the
  // affordance is consistent across rows — just disabled with a clear
  // explanation in the tooltip.
  const kindBlocked =
    kind === 'goal_artifact' &&
    artifactKind &&
    disabledKinds.includes(String(artifactKind).toLowerCase());

  const disabledForKind = !!kindBlocked;
  const buttonDisabled = atLimit || disabledForKind;
  const tooltipText = disabledForKind
    ? `${String(artifactKind).toUpperCase()} refinement is coming soon — only text and image refinement work today.`
    : atLimit
      ? `Limit reached (${MAX_REFINEMENTS} of ${MAX_REFINEMENTS} refinements used)`
      : `Refine this deliverable using AI — ${remaining} of ${MAX_REFINEMENTS} left`;

  const handleSelectVersion = useCallback(
    (version) => {
      setSelectedVersion(version);
      if (!onSelectVersion) return;
      if (version === 1) {
        onSelectVersion(originalUrl || originalValue);
        return;
      }
      const r = refinements.find((x) => x.version === version);
      if (r) onSelectVersion(pickValueFromRefinement(r, kind));
    },
    [onSelectVersion, originalUrl, originalValue, refinements, kind]
  );

  const handleSubmitRefinement = useCallback(
    async (prompt) => {
      const result = await startRefinement({ kind, parentId, prompt });
      // Build a synthetic refinement row matching what `list` returns so we
      // can update local state without re-fetching.
      const newRow = {
        id: result.id,
        version: result.version,
        refined_content: result.refined_content,
        refined_url: result.refined_url,
        refined_mime: result.refined_mime,
        status: 'done',
      };
      setRefinements((prev) => [...prev, newRow]);
      setSelectedVersion(result.version);
      setModalOpen(false);
      onSelectVersion?.(pickValueFromRefinement(newRow, kind));
      onChange?.();
    },
    [kind, parentId, onSelectVersion, onChange]
  );

  if (!parentId || !kind) return null;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
        <CircularProgress size={12} thickness={5} />
        <Box component="span" sx={{ fontSize: '0.7rem', color: 'text.disabled' }}>
          Loading versions…
        </Box>
      </Box>
    );
  }

  const pillFontSize = compact ? '0.62rem' : '0.7rem';
  const pillPadY = compact ? 0.2 : 0.35;
  const pillPadX = compact ? 0.85 : 1.25;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
        py: compact ? 0.25 : 0.5,
      }}
    >
      {/* Only show the pill group when we actually have refinements; on a
          never-refined item just show the Improve button alone so the row
          stays clean. */}
      {versionsList.length > 1 && (
        <ButtonGroup size="small" variant="outlined" sx={{ borderRadius: 5 }}>
          {versionsList.map(({ version, label, isOriginal }) => (
            <Button
              key={version}
              onClick={() => handleSelectVersion(version)}
              sx={{
                fontSize: pillFontSize,
                fontWeight: 700,
                py: pillPadY,
                px: pillPadX,
                textTransform: 'none',
                bgcolor:
                  selectedVersion === version
                    ? alpha(theme.palette.primary.main, 0.14)
                    : 'transparent',
                color: selectedVersion === version ? 'primary.main' : 'text.secondary',
                borderColor: alpha(
                  theme.palette.primary.main,
                  selectedVersion === version ? 0.45 : 0.2
                ),
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                  borderColor: theme.palette.primary.main,
                },
              }}
            >
              {label}
              {isOriginal ? ' · original' : ''}
            </Button>
          ))}
        </ButtonGroup>
      )}
      <Tooltip title={tooltipText} arrow placement="top">
        <Box component="span">
          <Button
            size="small"
            variant={buttonDisabled ? 'outlined' : 'contained'}
            startIcon={
              <AppIcon name="AutoFixHigh" fallback={AutoFixHighIcon} sx={{ fontSize: 14 }} />
            }
            disabled={buttonDisabled}
            onClick={() => setModalOpen(true)}
            sx={{
              fontSize: pillFontSize,
              py: pillPadY,
              px: pillPadX,
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 5,
            }}
          >
            {disabledForKind
              ? `Improve ${String(artifactKind).toUpperCase()} (soon)`
              : atLimit
                ? 'Improvement limit reached'
                : 'Improve quality'}
          </Button>
        </Box>
      </Tooltip>
      {versionsList.length > 1 && (
        <Chip
          size="small"
          label={`${refinements.length}/${MAX_REFINEMENTS} used`}
          sx={{
            height: 18,
            fontSize: '0.55rem',
            fontWeight: 700,
            bgcolor: alpha(theme.palette.text.primary, 0.06),
            color: 'text.secondary',
          }}
        />
      )}
      <RefineModal
        open={modalOpen}
        kind={kind}
        remaining={remaining}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmitRefinement}
      />
    </Box>
  );
}

VersionPicker.propTypes = {
  kind: PropTypes.oneOf(['knowledge_document', 'landing_page', 'goal_artifact', 'task_output'])
    .isRequired,
  parentId: PropTypes.string,
  originalValue: PropTypes.string,
  originalUrl: PropTypes.string,
  onSelectVersion: PropTypes.func,
  onChange: PropTypes.func,
  compact: PropTypes.bool,
  disabledKinds: PropTypes.arrayOf(PropTypes.string),
  artifactKind: PropTypes.string,
};
