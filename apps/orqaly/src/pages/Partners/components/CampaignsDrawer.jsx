import { useEffect, useMemo, useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Chip,
  Card,
  CardContent,
  Divider,
  Button,
  TextField,
  Link,
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
  alpha,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { formatPercent } from '../../../utils/formatters';
import {
  formatMonthYear,
  parseMonthYear,
  getCampaignMetricsForPeriod,
} from '../utils/periodMetrics';
import { createHoverGlowShadow } from '../../../theme/hoverGlow';

import AppIcon from '../../../components/icons/AppIcon';

const statusColors = {
  Active: { bg: '#D1FAE5', color: '#059669' },
  Paused: { bg: '#FEF3C7', color: '#D97706' },
  Ended: { bg: '#F1F5F9', color: '#64748B' },
};

function getRegionFromCampaign(campaignName = '') {
  const token = campaignName.split('_')[0];
  return token || 'GLOBAL';
}

function escapeHtml(s) {
  if (s == null) return '';
  const str = String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function CampaignsDrawer({ open, onClose, partner, onAddCampaign }) {
  const theme = useTheme();
  const campaigns = partner?.campaigns || [];
  const defaultPeriod = formatMonthYear(new Date());
  const [periodInput, setPeriodInput] = useState(defaultPeriod);
  const [periodAnchor, setPeriodAnchor] = useState(null);
  const selectedPeriod = parseMonthYear(periodInput) || parseMonthYear(defaultPeriod);
  const [isAdding, setIsAdding] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [region, setRegion] = useState('');
  const [regionLink, setRegionLink] = useState('');
  const [comment, setComment] = useState('');
  const [linkTests, setLinkTests] = useState({});

  useEffect(() => {
    if (open) {
      setPeriodInput(defaultPeriod);
      setPeriodAnchor(null);
    }
  }, [open, defaultPeriod]);

  const periodizedCampaigns = useMemo(
    () =>
      campaigns.map((campaign) => ({
        ...campaign,
        metrics: getCampaignMetricsForPeriod(campaign, selectedPeriod),
      })),
    [campaigns, selectedPeriod]
  );

  const groupedByRegion = useMemo(() => {
    return periodizedCampaigns.reduce((acc, campaign) => {
      const regionCode = campaign.region || getRegionFromCampaign(campaign.name);
      if (!acc[regionCode]) {
        acc[regionCode] = [];
      }
      acc[regionCode].push(campaign);
      return acc;
    }, {});
  }, [periodizedCampaigns]);

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

  const handleAddNew = () => {
    if (!campaignName.trim()) return;
    const regionCode = (region || getRegionFromCampaign(campaignName)).toUpperCase();
    const newCampaign = {
      name: campaignName.trim(),
      region: regionCode,
      regionLink: regionLink.trim() || `https://example.com/${regionCode.toLowerCase()}`,
      comment: comment.trim() || `${partner.trafficSource} traffic. Monitoring: KTARL + Adexium.`,
    };

    onAddCampaign(partner.id, newCampaign);
    setCampaignName('');
    setRegion('');
    setRegionLink('');
    setComment('');
    setIsAdding(false);
  };

  const formatTimestamp = (date = new Date()) => {
    const pad = (n) => String(n).padStart(2, '0');
    const dd = pad(date.getDate());
    const mm = pad(date.getMonth() + 1);
    const yy = String(date.getFullYear()).slice(-2);
    const hh = pad(date.getHours());
    const mi = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    return `${dd}/${mm}/${yy} : ${hh}:${mi}:${ss}`;
  };

  const openBlankDataPage = () => {
    const html = [
      '<html><head><title>Campaign Details</title></head>',
      '<body style="font-family: Arial, sans-serif; padding: 24px;">',
      '<h2>Data</h2>',
      '</body></html>',
    ].join('');
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openTestResultPage = (campaign, testEntry) => {
    const safe = (v) => escapeHtml(v);
    const html = [
      '<html><head><title>Link Test Result</title></head>',
      '<body style="font-family: Arial, sans-serif; padding: 24px;">',
      '<h2>Testing Link Results</h2>',
      `<p><strong>Campaign:</strong> ${safe(campaign.name)}</p>`,
      `<p><strong>Region:</strong> ${safe(campaign.region || getRegionFromCampaign(campaign.name))}</p>`,
      `<p><strong>Link:</strong> ${safe(campaign.regionLink || '')}</p>`,
      `<p><strong>Tested:</strong> ${safe(testEntry.testedAt)}</p>`,
      `<p><strong>Result:</strong> ${safe(testEntry.result)}</p>`,
      '</body></html>',
    ].join('');
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleTestLinks = (campaign) => {
    const outcomes = ['Perfect', 'Have errors', 'Not working'];
    const result = outcomes[Math.floor(Math.random() * outcomes.length)];
    const entry = {
      testedAt: formatTimestamp(),
      result,
    };

    setLinkTests((prev) => {
      const current = prev[campaign.id] || [];
      return {
        ...prev,
        [campaign.id]: [entry, ...current].slice(0, 5),
      };
    });
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 620, p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}
        >
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Campaigns
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {partner.name} &middot; {campaigns.length} total &middot; {selectedPeriod.label}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Team: <strong>{partner.team}</strong>
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

        {/* Campaign list by region */}
        <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {campaigns.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No campaigns yet
            </Typography>
          ) : (
            Object.entries(groupedByRegion).map(([regionCode, regionCampaigns]) => (
              <Box key={regionCode}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    mb: 1,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                  }}
                >
                  {regionCode}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                  {regionCampaigns.map((campaign) => {
                    const sc = statusColors[campaign.status] || statusColors.Ended;
                    const tests = linkTests[campaign.id] || [];
                    return (
                      <Card
                        key={campaign.id}
                        variant="outlined"
                        sx={{
                          transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
                          borderColor: alpha('#0F172A', 0.08),
                          '&:hover': {
                            borderColor: 'primary.main',
                            boxShadow: createHoverGlowShadow(theme),
                            transform: 'translateY(-1px)',
                          },
                        }}
                      >
                        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              mb: 1,
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600, fontSize: '0.82rem' }}
                            >
                              {campaign.name}
                            </Typography>
                            <Chip
                              label={campaign.status}
                              size="small"
                              sx={{
                                height: 22,
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                bgcolor: sc.bg,
                                color: sc.color,
                              }}
                            />
                          </Box>

                          <Box sx={{ display: 'flex', gap: 3, mb: 1 }}>
                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                FTD
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {campaign.metrics.ftd}
                              </Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                CR%
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {formatPercent(campaign.metrics.cr)}
                              </Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                Revenue
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 600, color: 'success.main' }}
                              >
                                ${campaign.revenue?.toLocaleString()}
                              </Typography>
                            </Box>
                          </Box>

                          <Typography variant="caption" color="text.secondary">
                            Region link:{' '}
                            <Link
                              href={
                                campaign.regionLink ||
                                `https://example.com/${regionCode.toLowerCase()}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {campaign.regionLink ||
                                `https://example.com/${regionCode.toLowerCase()}`}
                            </Link>
                          </Typography>
                          <Typography
                            variant="caption"
                            display="block"
                            color="text.secondary"
                            sx={{ mt: 0.5 }}
                          >
                            {campaign.comment ||
                              `${partner.trafficSource} traffic. Monitoring: KTARL + Adexium.`}
                          </Typography>

                          <Box sx={{ display: 'flex', gap: 1, mt: 1.2, flexWrap: 'wrap' }}>
                            <Button size="small" variant="outlined" onClick={openBlankDataPage}>
                              Campaign details
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => handleTestLinks(campaign)}
                            >
                              Test Links
                            </Button>
                          </Box>

                          <Box sx={{ mt: 1.2 }}>
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 700,
                                color: 'text.secondary',
                                textTransform: 'uppercase',
                              }}
                            >
                              Link test history
                            </Typography>
                            <Table size="small" sx={{ mt: 0.5 }}>
                              <TableHead>
                                <TableRow>
                                  <TableCell sx={{ py: 0.7 }}>Tested</TableCell>
                                  <TableCell sx={{ py: 0.7 }}>Results</TableCell>
                                  <TableCell sx={{ py: 0.7 }}>View</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {tests.length === 0 ? (
                                  <TableRow>
                                    <TableCell colSpan={3} sx={{ py: 0.8 }}>
                                      <Typography variant="caption" color="text.secondary">
                                        No tests yet
                                      </Typography>
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  tests.map((test, idx) => (
                                    <TableRow key={`${campaign.id}-test-${idx}`}>
                                      <TableCell sx={{ py: 0.7 }}>
                                        <Typography variant="caption">{test.testedAt}</Typography>
                                      </TableCell>
                                      <TableCell sx={{ py: 0.7 }}>
                                        <Typography
                                          variant="caption"
                                          sx={{
                                            color:
                                              test.result === 'Perfect'
                                                ? 'success.main'
                                                : test.result === 'Have errors'
                                                  ? 'warning.main'
                                                  : 'error.main',
                                            fontWeight: 600,
                                          }}
                                        >
                                          {test.result}
                                        </Typography>
                                      </TableCell>
                                      <TableCell sx={{ py: 0.7 }}>
                                        <Button
                                          size="small"
                                          variant="text"
                                          sx={{ minWidth: 'auto', p: 0, fontSize: '0.7rem' }}
                                          onClick={() => openTestResultPage(campaign, test)}
                                        >
                                          View
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))
                                )}
                              </TableBody>
                            </Table>
                          </Box>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              </Box>
            ))
          )}
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {isAdding ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <TextField
              size="small"
              label="Campaign name"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
            <TextField
              size="small"
              label="Region (e.g., EG)"
              value={region}
              onChange={(e) => setRegion(e.target.value.toUpperCase())}
            />
            <TextField
              size="small"
              label="Region link"
              value={regionLink}
              onChange={(e) => setRegionLink(e.target.value)}
              placeholder="https://..."
            />
            <TextField
              size="small"
              label="Comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={`${partner.trafficSource} traffic. Monitoring: KTARL + Adexium.`}
            />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button size="small" variant="contained" onClick={handleAddNew}>
                Save
              </Button>
            </Box>
          </Box>
        ) : (
          <Button
            fullWidth
            variant="outlined"
            startIcon={<AppIcon name="Add" fallback={AddIcon} />}
            onClick={() => setIsAdding(true)}
          >
            Add new
          </Button>
        )}
      </Box>
    </Drawer>
  );
}
