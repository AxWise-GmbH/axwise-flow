import { Box, Chip, Typography, Alert } from '@mui/material';
import { TOOL_OPTIONS } from '../newGoalConstants';

/**
 * Tool policy for the goal: None, All library, or Only existing.
 *
 * `groundedResearchConflict` is a Professional-only interlock. Advanced goals
 * default to grounded research, which promises live source-backed evidence a
 * no-tools goal cannot produce. Nothing in the pipeline catches that
 * contradiction, so the dialog surfaces it and downgrades research on submit.
 */
export default function ToolsBlock({ value, onChange, groundedResearchConflict = false }) {
  const active = TOOL_OPTIONS.find((option) => option.id === value) || TOOL_OPTIONS[0];

  return (
    <Box>
      <Box
        role="radiogroup"
        aria-label="Tool usage"
        sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}
      >
        {TOOL_OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <Chip
              key={option.id}
              label={option.label}
              size="small"
              role="radio"
              aria-checked={selected}
              color={selected ? 'primary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              onClick={() => onChange(option.id)}
              sx={{ fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer' }}
            />
          );
        })}
      </Box>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', mt: 0.75, display: 'block', fontSize: '0.7rem' }}
      >
        {active.hint}
      </Typography>
      {groundedResearchConflict && (
        <Alert severity="warning" sx={{ mt: 1, fontSize: '0.75rem', py: 0.25 }}>
          Grounded research needs live sources. With tools set to None we will run instant research
          instead, using model knowledge only. Pick All library or Only existing to keep grounded
          research.
        </Alert>
      )}
    </Box>
  );
}
