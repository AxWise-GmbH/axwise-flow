/**
 * ConsiliumDiscussionPanel — Renders multi-agent board discussion results.
 * Shows each member's opinion, position, confidence, and the consensus.
 */
import {
  Box,
  Typography,
  Paper,
  Chip,
  LinearProgress,
  alpha,
  useTheme,
  Button,
  Collapse,
  IconButton,
} from '@mui/material';
import { useState } from 'react';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';

import AppIcon from '../icons/AppIcon';

const POSITION_COLORS = {
  FAVORABLE: 'success',
  CAUTIOUS: 'warning',
  NEUTRAL: 'info',
  AGAINST: 'error',
};

function MemberCard({ member }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const posColor = POSITION_COLORS[member.position] || 'info';

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette[posColor]?.main || theme.palette.info.main, 0.04),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={700} noWrap>
            {member.memberName}
          </Typography>
          <Chip
            label={member.role}
            size="small"
            sx={{ fontSize: '0.65rem', height: 20, fontWeight: 600 }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip
            label={member.position}
            size="small"
            color={posColor}
            sx={{ fontSize: '0.65rem', height: 22, fontWeight: 700 }}
          />
          <Typography variant="caption" fontWeight={700} sx={{ ml: 0.5 }}>
            {member.confidence}/10
          </Typography>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
        {member.opinion?.slice(0, expanded ? undefined : 200)}
        {!expanded && member.opinion?.length > 200 && '...'}
      </Typography>
      {(member.risks?.length > 0 || member.recommendations?.length > 0) && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.5 }}>
            <IconButton
              size="small"
              onClick={() => setExpanded((e) => !e)}
              sx={{
                transform: expanded ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            >
              <AppIcon name="ExpandMoreRounded" fallback={ExpandMoreRoundedIcon} fontSize="small" />
            </IconButton>
          </Box>
          <Collapse in={expanded}>
            {member.risks?.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" fontWeight={700} color="warning.main">
                  Risks:
                </Typography>
                {member.risks.map((r, i) => (
                  <Typography
                    key={i}
                    variant="caption"
                    display="block"
                    color="text.secondary"
                    sx={{ pl: 1 }}
                  >
                    • {r}
                  </Typography>
                ))}
              </Box>
            )}
            {member.recommendations?.length > 0 && (
              <Box sx={{ mt: 0.75 }}>
                <Typography variant="caption" fontWeight={700} color="success.main">
                  Recommendations:
                </Typography>
                {member.recommendations.map((r, i) => (
                  <Typography
                    key={i}
                    variant="caption"
                    display="block"
                    color="text.secondary"
                    sx={{ pl: 1 }}
                  >
                    • {r}
                  </Typography>
                ))}
              </Box>
            )}
          </Collapse>
        </>
      )}
      {member.provider && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
          {member.provider} · {member.model}
        </Typography>
      )}
    </Paper>
  );
}

export default function ConsiliumDiscussionPanel({
  discussion = [],
  consensus,
  boardName,
  topic,
  loading,
  onFollowUp,
  onSave,
}) {
  const theme = useTheme();

  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AppIcon name="GroupsOutlined" fallback={GroupsOutlinedIcon} color="secondary" />
          <Typography variant="subtitle2" fontWeight={700}>
            Board Discussion
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Consulting board members...
        </Typography>
        <LinearProgress color="secondary" />
      </Box>
    );
  }

  if (!discussion.length) return null;

  const consensusColor = POSITION_COLORS[consensus?.dominantPosition] || 'info';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AppIcon
            name="GroupsOutlined"
            fallback={GroupsOutlinedIcon}
            color="secondary"
            sx={{ fontSize: 20 }}
          />
          <Typography variant="subtitle2" fontWeight={700}>
            Board Discussion
          </Typography>
          {boardName && (
            <Chip label={boardName} size="small" sx={{ fontSize: '0.65rem', height: 20 }} />
          )}
        </Box>
        {onSave && (
          <IconButton size="small" onClick={onSave} title="Save discussion">
            <AppIcon name="SaveOutlined" fallback={SaveOutlinedIcon} fontSize="small" />
          </IconButton>
        )}
      </Box>
      {topic && (
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          Topic: {topic}
        </Typography>
      )}
      {/* Member responses */}
      {discussion.map((member) => (
        <MemberCard key={member.memberId} member={member} />
      ))}
      {/* Consensus */}
      {consensus && (
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: '2px solid',
            borderColor: `${consensusColor}.main`,
            bgcolor: alpha(theme.palette[consensusColor]?.main || theme.palette.info.main, 0.08),
            textAlign: 'center',
          }}
        >
          <Typography variant="overline" fontWeight={700} color={`${consensusColor}.main`}>
            Consensus: {consensus.dominantPosition}
          </Typography>
          <Typography variant="h6" fontWeight={800}>
            {consensus.averageConfidence}/10
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {consensus.memberCount} member{consensus.memberCount !== 1 ? 's' : ''} responded
          </Typography>
        </Paper>
      )}
      {/* Actions */}
      {onFollowUp && (
        <Button
          size="small"
          variant="outlined"
          onClick={onFollowUp}
          sx={{ textTransform: 'none', fontWeight: 600, alignSelf: 'flex-start' }}
        >
          Ask follow-up
        </Button>
      )}
    </Box>
  );
}
