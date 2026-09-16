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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import {
  formatMonthYear,
  parseMonthYear,
  getCampaignMetricsForPeriod,
} from '../utils/periodMetrics';

import AppIcon from '../../../components/icons/AppIcon';

export default function FtdDrawer({ open, onClose, partner }) {
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
  const periodizedCampaigns = useMemo(
    () =>
      campaigns.map((campaign) => ({
        ...campaign,
        metrics: getCampaignMetricsForPeriod(campaign, selectedPeriod),
      })),
    [campaigns, selectedPeriod]
  );

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

  const totalFtd = periodizedCampaigns.reduce((sum, c) => sum + Number(c.metrics.ftd || 0), 0);

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 520, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              FTD Breakdown
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {partner.name} &middot; {selectedPeriod.label} &middot; {totalFtd} total FTDs
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

        <Divider sx={{ mb: 2 }} />

        {/* Table */}
        <TableContainer
          sx={{
            flex: 1,
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ bgcolor: '#F8FAFC', fontWeight: 700 }}>Campaign</TableCell>
                <TableCell align="center" sx={{ bgcolor: '#F8FAFC', fontWeight: 700 }}>
                  Status
                </TableCell>
                <TableCell align="right" sx={{ bgcolor: '#F8FAFC', fontWeight: 700 }}>
                  FTD
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {periodizedCampaigns.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                      {c.name}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={c.status}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.62rem',
                        fontWeight: 600,
                        bgcolor:
                          c.status === 'Active'
                            ? '#D1FAE5'
                            : c.status === 'Paused'
                              ? '#FEF3C7'
                              : '#F1F5F9',
                        color:
                          c.status === 'Active'
                            ? '#059669'
                            : c.status === 'Paused'
                              ? '#D97706'
                              : '#64748B',
                      }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {c.metrics.ftd}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}

              {/* Summary row */}
              <TableRow>
                <TableCell colSpan={2}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Total
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {totalFtd}
                  </Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Drawer>
  );
}
