/**
 * ChartBlock — inline recharts line/bar/area chart from block.compact.data.
 *   compact: { title?, kind: 'line'|'bar'|'area', data: [{ label, value }] }
 */
import { Box, Typography, useTheme, alpha } from '@mui/material';
import {
  composerAccent,
  composerTooltipBg,
  composerBlockSx,
  composerInk,
  composerInkAlpha,
} from '../../../theme/composerSurface';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export default function ChartBlock({ block }) {
  const theme = useTheme();
  const c = block?.compact || {};
  const data = Array.isArray(c.data) ? c.data : [];
  const kind = c.kind || 'line';
  const stroke = composerAccent(theme);

  if (!data.length) return null;

  const axisProps = {
    stroke: composerInkAlpha(theme, 0.4),
    tick: { fill: composerInkAlpha(theme, 0.5), fontSize: 10 },
  };

  let Chart;
  let Series;
  if (kind === 'bar') {
    Chart = BarChart;
    Series = <Bar dataKey="value" fill={stroke} radius={[3, 3, 0, 0]} />;
  } else if (kind === 'area') {
    Chart = AreaChart;
    Series = <Area type="monotone" dataKey="value" stroke={stroke} fill={alpha(stroke, 0.25)} />;
  } else {
    Chart = LineChart;
    Series = <Line type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} dot={false} />;
  }

  return (
    <Box sx={{ borderRadius: 2, ...composerBlockSx(theme), p: 1.5 }}>
      {c.title && (
        <Typography variant="body2" sx={{ color: composerInk(theme), fontWeight: 600, mb: 1 }}>
          {c.title}
        </Typography>
      )}
      <Box sx={{ width: '100%', height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <Chart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={composerInkAlpha(theme, 0.06)} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip
              contentStyle={{
                background: composerTooltipBg(theme),
                border: `1px solid ${composerInkAlpha(theme, 0.1)}`,
                borderRadius: 8,
                color: composerInk(theme),
                fontSize: 12,
              }}
            />
            {Series}
          </Chart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
