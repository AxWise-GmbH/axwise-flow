/**
 * Public investor profile page - accessible via /investments/investor/:id
 * No login required. UUID is the access control.
 */
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Chip,
  Avatar,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  LinearProgress,
  Divider,
  Button,
  Tooltip,
} from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { getPublicInvestor } from '../../services/investmentService';

import AppIcon from '../../components/icons/AppIcon';

const RISK_COLORS = { low: '#059669', medium: '#D97706', high: '#DC2626', critical: '#7C3AED' };
const CHART_COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#10B981'];

export default function InvestorProfile() {
  const { id } = useParams();
  const [investor, setInvestor] = useState(null);
  const [commitments, setCommitments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getPublicInvestor(id)
      .then(({ investor: inv, commitments: c, transactions: t }) => {
        setInvestor(inv);
        setCommitments(c || []);
        setTransactions(t || []);
      })
      .catch((err) => setError(err.message || 'Investor not found'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Build industry breakdown for pie chart
  const industryData = commitments.reduce((acc, c) => {
    const industry = c.investment_deals?.industry || 'Other';
    const existing = acc.find((x) => x.name === industry);
    if (existing) existing.value += Number(c.amount || 0);
    else acc.push({ name: industry, value: Number(c.amount || 0) });
    return acc;
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !investor) {
    return (
      <Box sx={{ textAlign: 'center', mt: 10 }}>
        <Typography variant="h5" color="error">
          {error || 'Investor not found'}
        </Typography>
      </Box>
    );
  }

  const totalInvested = Number(investor.total_invested || 0);
  const totalReturns = Number(investor.total_returns || 0);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, md: 4 } }}>
      {/* Header */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Avatar
            sx={{
              width: 64,
              height: 64,
              bgcolor: investor.investor_type === 'ai' ? '#7C3AED' : '#2563EB',
            }}
          >
            {investor.investor_type === 'ai' ? (
              <AppIcon
                name="SmartToyOutlined"
                fallback={SmartToyOutlinedIcon}
                sx={{ fontSize: 32 }}
              />
            ) : (
              <AppIcon name="PersonOutlined" fallback={PersonOutlinedIcon} sx={{ fontSize: 32 }} />
            )}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography variant="h4" fontWeight={700}>
              {investor.name}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
              <Chip
                label={investor.investor_type === 'ai' ? 'AI Investor' : 'Human Investor'}
                size="small"
                sx={{
                  bgcolor: investor.investor_type === 'ai' ? '#7C3AED22' : '#2563EB22',
                  color: investor.investor_type === 'ai' ? '#7C3AED' : '#2563EB',
                }}
              />
              <Chip label={investor.risk_profile} size="small" variant="outlined" />
              {investor.trust_score != null && (
                <Chip
                  label={`Trust: ${investor.trust_score}/100`}
                  size="small"
                  sx={{
                    bgcolor: investor.trust_score >= 70 ? '#05966922' : '#D9770622',
                    color: investor.trust_score >= 70 ? '#059669' : '#D97706',
                  }}
                />
              )}
            </Box>
          </Box>
          <Tooltip title={copied ? 'Copied!' : 'Copy shareable link'}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AppIcon name="ContentCopy" fallback={ContentCopyIcon} />}
              onClick={handleCopyLink}
            >
              {copied ? 'Copied' : 'Share'}
            </Button>
          </Tooltip>
        </Box>
        {investor.bio && (
          <Typography sx={{ mt: 2, color: 'text.secondary' }}>{investor.bio}</Typography>
        )}
      </Paper>
      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          {
            label: 'Total Invested',
            value: `$${totalInvested.toLocaleString()}`,
            color: '#2563EB',
          },
          { label: 'Total Returns', value: `$${totalReturns.toLocaleString()}`, color: '#059669' },
          { label: 'Active Deals', value: commitments.length, color: '#7C3AED' },
          {
            label: 'Capacity',
            value: `$${Number(investor.investment_capacity || 0).toLocaleString()}`,
            color: '#D97706',
          },
        ].map((s) => (
          <Grid item xs={6} sm={3} key={s.label}>
            <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
              <Typography variant="h5" fontWeight={700} sx={{ color: s.color }}>
                {s.value}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {s.label}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
      {/* Active Deals + Portfolio Chart */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              Active Investments
            </Typography>
            {commitments.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                No active investments
              </Typography>
            ) : (
              commitments.map((c) => (
                <Box key={c.id} sx={{ mb: 2 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 0.5,
                    }}
                  >
                    <Typography fontWeight={500}>
                      {c.investment_deals?.title || 'Unknown Deal'}
                    </Typography>
                    <Typography fontWeight={600} sx={{ color: '#059669' }}>
                      ${Number(c.amount).toLocaleString()}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Chip
                      label={c.investment_deals?.status || 'unknown'}
                      size="small"
                      variant="outlined"
                    />
                    {c.investment_deals?.risk_level && (
                      <Chip
                        label={c.investment_deals.risk_level}
                        size="small"
                        sx={{
                          color: RISK_COLORS[c.investment_deals.risk_level] || '#888',
                          borderColor: RISK_COLORS[c.investment_deals.risk_level] || '#888',
                        }}
                        variant="outlined"
                      />
                    )}
                    {c.investment_deals?.industry && (
                      <Chip label={c.investment_deals.industry} size="small" variant="outlined" />
                    )}
                  </Box>
                  <Divider sx={{ mt: 1.5 }} />
                </Box>
              ))
            )}
          </Paper>
        </Grid>

        {industryData.length > 0 && (
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Portfolio by Industry
              </Typography>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={industryData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                  >
                    {industryData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartTooltip formatter={(v) => `$${Number(v).toLocaleString()}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        )}
      </Grid>
      {/* Transaction History */}
      {transactions.length > 0 && (
        <Paper sx={{ p: 2, borderRadius: 2 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Transaction History
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Chip label={t.transaction_type} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{t.description || '-'}</TableCell>
                    <TableCell
                      align="right"
                      sx={{ color: t.transaction_type === 'return' ? '#059669' : 'inherit' }}
                    >
                      ${Number(t.amount).toLocaleString()}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {new Date(t.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
}
