import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import LeaderboardOutlinedIcon from '@mui/icons-material/LeaderboardOutlined';
import BentoCard from '../../components/Common/BentoCard';
import EmptyState from '../../components/Common/EmptyState';
import { money, duration, percent, stars, DASH } from './arenaFormat';

const NUM = { align: 'right', sx: { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } };

/**
 * Per-department rollup: who won, and what it cost in money, time and rework.
 *
 * `cover` is the honesty column. A 4-1 lead across 5 of 200 jobs a month is
 * noise, and the page says so rather than letting the win column speak alone.
 */
export default function ArenaScoreboard({ scoreboard, loading }) {
  const departments = scoreboard?.departments || [];
  const totals = scoreboard?.totals;
  const hasAny = departments.some((d) => d.n > 0);

  return (
    <BentoCard
      title="Scoreboard"
      subtitle="What each department cost, and who delivered it"
      iconName="LeaderboardOutlined"
      icon={LeaderboardOutlinedIcon}
      scrollBody
    >
      {!loading && !hasAny ? (
        <EmptyState
          dense
          title="Nothing compared yet"
          description="Once a job has a result from both a person and an agent, its department shows up here."
        />
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" aria-label="Arena scoreboard by department">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 800 }}>Department</TableCell>
                <TableCell {...NUM}>p</TableCell>
                <TableCell {...NUM}>a</TableCell>
                <TableCell {...NUM}>t</TableCell>
                <TableCell {...NUM}>avg&nbsp;★ p/a</TableCell>
                <TableCell {...NUM}>cost/job p→a</TableCell>
                <TableCell {...NUM}>time/job p→a</TableCell>
                <TableCell {...NUM}>rework p/a</TableCell>
                <TableCell {...NUM}>cover</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {departments.map((d) => (
                <TableRow key={d.id} hover>
                  <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {d.label}
                    {d.stakes === 'high' && (
                      <Chip
                        size="small"
                        label="high stakes"
                        color="warning"
                        variant="outlined"
                        sx={{ ml: 0.75, height: 18, fontSize: '0.62rem', fontWeight: 700 }}
                      />
                    )}
                  </TableCell>
                  <TableCell {...NUM}>{d.wins.people}</TableCell>
                  <TableCell {...NUM}>{d.wins.agents}</TableCell>
                  <TableCell {...NUM}>{d.wins.tie}</TableCell>
                  <TableCell {...NUM}>
                    {stars(d.avgStars.people)} / {stars(d.avgStars.agents)}
                  </TableCell>
                  <TableCell {...NUM}>
                    {money(d.avgCost.people)} → {money(d.avgCost.agents)}
                  </TableCell>
                  <TableCell {...NUM}>
                    {duration(d.avgMinutes.people)} → {duration(d.avgMinutes.agents)}
                  </TableCell>
                  <TableCell {...NUM}>
                    {percent(d.reworkRate.people)} / {percent(d.reworkRate.agents)}
                  </TableCell>
                  <TableCell {...NUM}>{percent(d.coverage)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {totals && (
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            flexWrap: 'wrap',
            pt: 1.25,
            mt: 1.25,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Metric label="Monthly spend, people" value={money(totals.monthlyPeopleCost)} />
          <Metric label="Monthly spend, agents" value={money(totals.monthlyAgentSpend)} />
          <Metric label="Coverage of your job volume" value={percent(totals.coverage)} />
          {totals.monthlyPeopleCost == null && (
            <Typography variant="caption" color="text.disabled" sx={{ alignSelf: 'center' }}>
              Money stays blank until you set what your people cost.
            </Typography>
          )}
        </Box>
      )}
    </BentoCard>
  );
}

function Metric({ label, value }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {value ?? DASH}
      </Typography>
    </Box>
  );
}
