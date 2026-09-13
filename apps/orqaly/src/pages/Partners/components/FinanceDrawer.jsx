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
  TableHead,
  TableRow,
  Chip,
  Stack,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { formatCurrency } from '../../../utils/formatters';
import {
  formatMonthYear,
  parseMonthYear,
  getFinanceSummary,
  getFinanceForPeriod,
} from '../utils/periodMetrics';
import AddPaymentDialog from './AddPaymentDialog';

import AppIcon from '../../../components/icons/AppIcon';

const formatDateTime = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} - ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export default function FinanceDrawer({ open, onClose, partner, onCreatePayment }) {
  const theme = useTheme();
  const defaultPeriod = formatMonthYear(new Date());
  const [periodInput, setPeriodInput] = useState(defaultPeriod);
  const [periodAnchor, setPeriodAnchor] = useState(null);
  const parsedPeriod = parseMonthYear(periodInput) || parseMonthYear(defaultPeriod);
  const selectedPeriod = parsedPeriod || {
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    key: '',
    label: defaultPeriod,
  };
  const [addPaymentDialogOpen, setAddPaymentDialogOpen] = useState(false);

  const baseSummary = partner ? getFinanceSummary(partner) : { total: 0, paid: 0, debt: 0 };
  const summary = partner ? getFinanceForPeriod(partner, baseSummary, selectedPeriod) : baseSummary;

  const payments = useMemo(() => {
    if (!partner) return [];
    const periodPayments = (
      Array.isArray(partner.financeTransactions) ? partner.financeTransactions : []
    ).filter((payment) => {
      const dt = new Date(payment.datetime || payment.date || payment.time || 0);
      return dt.getFullYear() === selectedPeriod.year && dt.getMonth() + 1 === selectedPeriod.month;
    });
    return periodPayments;
  }, [partner, selectedPeriod]);

  useEffect(() => {
    if (open) {
      setPeriodInput(defaultPeriod);
      setPeriodAnchor(null);
    }
  }, [open, defaultPeriod]);

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
    const month = key === 'month' ? Number(value) : selectedPeriod.month;
    const year = key === 'year' ? Number(value) : selectedPeriod.year;
    setPeriodInput(`${String(month).padStart(2, '0')}/${year}`);
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box
        sx={{
          width: 620,
          maxWidth: '100vw',
          p: 3,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            mb: 1.8,
          }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Finance
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {partner
                ? `${partner.name} • ${selectedPeriod.label} payment data`
                : 'Payment data for selected period. Same period as above.'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
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
            {partner && (
              <Button
                size="small"
                variant="contained"
                startIcon={<AppIcon name="Add" fallback={AddIcon} />}
                onClick={() => setAddPaymentDialogOpen(true)}
              >
                Add payment
              </Button>
            )}
            <IconButton onClick={onClose} size="small">
              <AppIcon name="Close" fallback={CloseIcon} />
            </IconButton>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.8 }}>
          <Chip
            label={`Total: ${formatCurrency(summary.total)}`}
            size="small"
            sx={{ bgcolor: '#F1F5F9', color: '#64748B' }}
          />
          <Chip
            label={`Paid: ${formatCurrency(summary.paid)}`}
            size="small"
            sx={{ bgcolor: '#D1FAE5', color: '#059669' }}
          />
          <Chip
            label={`Debt: ${formatCurrency(summary.debt)}`}
            size="small"
            sx={{ bgcolor: '#FEE2E2', color: '#DC2626' }}
          />
        </Box>

        <Divider sx={{ mb: 1.5 }} />

        <Box
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
                <TableCell sx={{ bgcolor: '#F8FAFC', fontWeight: 700 }}>Date/Time</TableCell>
                <TableCell sx={{ bgcolor: '#F8FAFC', fontWeight: 700 }}>
                  Payment Description
                </TableCell>
                <TableCell sx={{ bgcolor: '#F8FAFC', fontWeight: 700 }}>Type</TableCell>
                <TableCell sx={{ bgcolor: '#F8FAFC', fontWeight: 700 }}>Method</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 4, textAlign: 'center', border: 0 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                      No payments for this period
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{ display: 'block', mt: 0.5 }}
                    >
                      Click &quot;Add payment&quot; to record a new transaction.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((payment) => (
                  <TableRow key={payment.id} hover>
                    <TableCell>
                      <Typography variant="caption">{formatDateTime(payment.datetime)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        {payment.description}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontSize: '0.68rem' }}
                      >
                        {payment.type === 'crypto'
                          ? `Hash: ${payment.hash || 'pending-hash'}`
                          : `Statement: ${payment.statement || 'uploaded'}`}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={payment.type}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.62rem',
                          textTransform: 'uppercase',
                          bgcolor: payment.type === 'crypto' ? '#E0E7FF' : '#ECFEFF',
                          color: payment.type === 'crypto' ? '#4338CA' : '#0E7490',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{payment.method}</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {payment.type === 'crypto'
                          ? Number(payment.amount || 0).toFixed(6)
                          : Number(payment.amount || 0).toFixed(2)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Box>
      </Box>
      {partner && (
        <AddPaymentDialog
          open={addPaymentDialogOpen}
          onClose={() => setAddPaymentDialogOpen(false)}
          partner={partner}
          onSubmit={(partnerId, payload) => {
            onCreatePayment(partnerId, payload);
            setAddPaymentDialogOpen(false);
          }}
        />
      )}
    </Drawer>
  );
}
