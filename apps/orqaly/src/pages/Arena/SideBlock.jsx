import { Box, Typography, Chip, Button, Rating, Tooltip, useTheme } from '@mui/material';
import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import AppIcon from '../../components/icons/AppIcon';
import { money, duration, when, OUTCOME_LABEL, MODE_LABEL } from './arenaFormat';

const SIDE_META = {
  people: {
    label: 'Our people',
    empty: 'Nothing registered yet',
    emptyHint: 'Add what your employee delivered so this job can be compared.',
    cta: 'Register a result',
    ctaIcon: UploadFileOutlinedIcon,
    ctaIconName: 'UploadFileOutlined',
  },
  agents: {
    label: 'Our agents',
    empty: 'The agent has not run this',
    emptyHint: 'Send the agent at the same job to get a second result to compare.',
    cta: 'Run the agent',
    ctaIcon: PlayArrowOutlinedIcon,
    ctaIconName: 'PlayArrowOutlined',
  },
};

/**
 * One corner of a job. The same component renders both sides — `side` drives the
 * label, the empty state and which action is offered — so the two corners can
 * never drift apart visually and imply a difference that is not there.
 */
export default function SideBlock({ side, job, onOpen, onAction, onRate, dense = false }) {
  const theme = useTheme();
  const meta = SIDE_META[side];
  const submission = job?.[side] || null;
  const isAgents = side === 'agents';

  const actorName =
    submission?.actor_name || (isAgents ? job?.agent?.name : job?.assignedTo) || 'Unassigned';
  const actorRole = submission?.actor_role || (isAgents ? job?.agent?.role : null);

  if (!submission) {
    return (
      <Box
        data-testid={`arena-side-${side}`}
        sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, py: 0.5 }}
      >
        <SideHeader label={meta.label} name={actorName} role={actorRole} muted />
        <Typography variant="body2" color="text.secondary">
          {meta.empty}
        </Typography>
        {!dense && (
          <Typography variant="caption" color="text.disabled">
            {meta.emptyHint}
          </Typography>
        )}
        <Box>
          <Button
            size="small"
            variant="outlined"
            onClick={() => onAction?.(side)}
            startIcon={
              <AppIcon name={meta.ctaIconName} fallback={meta.ctaIcon} sx={{ fontSize: 16 }} />
            }
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, mt: 0.5 }}
          >
            {meta.cta}
          </Button>
        </Box>
      </Box>
    );
  }

  const assets = Array.isArray(submission.assets) ? submission.assets : [];
  const evidence = Array.isArray(submission.evidence) ? submission.evidence : [];
  const mode = submission.run?.mode;

  return (
    <Box
      data-testid={`arena-side-${side}`}
      sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0, py: 0.5 }}
    >
      <SideHeader label={meta.label} name={actorName} role={actorRole} />

      {isAgents && mode && (
        <Chip
          size="small"
          variant="outlined"
          label={MODE_LABEL[mode] || mode}
          sx={{ alignSelf: 'flex-start', fontWeight: 600, height: 20, fontSize: '0.68rem' }}
        />
      )}

      {/* Phase 2: activity pulled from the stack the team already works in. */}
      {evidence.map((e, i) => (
        <Typography
          key={`${e.source}-${e.ref}-${i}`}
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ minWidth: 0 }}
        >
          ⎇ {e.source} {e.ref} {e.title ? `· ${e.title}` : ''}
        </Typography>
      ))}

      {assets.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {assets.slice(0, 6).map((a, i) => (
            <Chip
              key={`${a.name}-${i}`}
              size="small"
              variant="outlined"
              icon={
                <AppIcon
                  name={a.kind === 'link' ? 'LinkOutlined' : 'AttachFileOutlined'}
                  fallback={a.kind === 'link' ? LinkOutlinedIcon : AttachFileOutlinedIcon}
                />
              }
              label={a.name}
              sx={{ maxWidth: 190, height: 22, fontSize: '0.68rem' }}
            />
          ))}
          {assets.length > 6 && (
            <Chip size="small" label={`+${assets.length - 6}`} sx={{ height: 22 }} />
          )}
        </Box>
      )}

      {submission.note && (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }} noWrap>
          {submission.note}
        </Typography>
      )}

      {/* The business line: time, money, and whether it was actually usable. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.25 }}>
        <Tooltip
          title={
            submission.minutes_derived
              ? 'Estimated from when the job was assigned to when it was registered, not measured effort.'
              : ''
          }
        >
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              color: submission.minutes_derived ? 'text.disabled' : 'text.secondary',
            }}
          >
            {duration(submission.minutes_spent)}
            {submission.minutes_derived ? '*' : ''}
          </Typography>
        </Tooltip>
        <Typography variant="caption" color="text.disabled">
          ·
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
          {money(submission.cost_usd, submission.currency)}
        </Typography>
        {submission.outcome && (
          <Chip
            size="small"
            label={OUTCOME_LABEL[submission.outcome] || submission.outcome}
            color={
              submission.outcome === 'accepted'
                ? 'success'
                : submission.outcome === 'rework'
                  ? 'warning'
                  : 'error'
            }
            variant="outlined"
            sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700 }}
          />
        )}
        {submission.reworked_count > 0 && (
          <Typography variant="caption" sx={{ color: theme.palette.warning.main, fontWeight: 700 }}>
            sent back {submission.reworked_count}x
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 'auto', pt: 0.5 }}>
        <Rating
          size="small"
          value={submission.rating ?? 0}
          onChange={(_, next) => next && onRate?.(side, next)}
          aria-label={`Rate what ${meta.label.toLowerCase()} delivered`}
        />
        <Typography variant="caption" color="text.disabled" sx={{ flex: 1, minWidth: 0 }} noWrap>
          {when(submission.registered_at)}
        </Typography>
        <Button
          size="small"
          onClick={() => onOpen?.(side)}
          endIcon={
            <AppIcon
              name="OpenInNewOutlined"
              fallback={OpenInNewOutlinedIcon}
              sx={{ fontSize: 14 }}
            />
          }
          sx={{ textTransform: 'none', fontWeight: 700, flexShrink: 0 }}
        >
          Open
        </Button>
      </Box>
    </Box>
  );
}

function SideHeader({ label, name, role, muted = false }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 800,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: 'text.disabled',
          flexShrink: 0,
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: 700, color: muted ? 'text.secondary' : 'text.primary', minWidth: 0 }}
        noWrap
      >
        {name}
      </Typography>
      {role && (
        <Typography variant="caption" color="text.disabled" noWrap sx={{ minWidth: 0 }}>
          {role}
        </Typography>
      )}
    </Box>
  );
}

export { SIDE_META };
