/**
 * ArtifactPanel — Side panel for structured AI output (reports, tables, predictions, discussions).
 * Renders next to the chat when the assistant produces structured content.
 */
import {
  Box,
  Typography,
  Paper,
  Chip,
  Divider,
  IconButton,
  alpha,
  useTheme,
  Collapse,
} from '@mui/material';
import { useState } from 'react';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingFlatRoundedIcon from '@mui/icons-material/TrendingFlatRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ConsiliumDiscussionPanel from './ConsiliumDiscussionPanel';

import AppIcon from '../icons/AppIcon';

const TREND_ICONS = {
  up: TrendingUpRoundedIcon,
  down: TrendingDownRoundedIcon,
  stable: TrendingFlatRoundedIcon,
};

const TREND_COLORS = {
  up: 'success.main',
  down: 'error.main',
  stable: 'text.secondary',
};

function ReportArtifact({ data }) {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6" fontWeight={700}>
        {data.title || 'Report'}
      </Typography>
      {/* Key Metrics */}
      {data.keyMetrics?.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {data.keyMetrics.map((metric, i) => {
            const TrendIcon = TREND_ICONS[metric.trend] || TrendingFlatRoundedIcon;
            return (
              <Paper
                key={i}
                elevation={0}
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  minWidth: 120,
                  flex: '1 1 auto',
                }}
              >
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  {metric.label}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                  <Typography variant="subtitle1" fontWeight={800}>
                    {metric.value}
                  </Typography>
                  <AppIcon
                    fallback={TrendIcon}
                    sx={{ fontSize: 16, color: TREND_COLORS[metric.trend] || 'text.secondary' }}
                  />
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}
      {/* Sections */}
      {data.sections?.map((section, i) => (
        <Box key={i}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
            {section.heading}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}
          >
            {section.content}
          </Typography>
        </Box>
      ))}
      {/* Recommendations */}
      {data.recommendations?.length > 0 && (
        <Box>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
            Recommendations
          </Typography>
          {data.recommendations.map((rec, i) => (
            <Typography key={i} variant="body2" color="text.secondary" sx={{ pl: 1 }}>
              • {rec}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}

function PredictionArtifact({ data }) {
  const theme = useTheme();
  const riskColor =
    data.riskLevel === 'high' ? 'error' : data.riskLevel === 'medium' ? 'warning' : 'success';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" fontWeight={700}>
          Predictions
        </Typography>
        <Chip
          label={`Risk: ${data.riskLevel || 'unknown'}`}
          size="small"
          color={riskColor}
          sx={{ fontWeight: 700 }}
        />
      </Box>
      {data.summary && (
        <Typography variant="body2" color="text.secondary">
          {data.summary}
        </Typography>
      )}
      {data.predictions?.map((pred, i) => (
        <Paper
          key={i}
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '1px solid',
            borderColor:
              pred.risk === 'high'
                ? alpha(theme.palette.error.main, 0.3)
                : pred.risk === 'medium'
                  ? alpha(theme.palette.warning.main, 0.3)
                  : 'divider',
            bgcolor: pred.risk === 'high' ? alpha(theme.palette.error.main, 0.04) : 'transparent',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            {pred.risk === 'high' && (
              <AppIcon
                name="WarningAmberRounded"
                fallback={WarningAmberRoundedIcon}
                color="error"
                sx={{ fontSize: 16 }}
              />
            )}
            <Typography variant="subtitle2" fontWeight={700}>
              {pred.entity}
            </Typography>
            <Chip
              label={pred.type?.replace(/_/g, ' ')}
              size="small"
              sx={{ fontSize: '0.6rem', height: 18 }}
            />
            <Chip
              label={pred.risk}
              size="small"
              color={
                pred.risk === 'high' ? 'error' : pred.risk === 'medium' ? 'warning' : 'success'
              }
              sx={{ fontSize: '0.6rem', height: 18, fontWeight: 700 }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary">
            {pred.reason}
          </Typography>
          {pred.recommendation && (
            <Typography variant="caption" color="primary.main" display="block" sx={{ mt: 0.5 }}>
              → {pred.recommendation}
            </Typography>
          )}
        </Paper>
      ))}
    </Box>
  );
}

export default function ArtifactPanel({ artifact, onClose }) {
  const theme = useTheme();

  if (!artifact) return null;

  const renderContent = () => {
    switch (artifact.type) {
      case 'report':
        return <ReportArtifact data={artifact.data} />;
      case 'prediction':
        return <PredictionArtifact data={artifact.data} />;
      case 'consilium-discussion':
        return (
          <ConsiliumDiscussionPanel
            discussion={artifact.data.discussion}
            consensus={artifact.data.consensus}
            boardName={artifact.data.boardName}
            topic={artifact.data.topic}
          />
        );
      default:
        return (
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
            {typeof artifact.data === 'string'
              ? artifact.data
              : JSON.stringify(artifact.data, null, 2)}
          </Typography>
        );
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderLeft: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.background.paper, 0.95),
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: alpha(theme.palette.primary.main, 0.04),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AppIcon
            name="DescriptionOutlined"
            fallback={DescriptionOutlinedIcon}
            sx={{ fontSize: 18, color: 'primary.main' }}
          />
          <Typography variant="subtitle2" fontWeight={700}>
            {artifact.title || 'Output'}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <AppIcon name="CloseRounded" fallback={CloseRoundedIcon} fontSize="small" />
        </IconButton>
      </Box>
      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>{renderContent()}</Box>
      {/* Footer */}
      {artifact.cost != null && (
        <Box
          sx={{
            px: 2,
            py: 0.75,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="caption" color="text.disabled">
            {artifact.model} · ${Number(artifact.cost).toFixed(5)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
