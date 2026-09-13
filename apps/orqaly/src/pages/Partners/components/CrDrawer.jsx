import { useEffect, useMemo, useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  Button,
  Popover,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { formatPercent } from '../../../utils/formatters';
import {
  formatMonthYear,
  parseMonthYear,
  getCampaignMetricsForPeriod,
} from '../utils/periodMetrics';

import AppIcon from '../../../components/icons/AppIcon';

export default function CrDrawer({ open, onClose, partner }) {
  const defaultPeriod = formatMonthYear(new Date());
  const [periodInput, setPeriodInput] = useState(defaultPeriod);
  const [periodAnchor, setPeriodAnchor] = useState(null);
  const parsedPeriod = parseMonthYear(periodInput) || parseMonthYear(defaultPeriod);
  const selectedPeriod = parsedPeriod;

  useEffect(() => {
    if (open) {
      setPeriodInput(defaultPeriod);
      setPeriodAnchor(null);
    }
  }, [open, defaultPeriod]);

  const campaigns = partner?.campaigns || [];
  const chartData = useMemo(
    () =>
      campaigns.map((c) => {
        const metrics = getCampaignMetricsForPeriod(c, selectedPeriod);
        return {
          name: (c.name || '').length > 18 ? (c.name || '').substring(0, 18) + '...' : c.name || '',
          cr: metrics.cr,
          status: c.status,
        };
      }),
    [campaigns, selectedPeriod]
  );
  const avgCr = useMemo(() => {
    if (chartData.length === 0) return 0;
    return Number(
      (chartData.reduce((sum, row) => sum + Number(row.cr || 0), 0) / chartData.length).toFixed(2)
    );
  }, [chartData]);

  if (!partner) return null;
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);
  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  const handlePeriodUpdate = (key, value) => {
    const month = key === 'month' ? value : selectedPeriod.month;
    const year = key === 'year' ? value : selectedPeriod.year;
    setPeriodInput(`${String(month).padStart(2, '0')}/${year}`);
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 520, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Conversion Rate
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {partner.name} &middot; {selectedPeriod.label} &middot; Avg {formatPercent(avgCr)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={
                <AppIcon name="CalendarToday" fallback={CalendarTodayIcon} sx={{ fontSize: 16 }} />
              }
              onClick={(e) => setPeriodAnchor(e.currentTarget)}
              sx={{ borderColor: 'divider', color: 'text.primary' }}
            >
              {selectedPeriod.label}
            </Button>
            <Popover
              open={Boolean(periodAnchor)}
              anchorEl={periodAnchor}
              onClose={() => setPeriodAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              slotProps={{ paper: { sx: { p: 2, width: 280 } } }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>
                Select Period
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Month</InputLabel>
                  <Select
                    value={selectedPeriod.month}
                    label="Month"
                    onChange={(e) => handlePeriodUpdate('month', e.target.value)}
                  >
                    {months.map((m) => (
                      <MenuItem key={m.value} value={m.value}>
                        {m.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Year</InputLabel>
                  <Select
                    value={selectedPeriod.year}
                    label="Year"
                    onChange={(e) => handlePeriodUpdate('year', e.target.value)}
                  >
                    {years.map((year) => (
                      <MenuItem key={year} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Popover>
            <IconButton onClick={onClose} size="small">
              <AppIcon name="Close" fallback={CloseIcon} />
            </IconButton>
          </Box>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Chart */}
        {campaigns.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No campaign data yet
          </Typography>
        ) : (
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <ResponsiveContainer width="100%" height={Math.max(300, campaigns.length * 40 + 60)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis
                  type="number"
                  domain={[0, 'auto']}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={140}
                  tick={{ fontSize: 10, fill: '#64748B' }}
                />
                <Tooltip
                  formatter={(value) => [`${value}%`, 'CR']}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: '0.8rem',
                  }}
                />
                <ReferenceLine
                  x={avgCr}
                  stroke="#EF4444"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  label={{
                    value: `Avg ${avgCr}%`,
                    position: 'top',
                    fill: '#EF4444',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
                <Bar dataKey="cr" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.cr >= avgCr ? '#10B981' : '#F59E0B'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
