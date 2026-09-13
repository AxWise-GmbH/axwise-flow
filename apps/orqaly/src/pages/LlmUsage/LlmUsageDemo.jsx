/**
 * LlmUsageDemo - preview of the LLM Usage page populated with dummy data.
 *
 * Renders the exact same components as the live /llm-usage page (aggregate
 * LlmUsagePanel + per-entity EntityDirectory with cards/tables and drill-down),
 * but fed from demoData instead of the API - so the full result can be reviewed
 * without deploying or running real activity. The live page uses real data.
 */
import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  alpha,
  useTheme,
} from '@mui/material';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import PageLayout from '../../components/Common/PageLayout';
import LlmUsagePanel from '../../components/LlmUsage/LlmUsagePanel';
import EntityDirectory from '../../components/LlmUsage/EntityDirectory';
import { DEMO_AGGREGATE, DEMO_ITEMS, demoSnapshotFor } from './demoData';

import AppIcon from '../../components/icons/AppIcon';

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'goal', label: 'Goal' },
  { value: 'agent', label: 'Agent' },
  { value: 'team', label: 'Team' },
  { value: 'consilium', label: 'Consilium' },
  { value: 'organization', label: 'Organization' },
];

const RANGE_PRESETS = [
  { id: '7d', label: '7d', days: 7 },
  { id: '30d', label: '30d', days: 30 },
  { id: '90d', label: '90d', days: 90 },
  { id: 'all', label: 'All', days: null },
];

const ALL_RANGE_DAYS = 365;

function isoDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function LlmUsageDemo() {
  const theme = useTheme();
  const [category, setCategory] = useState('all');
  const [preset, setPreset] = useState('all');
  const [from, setFrom] = useState(() => isoDay(-ALL_RANGE_DAYS));
  const [to, setTo] = useState(() => isoDay(0));

  // The date controls are kept for visual fidelity with the live page; the
  // preview data is fixed, so changing them does not refetch.
  const applyPreset = (id) => {
    setPreset(id);
    const found = RANGE_PRESETS.find((p) => p.id === id);
    if (!found) return;
    setTo(isoDay(0));
    setFrom(isoDay(-(found.days == null ? ALL_RANGE_DAYS : found.days)));
  };

  return (
    <PageLayout
      title="LLM Usage (Preview)"
      subtitle="Reconciled token spend, cost, latency and evaluations across your agents."
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Sample-data banner */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            p: 1.25,
            borderRadius: 2.5,
            bgcolor: alpha(theme.palette.info.main, 0.08),
            border: '1px solid',
            borderColor: alpha(theme.palette.info.main, 0.3),
          }}
        >
          <AppIcon
            name="ScienceOutlined"
            fallback={ScienceOutlinedIcon}
            sx={{ fontSize: 20, color: 'info.main' }}
          />
          <Typography variant="body2" sx={{ color: 'info.main', fontWeight: 600 }}>
            Sample data preview. This is the LLM Usage page filled with dummy data for review - the
            live page at /llm-usage uses your real data.
          </Typography>
        </Box>

        {/* Controls (mirror the live page) */}
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="llm-usage-demo-category-label">Category</InputLabel>
            <Select
              labelId="llm-usage-demo-category-label"
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <ToggleButtonGroup
            value={preset}
            exclusive
            size="small"
            onChange={(_, v) => v && applyPreset(v)}
            aria-label="Quick range"
            sx={{
              '& .MuiToggleButton-root': {
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.72rem',
                px: 1.25,
                py: 0.4,
                borderRadius: '8px !important',
              },
            }}
          >
            {RANGE_PRESETS.map((p) => (
              <ToggleButton key={p.id} value={p.id} aria-label={`Last ${p.label}`}>
                {p.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <TextField
            size="small"
            type="date"
            label="From"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset('');
            }}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 160 }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset('');
            }}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 160 }}
          />
        </Paper>

        {/* All -> aggregate panel; a specific type -> its directory. */}
        {category === 'all' ? (
          <LlmUsagePanel entity="all" demo={DEMO_AGGREGATE} />
        ) : (
          <EntityDirectory
            key={category}
            entity={category}
            demoItems={DEMO_ITEMS[category] || []}
            demoSnapshot={(item) => demoSnapshotFor(category, item)}
          />
        )}
      </Box>
    </PageLayout>
  );
}
