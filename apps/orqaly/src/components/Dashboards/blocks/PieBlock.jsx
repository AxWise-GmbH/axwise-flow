import { Box, Typography, useTheme } from '@mui/material';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import BlockShell from '../BlockShell';

export default function PieBlock({ block, data, onSegmentClick, ...shellProps }) {
  const theme = useTheme();
  const rows = data?.rows || [];

  if (!rows.length) {
    return (
      <BlockShell title={block?.title || 'Share'} {...shellProps}>
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
    <BlockShell title={block?.title || 'Share'} {...shellProps}>
      <Box sx={{ flex: 1, minHeight: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="group"
              outerRadius="75%"
              innerRadius="40%"
              paddingAngle={2}
              onClick={(entry) =>
                onSegmentClick &&
                onSegmentClick({ dim: block?.data?.group_by?.field, value: entry.group })
              }
              cursor={onSegmentClick ? 'pointer' : undefined}
            >
              {rows.map((row, i) => (
                <Cell key={row.group} fill={palette[i % palette.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: `1px solid ${theme.palette.divider}`,
                background: theme.palette.background.paper,
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: theme.palette.text.secondary }}
              iconSize={8}
              iconType="circle"
            />
          </PieChart>
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
