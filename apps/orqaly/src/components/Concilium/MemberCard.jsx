/**
 * MemberCard — Modernized member card with avatar, description, abilities, and activity preview.
 */
import { Box, Typography, Chip, alpha, Paper, useTheme, useMediaQuery } from '@mui/material';
import AgentAvatar from '../AgentHub/AgentAvatar';
import { createHoverGlowShadow } from '../../theme/hoverGlow';

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

export default function MemberCard({ member, isDark, onClick }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const roleVal = typeof member.role === 'object' ? member.role?.value : member.role;
  const provVal = typeof member.provider === 'object' ? member.provider?.value : member.provider;
  const provColor = PROVIDER_COLORS[provVal] || '#888';
  const roleColor = ROLE_COLORS[roleVal] || '#888';

  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        p: 2,
        borderRadius: 2,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: member.quarantined ? 'error.main' : 'divider',
        opacity: member.quarantined ? 0.75 : 1,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        '&:hover': {
          borderColor: theme.palette.primary.main,
          boxShadow: createHoverGlowShadow(theme),
        },
      }}
    >
      {/* Header: Avatar + Info + Badges */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
        <AgentAvatar profile={{ display_name: member.name }} size={isMobile ? 'medium' : 'large'} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              lineHeight: 1.2,
              mb: 0.25,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {member.name}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              display: 'block',
              lineHeight: 1.3,
              textTransform: 'capitalize',
            }}
          >
            {roleVal} &middot; {provVal}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flexShrink: 0 }}>
          <Chip
            label={roleVal}
            size="small"
            sx={{
              height: 22,
              fontWeight: 600,
              fontSize: '0.62rem',
              textTransform: 'capitalize',
              bgcolor: alpha(roleColor, isDark ? 0.15 : 0.1),
              color: roleColor,
            }}
          />
          <Chip
            label={provVal}
            size="small"
            sx={{
              height: 22,
              fontWeight: 600,
              fontSize: '0.62rem',
              textTransform: 'capitalize',
              bgcolor: alpha(provColor, isDark ? 0.15 : 0.1),
              color: provColor,
            }}
          />
          {member.quarantined && (
            <Chip
              label="Quarantined"
              size="small"
              color="error"
              sx={{ height: 22, fontWeight: 600, fontSize: '0.62rem' }}
            />
          )}
        </Box>
      </Box>

      {/* Description / Resume */}
      {member.resume && (
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
            fontStyle: 'italic',
            lineHeight: 1.5,
            mb: 1.5,
            p: 1.25,
            bgcolor: alpha(theme.palette.text.primary, 0.03),
            borderRadius: 1.5,
            borderLeft: `3px solid ${alpha(theme.palette.primary.main, 0.3)}`,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontSize: '0.78rem',
          }}
        >
          &ldquo;{member.resume}&rdquo;
        </Typography>
      )}

      {/* Abilities / Skills */}
      {member.skills?.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'text.secondary',
              fontSize: '0.6rem',
              display: 'block',
              mb: 0.5,
            }}
          >
            Abilities
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {member.skills.slice(0, 4).map((s) => (
              <Chip
                key={s}
                label={s}
                size="small"
                variant="outlined"
                sx={{
                  height: 22,
                  fontSize: '0.62rem',
                  fontWeight: 500,
                  borderRadius: 1.5,
                  borderColor: alpha(theme.palette.primary.main, 0.15),
                  color: theme.palette.primary.light,
                }}
              />
            ))}
            {member.skills.length > 4 && (
              <Chip
                label={`+${member.skills.length - 4}`}
                size="small"
                sx={{
                  height: 22,
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  bgcolor: alpha(theme.palette.text.primary, 0.06),
                  color: 'text.secondary',
                }}
              />
            )}
          </Box>
        </Box>
      )}

      {/* Activity Preview */}
      <Box
        sx={{
          borderTop: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.5),
          pt: 1.25,
          mb: 1,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'text.secondary',
            fontSize: '0.6rem',
            display: 'block',
            mb: 0.75,
          }}
        >
          Recent Activity
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Box
            sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'info.main', flexShrink: 0 }}
          />
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              fontSize: '0.68rem',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {member.totalEvaluations
              ? `${member.totalEvaluations} evaluations completed`
              : 'No evaluations yet'}
          </Typography>
        </Box>
        {member.avgResponseTimeMs > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: 'success.main',
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem' }}>
              Avg response: {member.avgResponseTimeMs}ms
            </Typography>
          </Box>
        )}
      </Box>

      {/* Footer: Stats + View Profile */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pt: 1,
          borderTop: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.3),
        }}
      >
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem' }}>
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {member.totalEvaluations || 0}
            </Box>{' '}
            evals
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem' }}>
            <Box
              component="span"
              sx={{
                fontWeight: 700,
                color: member.avgCostUsd < 0.005 ? 'success.main' : 'text.primary',
              }}
            >
              ${member.avgCostUsd?.toFixed(4) || '0.0000'}
            </Box>
            /eval
          </Typography>
        </Box>
        <Chip
          label="View Profile"
          size="small"
          sx={{
            height: 24,
            fontSize: '0.65rem',
            fontWeight: 600,
            cursor: 'pointer',
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            color: 'primary.main',
            border: '1px solid',
            borderColor: alpha(theme.palette.primary.main, 0.2),
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.15) },
          }}
        />
      </Box>
    </Paper>
  );
}
