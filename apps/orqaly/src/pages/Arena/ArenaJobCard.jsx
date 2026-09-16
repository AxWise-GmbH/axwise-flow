import {
  Box,
  Typography,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  alpha,
  useTheme,
} from '@mui/material';
import BentoCard from '../../components/Common/BentoCard';
import SideBlock from './SideBlock';
import { money, duration, when, DASH } from './arenaFormat';

const VERDICTS = [
  { value: 'people', label: 'People' },
  { value: 'agents', label: 'Agents' },
  { value: 'tie', label: 'Tie' },
];

/**
 * One job, two corners.
 *
 * The card is the unit that flips: side by side when there is room, one block
 * under the other when there is not. `stacked` is decided by the page (viewport
 * or Simple mode force it) rather than read here, so every card on the page
 * agrees.
 */
export default function ArenaJobCard({
  job,
  stacked = false,
  onOpen,
  onAction,
  onRate,
  onVerdict,
}) {
  const theme = useTheme();
  const paired = Boolean(job.people && job.agents);
  const savings = job.savings;

  return (
    <BentoCard noHeader data-testid={`arena-job-${job.taskId}`} sx={{ overflow: 'hidden' }}>
      {/* Job header: what the work was, for whom, by when. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          pb: 1,
          minWidth: 0,
        }}
      >
        <Typography sx={{ fontWeight: 800, minWidth: 0 }} noWrap>
          {job.title}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          label={job.departmentLabel}
          sx={{ height: 20, fontSize: '0.66rem', fontWeight: 700, flexShrink: 0 }}
        />
        {job.goalTitle && (
          <Typography variant="caption" color="text.disabled" noWrap sx={{ minWidth: 0 }}>
            {job.goalTitle}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {job.deadline && (
          <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
            due {when(job.deadline, { withTime: false })}
          </Typography>
        )}
      </Box>

      <Divider />

      {/* The two corners. minmax(0, 1fr) so a corner with wide content can shrink. */}
      <Box
        data-testid="arena-corners"
        data-layout={stacked ? 'stacked' : 'split'}
        sx={{
          display: 'grid',
          gap: '10px',
          alignItems: 'stretch',
          gridTemplateColumns: stacked ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)',
          pt: 1,
          '& > *:first-of-type': stacked
            ? { borderBottom: '1px solid', borderColor: 'divider', pb: 1 }
            : { borderRight: '1px solid', borderColor: 'divider', pr: '10px' },
        }}
      >
        <SideBlock side="people" job={job} onOpen={onOpen} onAction={onAction} onRate={onRate} />
        <SideBlock side="agents" job={job} onOpen={onOpen} onAction={onAction} onRate={onRate} />
      </Box>

      {/* The verdict only means something when both corners actually delivered. */}
      {paired && (
        <>
          <Divider sx={{ mt: 1 }} />
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.25,
              flexWrap: 'wrap',
              pt: 1,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.disabled' }}>
              VERDICT
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={job.verdict}
              onChange={(_, next) => next && onVerdict?.(job.taskId, next)}
              aria-label={`Who won ${job.title}`}
              sx={{
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  px: 1.25,
                  py: 0.25,
                  borderRadius: '8px !important',
                  border: '1px solid !important',
                },
              }}
            >
              {VERDICTS.map((v) => (
                <ToggleButton key={v.value} value={v.value} aria-label={v.label}>
                  {v.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Box sx={{ flex: 1 }} />

            {savings && (savings.money != null || savings.minutes != null) && (
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  px: 1,
                  py: 0.25,
                  borderRadius: 1.5,
                  bgcolor: alpha(
                    (savings.money ?? 0) >= 0
                      ? theme.palette.success.main
                      : theme.palette.warning.main,
                    0.12
                  ),
                  color:
                    (savings.money ?? 0) >= 0
                      ? theme.palette.success.main
                      : theme.palette.warning.main,
                }}
              >
                {(savings.money ?? 0) >= 0 ? 'agents saved' : 'agents cost'}{' '}
                {savings.money != null ? money(Math.abs(savings.money)) : DASH}
                {savings.minutes != null ? ` · ${duration(Math.abs(savings.minutes))}` : ''}
              </Typography>
            )}
          </Box>
        </>
      )}
    </BentoCard>
  );
}
