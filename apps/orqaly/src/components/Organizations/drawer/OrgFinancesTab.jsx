import { Box, Typography, Paper, Divider, CircularProgress } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import { formatCurrency } from '../../../utils/formatters';
import FinanceCard from './FinanceCard';

export default function OrgFinancesTab({ finances, loadingFinances }) {
  const f = finances || {};

  if (loadingFinances) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(2, 1fr)', mb: 2.5 }}>
        <FinanceCard
          label="Total Invested"
          value={formatCurrency(f.invested)}
          color="#F59E0B"
          icon={AttachMoneyIcon}
        />
        <FinanceCard
          label="Total Returned"
          value={formatCurrency(f.returned)}
          color="#10B981"
          icon={TrendingUpIcon}
        />
        <FinanceCard
          label="Net Profit"
          value={formatCurrency(f.net_profit)}
          color={f.net_profit >= 0 ? '#10B981' : '#EF4444'}
          icon={f.net_profit >= 0 ? TrendingUpIcon : TrendingDownIcon}
        />
        <FinanceCard
          label="ROI"
          value={`${f.roi > 0 ? '+' : ''}${f.roi || 0}%`}
          color={f.roi >= 0 ? '#8B5CF6' : '#EF4444'}
          icon={TrendingUpIcon}
        />
      </Box>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        Expense Breakdown
      </Typography>
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(2, 1fr)', mb: 2.5 }}>
        {[
          { label: 'Token Spend', value: f.token_spend, color: '#5B8DEF' },
          { label: 'Ad Spend', value: f.ad_spend, color: '#F59E0B' },
          { label: 'Services', value: f.service_cost, color: '#8B5CF6' },
          { label: 'Infrastructure', value: f.infrastructure, color: '#06B6D4' },
        ].map((item) => (
          <Paper
            key={item.label}
            elevation={0}
            sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          >
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.65rem' }}
            >
              {item.label}
            </Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: item.color, mt: 0.25 }}>
              {formatCurrency(item.value || 0)}
            </Typography>
          </Paper>
        ))}
      </Box>

      {f.budget > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Budget Overview
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Total Budget
              </Typography>
              <Typography sx={{ fontWeight: 700 }}>{formatCurrency(f.budget)}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Spent
              </Typography>
              <Typography sx={{ fontWeight: 700, color: '#EF4444' }}>
                {formatCurrency(f.spent)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Remaining
              </Typography>
              <Typography sx={{ fontWeight: 700, color: '#10B981' }}>
                {formatCurrency((f.budget || 0) - (f.spent || 0))}
              </Typography>
            </Box>
          </Box>
        </>
      )}
    </>
  );
}
