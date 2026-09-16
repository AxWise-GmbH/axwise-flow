/**
 * [module: design-system + agent-core]
 * PhaseProgress - phase progress bar + live-talker pulsing avatar for
 * agent-room goal cards. Indicates where a goal is in its pipeline and
 * who (if anyone) is actively contributing right now.
 *
 * Props:
 *   currentPhase   number (1-indexed)   e.g. 3
 *   totalPhases    number               e.g. 5
 *   phaseName      string (optional)    e.g. "Execution"
 *   activeSpeaker  { name, role, color?, avatar? } | null   null = idle
 *   lastMessageAt  ISO string (optional)  for the "Idle - Xm ago" fallback
 *   compact        boolean               smaller variant for tight cards
 */
import { Box, Typography, Tooltip, useTheme, alpha, keyframes } from '@mui/material';

const speakerPulse = keyframes`
  0%   { box-shadow: 0 0 0 0   rgba(34, 197, 94, 0.55); }
  70%  { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
  100% { box-shadow: 0 0 0 0   rgba(34, 197, 94, 0); }
`;

const ROLE_COLORS = ['#229ED9', '#8b5cf6', '#ec4899', '#22c55e', '#f59e0b', '#ef4444'];

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

function colorFor(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ROLE_COLORS[Math.abs(h) % ROLE_COLORS.length];
}

function formatAgo(iso) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0 || !Number.isFinite(ms)) return null;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

export default function PhaseProgress({
  currentPhase = 0,
  totalPhases = 0,
  phaseName = '',
  activeSpeaker = null,
  lastMessageAt = null,
  compact = false,
}) {
  const theme = useTheme();
  const current = Math.max(0, Number(currentPhase) || 0);
  const total = Math.max(0, Number(totalPhases) || 0);
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  const speakerColor = activeSpeaker?.color || colorFor(activeSpeaker?.name);
  const ago = formatAgo(lastMessageAt);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: compact ? 0.5 : 0.75 }}>
      {/* Header line: phase x/N · phase name · live-talker */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 22 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            fontSize: '0.66rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'text.secondary',
            flexShrink: 0,
          }}
        >
          {total > 0 ? `Phase ${current} / ${total}` : 'Phase'}
        </Typography>
        {phaseName && (
          <Typography
            variant="caption"
            sx={{ fontSize: '0.7rem', color: 'text.primary', fontWeight: 600 }}
            noWrap
          >
            · {phaseName}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {activeSpeaker ? (
          <Tooltip
            title={`${activeSpeaker.name}${activeSpeaker.role ? ` · ${activeSpeaker.role}` : ''} - speaking`}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
              <Box
                sx={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  bgcolor: speakerColor,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.55rem',
                  fontWeight: 800,
                  animation: `${speakerPulse} 1.6s ease-out infinite`,
                  flexShrink: 0,
                }}
              >
                {initialsOf(activeSpeaker.name)}
              </Box>
              <Typography
                variant="caption"
                sx={{ fontSize: '0.66rem', color: 'success.main', fontWeight: 700 }}
              >
                {activeSpeaker.name?.split(/\s+/)[0] || 'Live'}
              </Typography>
            </Box>
          </Tooltip>
        ) : ago ? (
          <Typography variant="caption" sx={{ fontSize: '0.66rem', color: 'text.disabled' }}>
            Idle · last {ago}
          </Typography>
        ) : null}
      </Box>

      {/* Bar */}
      {total > 0 && (
        <Box
          sx={{
            position: 'relative',
            height: compact ? 5 : 6,
            borderRadius: 999,
            bgcolor: alpha(theme.palette.text.primary, 0.08),
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${alpha(theme.palette.primary.main, 0.7)})`,
              borderRadius: 999,
              transition: 'width 0.6s cubic-bezier(0.4, 0.0, 0.2, 1)',
            }}
          />
        </Box>
      )}
    </Box>
  );
}
