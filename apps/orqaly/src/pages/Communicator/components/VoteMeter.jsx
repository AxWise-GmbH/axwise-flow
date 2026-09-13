/**
 * [module: design-system + consilium]
 * VoteMeter - vote-in-progress widget for Consilium boards.
 *
 * Shows N segments (one per board member) coloured by their stance:
 *   ✓ approve  → green
 *   ✕ reject   → red
 *   ⏳ pending → gray
 *
 * Below the bar: a row of small member chips with the same stance icon. Hover
 * a member → tooltip with their latest opinion snippet.
 *
 * Props:
 *   members: [{ id, name, vote: 'approve'|'reject'|'pending', opinion?: string }]
 *   compact: boolean
 */
import { Box, Typography, Tooltip, useTheme, alpha } from '@mui/material';

const STANCE = {
  approve: { color: '#22c55e', icon: '✓', label: 'Approve' },
  reject: { color: '#ef4444', icon: '✕', label: 'Reject' },
  pending: { color: '#667085', icon: '·', label: 'Pending' },
};

function initialsOf(name = '') {
  return (
    String(name)
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export default function VoteMeter({ members = [], compact = false }) {
  const theme = useTheme();
  const total = members.length;
  if (total === 0) {
    return (
      <Typography
        variant="caption"
        sx={{ color: 'text.disabled', fontStyle: 'italic', fontSize: '0.72rem' }}
      >
        No members yet
      </Typography>
    );
  }

  const counts = members.reduce((acc, m) => {
    acc[m.vote || 'pending'] = (acc[m.vote || 'pending'] || 0) + 1;
    return acc;
  }, {});
  const voted = (counts.approve || 0) + (counts.reject || 0);
  const decided = voted >= total ? (counts.approve > counts.reject ? 'approve' : 'reject') : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: compact ? 0.5 : 0.75 }}>
      {/* Header line */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 18 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            fontSize: '0.66rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'text.secondary',
          }}
        >
          Vote · {voted} / {total}
        </Typography>
        {decided ? (
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.66rem',
              fontWeight: 700,
              color: STANCE[decided].color,
              bgcolor: alpha(STANCE[decided].color, 0.14),
              px: 0.75,
              py: 0.1,
              borderRadius: 0.75,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {STANCE[decided].label}d
          </Typography>
        ) : (
          <Typography variant="caption" sx={{ fontSize: '0.66rem', color: 'text.disabled' }}>
            In progress
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {Object.entries(counts)
          .filter(([, n]) => n > 0)
          .map(([stance, n]) => (
            <Typography
              key={stance}
              variant="caption"
              sx={{
                fontSize: '0.62rem',
                color: STANCE[stance].color,
                fontWeight: 700,
              }}
            >
              {STANCE[stance].icon} {n}
            </Typography>
          ))}
      </Box>

      {/* Segmented bar */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          height: compact ? 6 : 8,
        }}
      >
        {members.map((m) => {
          const stance = STANCE[m.vote || 'pending'];
          return (
            <Tooltip
              key={m.id || m.name}
              title={`${m.name || 'Member'} - ${stance.label}${m.opinion ? `: ${String(m.opinion).slice(0, 200)}` : ''}`}
            >
              <Box
                sx={{
                  flex: 1,
                  bgcolor:
                    m.vote === 'pending' ? alpha(theme.palette.text.primary, 0.1) : stance.color,
                  borderRadius: 1,
                  transition: 'background-color 0.3s',
                  cursor: 'help',
                }}
              />
            </Tooltip>
          );
        })}
      </Box>

      {/* Member avatars row */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: compact ? 0 : 0.25 }}>
        {members.map((m) => {
          const stance = STANCE[m.vote || 'pending'];
          return (
            <Tooltip
              key={`a-${m.id || m.name}`}
              title={`${m.name || 'Member'} · ${stance.label}${m.opinion ? `\n${String(m.opinion).slice(0, 200)}` : ''}`}
              componentsProps={{ tooltip: { sx: { whiteSpace: 'pre-wrap' } } }}
            >
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 0.75,
                  py: 0.25,
                  borderRadius: 1.25,
                  bgcolor: alpha(stance.color, m.vote === 'pending' ? 0.08 : 0.14),
                  color: m.vote === 'pending' ? 'text.secondary' : stance.color,
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  cursor: 'help',
                }}
              >
                <Box
                  component="span"
                  sx={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    bgcolor:
                      m.vote === 'pending' ? alpha(theme.palette.text.primary, 0.16) : stance.color,
                    color: 'white',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.5rem',
                    fontWeight: 800,
                  }}
                >
                  {initialsOf(m.name)}
                </Box>
                <Box
                  component="span"
                  sx={{
                    maxWidth: 90,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.name?.split(/\s+/)[0] || '-'}
                </Box>
                <Box component="span">{stance.icon}</Box>
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
}
