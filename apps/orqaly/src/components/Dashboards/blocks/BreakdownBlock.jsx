import { Box, Typography, useTheme } from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import BlockShell from '../BlockShell';

export default function BreakdownBlock({ block, data, onSegmentClick, ...shellProps }) {
  const theme = useTheme();
  const rows = data?.rows || [];

  if (!rows.length) {
    return (
      <BlockShell title={block?.title || 'Breakdown'} {...shellProps}>
        <Empty />
      </BlockShell>
    );
  }

  const palette = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.error.main,
    theme.palette.info?.main || theme.palette.primary.dark,
  ];

  return (
    <BlockShell title={block?.title || 'Breakdown'} {...shellProps}>
      <Box sx={{ flex: 1, minHeight: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -10 }}>
            <CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="group"
              tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
              tickLine={false}
              axisLine={{ stroke: theme.palette.divider }}
              interval={0}
              angle={rows.length > 6 ? -20 : 0}
              textAnchor={rows.length > 6 ? 'end' : 'middle'}
              height={rows.length > 6 ? 50 : 30}
            />
            <YAxis
              tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
              tickLine={false}
              axisLine={{ stroke: theme.palette.divider }}
              width={36}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: `1px solid ${theme.palette.divider}`,
                background: theme.palette.background.paper,
              }}
            />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              onClick={(entry) =>
                onSegmentClick &&
                onSegmentClick({ dim: block?.data?.group_by?.field, value: entry.group })
              }
              cursor={onSegmentClick ? 'pointer' : undefined}
            >
              {rows.map((row, i) => (
                <Cell key={row.group} fill={palette[i % palette.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </BlockShell>
  );
}

function Empty() {
  return (
    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Typography variant="caption" color="text.secondary">
        No data for current filters.
      </Typography>
    </Box>
  );
}
