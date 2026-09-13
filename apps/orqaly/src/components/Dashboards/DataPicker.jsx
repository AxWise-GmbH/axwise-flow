import { Box, Typography, TextField, MenuItem, Stack } from '@mui/material';
import { CATALOG, dimensionField, dimensionBuckets } from '../../services/metricCatalog';

/**
 * Four-axis data picker: dataset → measure → group_by → limit
 *
 * `value` shape:
 *   { dataset, measure: { agg, field? }, group_by?: { field, time_bucket? }, limit? }
 */
export default function DataPicker({ value, onChange }) {
  const dataset = value?.dataset || '';
  const def = CATALOG[dataset];

  const measures = def?.measures || [];
  const dimensions = def?.dimensions || [];

  const measureKey = value?.measure
    ? value.measure.field
      ? `${value.measure.agg}:${value.measure.field}`
      : value.measure.agg
    : '';

  const groupByKey = value?.group_by?.field || '';

  const timeBuckets = groupByKey
    ? (() => {
        const dim = dimensions.find((d) => dimensionField(d) === groupByKey);
        return dim ? dimensionBuckets(dim) : [];
      })()
    : [];

  const handleDatasetChange = (newDataset) => {
    onChange({
      dataset: newDataset,
      measure: { agg: 'count' },
      group_by: undefined,
    });
  };

  const handleMeasureChange = (newMeasure) => {
    if (!newMeasure) {
      onChange({ ...value, measure: undefined });
      return;
    }
    const [agg, field] = newMeasure.split(':');
    onChange({ ...value, measure: field ? { agg, field } : { agg } });
  };

  const handleGroupByChange = (field) => {
    if (!field) {
      onChange({ ...value, group_by: undefined });
      return;
    }
    const dim = dimensions.find((d) => dimensionField(d) === field);
    const buckets = dim ? dimensionBuckets(dim) : [];
    onChange({
      ...value,
      group_by: { field, time_bucket: buckets[0] || undefined },
    });
  };

  const handleTimeBucketChange = (tb) => {
    onChange({
      ...value,
      group_by: { ...value.group_by, time_bucket: tb || undefined },
    });
  };

  return (
    <Stack spacing={1.5}>
      <Box>
        <Label>Dataset</Label>
        <TextField
          select
          size="small"
          fullWidth
          value={dataset}
          onChange={(e) => handleDatasetChange(e.target.value)}
        >
          {Object.entries(CATALOG).map(([k, v]) => (
            <MenuItem key={k} value={k}>
              {v.label}
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                {v.description}
              </Typography>
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Box>
        <Label>Measure</Label>
        <TextField
          select
          size="small"
          fullWidth
          value={measureKey}
          onChange={(e) => handleMeasureChange(e.target.value)}
          disabled={!dataset}
        >
          {measures.map((m) => (
            <MenuItem key={m} value={m}>
              {m === 'count' ? 'Count of rows' : m}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Box>
        <Label>Group by (optional)</Label>
        <TextField
          select
          size="small"
          fullWidth
          value={groupByKey}
          onChange={(e) => handleGroupByChange(e.target.value)}
          disabled={!dataset}
        >
          <MenuItem value="">No grouping (single value)</MenuItem>
          {dimensions.map((d) => (
            <MenuItem key={d} value={dimensionField(d)}>
              {dimensionField(d)}
              {dimensionBuckets(d).length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  · time-series
                </Typography>
              )}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {timeBuckets.length > 0 && (
        <Box>
          <Label>Time bucket</Label>
          <TextField
            select
            size="small"
            fullWidth
            value={value?.group_by?.time_bucket || ''}
            onChange={(e) => handleTimeBucketChange(e.target.value)}
          >
            {timeBuckets.map((b) => (
              <MenuItem key={b} value={b}>
                {b}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      )}
    </Stack>
  );
}

function Label({ children }) {
  return (
    <Typography
      variant="caption"
      sx={{
        fontWeight: 700,
        fontSize: '0.65rem',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        color: 'text.secondary',
        display: 'block',
        mb: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}
