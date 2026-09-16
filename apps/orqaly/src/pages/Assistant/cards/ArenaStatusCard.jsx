import { Box, Typography, Button, Chip, Divider } from '@mui/material';
import StadiumOutlinedIcon from '@mui/icons-material/StadiumOutlined';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import BentoCard from '../../../components/Common/BentoCard';
import AppIcon from '../../../components/icons/AppIcon';
import { money, duration } from '../../Arena/arenaFormat';

/**
 * Arena on the Assistant console: an invitation before it is set up, and the
 * week's score once it is. Sits directly under Company Brief.
 */
export default function ArenaStatusCard({ arena, onSetUp, onOpen }) {
  if (!arena) {
    return (
      <BentoCard
        title="Arena"
        subtitle="People vs agents on the same daily job"
        iconName="StadiumOutlined"
        icon={StadiumOutlinedIcon}
        action={
          <Chip size="small" variant="outlined" label="Not set up" sx={{ fontWeight: 700 }} />
        }
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            alignItems: 'flex-start',
            justifyContent: 'center',
            height: '100%',
          }}
        >
          <Typography sx={{ fontWeight: 700 }}>
            Put your people and your agents on the same daily jobs
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Pick the departments you actually run. Arena pairs every job with what your team
            delivered and what the agent delivered, then keeps the score.
          </Typography>
          <Button
            variant="contained"
            size="small"
            onClick={onSetUp}
            endIcon={
              <AppIcon
                name="ArrowForwardOutlined"
                fallback={ArrowForwardOutlinedIcon}
                sx={{ fontSize: 16 }}
              />
            }
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, mt: 0.5 }}
          >
            Set up Arena
          </Button>
        </Box>
      </BentoCard>
    );
  }

  const { wins, departments = [], savedMoney, savedMinutes, headline, warning, compared } = arena;

  return (
    <BentoCard
      title="Arena"
      subtitle="People vs agents on the same daily job"
      iconName="StadiumOutlined"
      icon={StadiumOutlinedIcon}
      action={
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
          Open
        </Button>
      }
      scrollBody
    >
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 1 }}>
        <Stat label="jobs compared" value={compared} />
        <Stat label="people won" value={wins?.people ?? 0} />
        <Stat label="agents won" value={wins?.agents ?? 0} />
        {savedMoney != null && <Stat label="agents saved" value={money(savedMoney)} />}
        {savedMinutes != null && <Stat label="time saved" value={duration(savedMinutes)} />}
      </Box>

      <Divider sx={{ mb: 1 }} />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          gap: 0.75,
        }}
      >
        {departments.map((d) => (
          <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
              {d.label}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
            >
              {d.n === 0 ? 'no jobs yet' : `${d.people} - ${d.agents}`}
            </Typography>
          </Box>
        ))}
      </Box>

      {(headline || warning) && (
        <>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {headline && (
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main' }}>
                ▸ {headline}
              </Typography>
            )}
            {warning && (
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'warning.main' }}>
                ⚠ {warning}
              </Typography>
            )}
          </Box>
        </>
      )}
    </BentoCard>
  );
}

function Stat({ label, value }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        color="text.disabled"
        sx={{ display: 'block', whiteSpace: 'nowrap' }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
  );
}
