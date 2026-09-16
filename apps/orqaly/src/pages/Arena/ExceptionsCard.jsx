import { Box, Typography, Chip, Divider } from '@mui/material';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import BentoCard from '../../components/Common/BentoCard';
import EmptyState from '../../components/Common/EmptyState';

/**
 * The risk list.
 *
 * For anything with compliance weight this matters more than the scoreboard: a
 * result that was accepted and then had to be redone, a high-stakes job the
 * agents lost, and an agent result nobody had a human counterpart to check
 * against.
 */
export default function ExceptionsCard({ exceptions, onOpenJob }) {
  const reworked = exceptions?.acceptedThenReworked || [];
  const losses = exceptions?.highStakesLosses || [];
  const unchecked = exceptions?.unchecked || [];
  const total = exceptions?.total ?? reworked.length + losses.length + unchecked.length;

  return (
    <BentoCard
      title="Needs a look"
      subtitle="Where the numbers hide a problem"
      iconName="WarningAmberOutlined"
      icon={WarningAmberOutlinedIcon}
      iconColor="warning"
      action={
        total > 0 ? (
          <Chip
            size="small"
            color="warning"
            label={`${total} item${total === 1 ? '' : 's'}`}
            sx={{ fontWeight: 700 }}
          />
        ) : null
      }
      scrollBody
    >
      {total === 0 ? (
        <EmptyState
          dense
          title="Nothing needs attention"
          description="No accepted result had to be redone, and no high-stakes job went the wrong way."
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Group
            title="Accepted, then reworked"
            hint="Signed off, then sent back. This is the cost stars do not show."
            items={reworked}
            render={(r) => (
              <ItemRow
                key={`${r.taskId}-${r.side}`}
                onClick={() => onOpenJob?.(r.taskId)}
                title={r.title}
                meta={`${r.departmentLabel} · ${r.side === 'agents' ? 'agent' : 'person'} result · sent back ${r.reworkedCount}x`}
              />
            )}
          />
          <Group
            title="High stakes, agents lost"
            hint="Departments held to a stricter bar, where the people still won."
            items={losses}
            render={(r) => (
              <ItemRow
                key={r.taskId}
                onClick={() => onOpenJob?.(r.taskId)}
                title={r.title}
                meta={`${r.departmentLabel} · people ${r.peopleStars ?? '—'}★ / agents ${r.agentStars ?? '—'}★`}
              />
            )}
          />
          <Group
            title="Accepted with nothing to check against"
            hint="An agent delivered and it was accepted, but no person did the same job. The quality is unverified."
            items={unchecked}
            render={(r) => (
              <ItemRow
                key={r.taskId}
                onClick={() => onOpenJob?.(r.taskId)}
                title={r.title}
                meta={`${r.departmentLabel} · ${r.actor || 'agent'}`}
              />
            )}
          />
        </Box>
      )}
    </BentoCard>
  );
}

function Group({ title, hint, items, render }) {
  if (!items.length) return null;
  return (
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 800, color: 'warning.main' }}>
        ⚠ {title}
      </Typography>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.5 }}>
        {hint}
      </Typography>
      <Divider sx={{ mb: 0.5 }} />
      {items.map(render)}
    </Box>
  );
}

function ItemRow({ title, meta, onClick }) {
  return (
    <Box
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      sx={{
        py: 0.5,
        minWidth: 0,
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { color: 'primary.main' } : undefined,
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
        {meta}
      </Typography>
    </Box>
  );
}
