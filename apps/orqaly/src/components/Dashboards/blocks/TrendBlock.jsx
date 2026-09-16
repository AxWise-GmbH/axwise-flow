import { Box, Typography, useTheme } from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import BlockShell from '../BlockShell';

export default function TrendBlock({ block, data, ...shellProps }) {
  const theme = useTheme();
  const rows = data?.rows || [];
  if (!rows.length) {
    return (
      <BlockShell title={block?.title || 'Trend'} {...shellProps}>
        <Empty />
      </BlockShell>
    );
  }
  return (
    <BlockShell title={block?.title || 'Trend'} {...shellProps}>
      <Box sx={{ flex: 1, minHeight: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -10 }}>
            <CartesianGrid stroke={theme.palette.divider} strokeDasharray="3 3" />
            <XAxis
              dataKey="group"
              tick={{ fontSize: 10, fill: theme.palette.text.secondary }}
              tickLine={false}
              axisLine={{ stroke: theme.palette.divider }}
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
            <Line
              type="monotone"
              dataKey="value"
              stroke={theme.palette.primary.main}
              strokeWidth={2}
              dot={{ r: 2, fill: theme.palette.primary.main }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </BlockShell>
  );
}

function Empty() {
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Typography variant="caption" color="text.secondary">
        No data for current filters.
      </Typography>
    </Box>
  );
}
