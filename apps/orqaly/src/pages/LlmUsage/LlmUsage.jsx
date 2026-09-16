/**
 * LlmUsage - directory-first unified LLM Usage view.
 *
 * A category control (All / Goal / Agent / Team / Consilium / Organization)
 * and a date range drive the page. "All" (default) renders the aggregate
 * LlmUsagePanel; any specific entity type renders an EntityDirectory - a
 * searchable, sortable card/list directory of every entity of that type with
 * its usage rollup, and a drill-down drawer into the per-entity panel.
 * Defaults to the last 30 days.
 */
import { useState } from 'react';
import {
  Box,
  Paper,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import PageLayout from '../../components/Common/PageLayout';
import LlmUsagePanel from '../../components/LlmUsage/LlmUsagePanel';
import EntityDirectory from '../../components/LlmUsage/EntityDirectory';

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

// "All" looks back this far. An empty `from` is read by the API as "last 30
// days", which hides older history, so All sends a concrete wide lower bound
// (the backend caps the window at ~1 year anyway).
const ALL_RANGE_DAYS = 365;

/** YYYY-MM-DD for an offset of `days` from now (negative = past). */
function isoDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function LlmUsage() {
  const [category, setCategory] = useState('all');
  const [preset, setPreset] = useState('30d');
  const [from, setFrom] = useState(() => isoDay(-30));
  const [to, setTo] = useState(() => isoDay(0));

  // A quick-range preset rewrites the from/to inputs. "All" uses a wide lower
  // bound so the directory/panel surfaces historical usage rather than only the
  // last month.
  const applyPreset = (id) => {
    setPreset(id);
    const found = RANGE_PRESETS.find((p) => p.id === id);
    if (!found) return;
    setTo(isoDay(0));
    setFrom(isoDay(-(found.days == null ? ALL_RANGE_DAYS : found.days)));
  };

  return (
    <PageLayout
      title="LLM Usage"
      subtitle="Reconciled token spend, cost, latency and evaluations across your agents."
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Controls */}
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
            <InputLabel id="llm-usage-category-label">Category</InputLabel>
            <Select
              labelId="llm-usage-category-label"
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

        {/* All -> aggregate panel; a specific type -> its usage directory. */}
        {category === 'all' ? (
          <LlmUsagePanel key={`all:${from}:${to}`} entity="all" from={from} to={to} />
        ) : (
          <EntityDirectory
            key={`${category}:${from}:${to}`}
            entity={category}
            from={from}
            to={to}
          />
        )}
      </Box>
    </PageLayout>
  );
}
