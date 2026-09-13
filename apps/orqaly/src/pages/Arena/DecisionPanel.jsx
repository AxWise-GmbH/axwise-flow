import { Box, Typography, Chip, Divider, Button, Tooltip, alpha, useTheme } from '@mui/material';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import BalanceOutlinedIcon from '@mui/icons-material/BalanceOutlined';
import BentoCard from '../../components/Common/BentoCard';
import EmptyState from '../../components/Common/EmptyState';
import AppIcon from '../../components/icons/AppIcon';
import {
  money,
  hours,
  percent,
  stars,
  duration,
  RECOMMENDATION_LABEL,
  RECOMMENDATION_TONE,
  CONFIDENCE_LABEL,
  DASH,
} from './arenaFormat';

/**
 * The payoff view: where daily work can move to agents, what that is worth, and
 * where it must not move.
 *
 * Every number behind a recommendation is shown rather than rolled into one
 * score, because a person has to be able to disagree with it. Nothing here
 * acts - Arena recommends, it never reassigns work.
 */
export default function DecisionPanel({ decision, loading, onOpenDepartment, onSetRates }) {
  const departments = decision?.departments || [];
  const anyMoney = departments.some((d) => d.money?.projectedSaving != null);
  const anyCompared = departments.some((d) => d.stats?.n > 0);

  if (!loading && !anyCompared) {
    return (
      <BentoCard
        title="Decide"
        subtitle="Where agents can take the work over"
        iconName="BalanceOutlined"
        icon={BalanceOutlinedIcon}
      >
        <EmptyState
          title="Nothing to decide yet"
          description="Arena needs jobs where both a person and an agent delivered. Compare a few, then come back."
        />
      </BentoCard>
    );
  }

  return (
    <BentoCard
      title="Decide"
      subtitle="Where agents can take the work over, and where they must not"
      iconName="BalanceOutlined"
      icon={BalanceOutlinedIcon}
      scrollBody
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {!anyMoney && (
          <Box
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: '1px dashed',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 200 }}>
              Arena does not know what your people cost, so it will not recommend a handover on
              money. Time and quality still work.
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={onSetRates}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
            >
              Set what people cost
            </Button>
          </Box>
        )}

        {departments.map((d) => (
          <DepartmentRow key={d.id} d={d} onOpen={() => onOpenDepartment?.(d.id)} />
        ))}

        <Divider />
        <Typography variant="caption" color="text.disabled">
          These are recommendations. Arena never reassigns work by itself.
        </Typography>
      </Box>
    </BentoCard>
  );
}

function DepartmentRow({ d, onOpen }) {
  const theme = useTheme();
  const tone = RECOMMENDATION_TONE[d.recommendation] || 'default';
  const toneColor = tone === 'default' ? theme.palette.text.disabled : theme.palette[tone].main;
  const s = d.stats || {};
  const m = d.money || {};
  const thin = d.recommendation === 'not_enough_yet';

  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: thin ? 'divider' : alpha(toneColor, 0.35),
        bgcolor: thin ? 'transparent' : alpha(toneColor, 0.05),
        minWidth: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
        <Typography sx={{ fontWeight: 800 }}>{d.label}</Typography>
        {d.stakes === 'high' && (
          <Chip
            size="small"
            variant="outlined"
            color="warning"
            label="high stakes"
            sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        <Chip
          size="small"
          label={RECOMMENDATION_LABEL[d.recommendation] || d.recommendation}
          color={tone === 'default' ? undefined : tone}
          variant={thin ? 'outlined' : 'filled'}
          sx={{ fontWeight: 800, letterSpacing: 0.3 }}
        />
        <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
          {CONFIDENCE_LABEL[d.confidence] || d.confidence}
        </Typography>
      </Box>

      {(d.reasons || []).length > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
          {d.reasons.join(' ')}
        </Typography>
      )}

      {!thin && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 0.75 }}>
          <Fact label="jobs compared" value={s.n} />
          <Fact label="agents win" value={percent(s.winRate)} />
          <Fact
            label="quality p/a"
            value={`${stars(s.avgStars?.people)} / ${stars(s.avgStars?.agents)}`}
          />
          <Fact
            label="cost p→a"
            value={`${money(s.avgCost?.people)} → ${money(s.avgCost?.agents)}`}
          />
          <Fact
            label="time p→a"
            value={`${duration(s.avgMinutes?.people)} → ${duration(s.avgMinutes?.agents)}`}
          />
          <Fact
            label="rework p/a"
            value={`${percent(s.reworkRate?.people)} / ${percent(s.reworkRate?.agents)}`}
          />
          <Fact label="coverage" value={percent(s.coverage)} />
        </Box>
      )}

      {(m.projectedSaving != null || m.capacityReleasedHours != null) && (
        <Tooltip title="A projection, not booked money. Scaled by how often the agents actually win, not by assuming a full handover.">
          <Box
            sx={{
              display: 'inline-flex',
              gap: 2,
              flexWrap: 'wrap',
              p: 1,
              borderRadius: 2,
              bgcolor: alpha(theme.palette.success.main, 0.1),
              mb: 0.75,
            }}
          >
            <Fact label="projected saving / month" value={money(m.projectedSaving)} strong />
            <Fact label="capacity released / month" value={hours(m.capacityReleasedHours)} strong />
          </Box>
        </Tooltip>
      )}

      {d.recommendation === 'keep_human' && d.confidence !== 'good' && (
        <Typography
          variant="caption"
          sx={{ color: 'warning.main', fontWeight: 700, display: 'block', mb: 0.5 }}
        >
          ⚠ Do not act on this yet. Compare more jobs first.
        </Typography>
      )}

      <Button
        size="small"
        onClick={onOpen}
        endIcon={
          <AppIcon
            name="ArrowForwardOutlined"
            fallback={ArrowForwardOutlinedIcon}
            sx={{ fontSize: 14 }}
          />
        }
        sx={{ textTransform: 'none', fontWeight: 700 }}
      >
        See the jobs
      </Button>
    </Box>
  );
}

function Fact({ label, value, strong = false }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        color="text.disabled"
        sx={{ display: 'block', whiteSpace: 'nowrap' }}
      >
        {label}
      </Typography>
      <Typography
        variant={strong ? 'body2' : 'caption'}
        sx={{
          fontWeight: strong ? 800 : 700,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {value ?? DASH}
      </Typography>
    </Box>
  );
}
