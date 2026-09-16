/**
 * GoalDeliverables — Structured final results from a completed goal.
 * Shows deliverables as categorized cards with document viewer.
 */
import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  IconButton,
  alpha,
  useTheme,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import FormDialog from '../Common/FormDialog';
import OsjaReviewPanel from './OsjaReviewPanel';
import { createHoverGlowShadow } from '../../theme/hoverGlow';
import GlassIcon from '../icons/GlassIcon';

const CATEGORY_COLORS = {
  research: '#2563EB',
  plan: '#7C3AED',
  marketing: '#D97706',
  financial: '#059669',
  technical: '#0EA5E9',
  visual: '#EC4899',
  code: '#10B981',
  general: '#64748B',
};

function taskScoreLabel(deliverable, { long = false } = {}) {
  const semantic = deliverable.quality_score_kind === 'semantic';
  const label = semantic ? 'Quality' : long ? 'Structure score' : 'Structure';
  return `${label}: ${deliverable.quality_score}/100`;
}

export default function GoalDeliverables({
  deliverables = [],
  compact = false,
  embedded = false,
  goalId = null,
}) {
  const theme = useTheme();
  const [viewDoc, setViewDoc] = useState(null); // deliverable to view
  const [compareMode, setCompareMode] = useState(false); // asked vs received

  if (!deliverables.length) return null;

  // Group by category
  const grouped = {};
  for (const d of deliverables) {
    const cat = d.category || 'general';
    if (!grouped[cat])
      grouped[cat] = {
        icon: d.categoryIcon || '📄',
        label: d.categoryLabel || 'Document',
        items: [],
      };
    grouped[cat].items.push(d);
  }

  const singleColumn = compact || embedded;
  const gridColumns = singleColumn
    ? 'minmax(0, 1fr)'
    : { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 1fr)' };

  const deliverableList = Object.entries(grouped).map(([cat, group]) => (
    <Box key={cat} sx={{ mb: 2, minWidth: 0, maxWidth: '100%' }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          color: CATEGORY_COLORS[cat] || '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontSize: '0.6rem',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          mb: 0.75,
        }}
      >
        <GlassIcon name="Description" size={14} tone="brand" /> {group.label} ({group.items.length})
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gap: 1,
          gridTemplateColumns: gridColumns,
          minWidth: 0,
          maxWidth: '100%',
        }}
      >
        {group.items.map((d) => (
          <Paper
            key={d.id}
            variant="outlined"
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              cursor: 'pointer',
              transition: 'all 0.2s',
              minWidth: 0,
              maxWidth: '100%',
              overflow: 'hidden',
              borderLeft: `3px solid ${CATEGORY_COLORS[cat] || '#888'}`,
              '&:hover': { borderColor: 'primary.main', boxShadow: createHoverGlowShadow(theme) },
            }}
            onClick={() => {
              setViewDoc(d);
              setCompareMode(false);
            }}
          >
            <Box
              sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mb: 0.5, minWidth: 0 }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.78rem',
                  flex: 1,
                  minWidth: 0,
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {d.title}
              </Typography>
              {d.quality_score != null && (
                <Tooltip title="Automated structure and acceptance-coverage signal. Semantic quality is reported separately by Osja.">
                  <Chip
                    label={taskScoreLabel(d)}
                    size="small"
                    sx={{
                      flexShrink: 0,
                      fontSize: '0.5rem',
                      height: 16,
                      bgcolor: alpha(d.quality_score >= 70 ? '#059669' : '#D97706', 0.12),
                      color: d.quality_score >= 70 ? '#059669' : '#D97706',
                    }}
                  />
                </Tooltip>
              )}
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontSize: '0.65rem',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                lineHeight: 1.4,
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              }}
            >
              {d.output_preview || 'No preview'}
            </Typography>
            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
                mt: 0.75,
                alignItems: 'center',
                flexWrap: 'wrap',
                maxWidth: '100%',
              }}
            >
              <Chip
                icon={<GlassIcon name="SmartToy" size={10} tone="neutral" />}
                label={d.agent_name}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.5rem', height: 16, maxWidth: '100%' }}
              />
              {d.urls?.length > 0 && (
                <Chip
                  label={`${d.urls.length} link${d.urls.length > 1 ? 's' : ''}`}
                  size="small"
                  color="info"
                  variant="outlined"
                  sx={{ fontSize: '0.5rem', height: 16 }}
                />
              )}
              {d.has_code && (
                <Chip
                  label="Code"
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ fontSize: '0.5rem', height: 16 }}
                />
              )}
              {/* Tool usage chip — green if real tools called, warning if non-markdown task with no tools */}
              {d.tools_used > 0 && (
                <Chip
                  label={`${d.tools_used} tool${d.tools_used === 1 ? '' : 's'}`}
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ fontSize: '0.5rem', height: 16 }}
                />
              )}
              {d.tools_used === 0 && d.deliverable_type && d.deliverable_type !== 'markdown' && (
                <Chip
                  label="⚠️ No tools"
                  size="small"
                  color="warning"
                  variant="outlined"
                  sx={{ fontSize: '0.5rem', height: 16 }}
                />
              )}
            </Box>
          </Paper>
        ))}
      </Box>
    </Box>
  ));

  const containerSx = {
    minWidth: 0,
    maxWidth: '100%',
    overflow: 'hidden',
    ...(embedded ? {} : { p: 2, borderRadius: 2, mb: 2 }),
  };

  return (
    <>
      {goalId && <OsjaReviewPanel goalId={goalId} />}
      {embedded ? (
        <Box sx={containerSx}>{deliverableList}</Box>
      ) : (
        <Paper variant="outlined" sx={containerSx}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 700, mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}
          >
            <GlassIcon name="InventoryOutlined" size={18} tone="brand" /> Deliverables (
            {deliverables.length})
          </Typography>
          {deliverableList}
        </Paper>
      )}

      {/* Document Viewer Dialog */}
      {viewDoc && (
        <FormDialog
          open={!!viewDoc}
          onClose={() => {
            setViewDoc(null);
            setCompareMode(false);
          }}
          title={viewDoc.title}
          subtitle={`${viewDoc.categoryLabel} · ${viewDoc.agent_name}`}
          headerIcon={<GlassIcon name="Description" size={22} tone="brand" />}
          titleAdornment={
            <>
              {viewDoc.quality_score != null && (
                <Tooltip title="Automated structure and acceptance-coverage signal. See Osja Review for semantic quality.">
                  <Chip
                    label={taskScoreLabel(viewDoc, { long: true })}
                    size="small"
                    color={viewDoc.quality_score >= 70 ? 'success' : 'warning'}
                    variant="outlined"
                    sx={{ fontSize: '0.65rem', ml: 1 }}
                  />
                </Tooltip>
              )}
              <Button
                size="small"
                startIcon={<GlassIcon name="CompareArrows" size={16} tone="neutral" />}
                onClick={() => setCompareMode(!compareMode)}
                variant={compareMode ? 'contained' : 'outlined'}
                sx={{ textTransform: 'none', fontSize: '0.7rem', borderRadius: 2, ml: 1 }}
              >
                {compareMode ? 'Full View' : 'Asked vs Received'}
              </Button>
            </>
          }
          maxWidth="md"
          hideCancel
          actions={
            <Button
              onClick={() => {
                setViewDoc(null);
                setCompareMode(false);
              }}
              variant="contained"
              size="small"
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              Close
            </Button>
          }
        >
          {compareMode ? (
            /* Asked vs Received comparison */
            <Box
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
            >
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'info.main' }}>
                  📝 What was asked
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontSize: '0.78rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
                >
                  {viewDoc.task_description || viewDoc.title}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 700, mb: 1, color: 'success.main' }}
                >
                  ✅ What was received
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: '0.78rem',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                    maxHeight: 400,
                    overflow: 'auto',
                  }}
                >
                  {viewDoc.output || 'No output'}
                </Typography>
              </Paper>
            </Box>
          ) : (
            /* Full document view */
            <Box>
              <Paper
                sx={{
                  p: 2,
                  borderRadius: 1,
                  bgcolor: alpha(theme.palette.text.primary, 0.02),
                  maxHeight: 500,
                  overflow: 'auto',
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontSize: '0.82rem',
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.7,
                    fontFamily: 'inherit',
                  }}
                >
                  {viewDoc.output || 'No output available'}
                </Typography>
              </Paper>
              {/* URLs */}
              {viewDoc.urls?.length > 0 && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      color: 'text.secondary',
                      fontSize: '0.6rem',
                      textTransform: 'uppercase',
                    }}
                  >
                    Links found
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                    {viewDoc.urls.map((url, i) => (
                      <Chip
                        key={i}
                        label={url.length > 40 ? url.slice(0, 40) + '...' : url}
                        size="small"
                        clickable
                        icon={<GlassIcon name="OpenInNew" size={12} tone="info" />}
                        onClick={() => window.open(url, '_blank')}
                        variant="outlined"
                        color="info"
                        sx={{ fontSize: '0.6rem', height: 22 }}
                      />
                    ))}
                  </Box>
                </Box>
              )}
              {/* Meta */}
              <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                {viewDoc.cost != null && (
                  <Chip
                    label={`Cost: $${Number(viewDoc.cost).toFixed(4)}`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.6rem', height: 20 }}
                  />
                )}
                {viewDoc.phase_index != null && (
                  <Chip
                    label={`Phase ${viewDoc.phase_index + 1}`}
                    size="small"
                    variant="outlined"
                    color="info"
                    sx={{ fontSize: '0.6rem', height: 20 }}
                  />
                )}
                {viewDoc.created_at && (
                  <Chip
                    label={new Date(viewDoc.created_at).toLocaleString()}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.6rem', height: 20 }}
                  />
                )}
              </Box>
            </Box>
          )}
        </FormDialog>
      )}
    </>
  );
}
