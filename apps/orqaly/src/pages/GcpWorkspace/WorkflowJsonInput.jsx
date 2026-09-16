import { Button, Stack, TextField, Typography } from '@mui/material';
import { isNativeWorkflowSpec, workflowInputError } from './solution-presentation.js';

export default function WorkflowJsonInput({ label, value, onChange, spec, disabled = false }) {
  const error = workflowInputError(value);
  const native = isNativeWorkflowSpec(spec);
  return (
    <Stack gap={1} sx={{ minWidth: 0 }}>
      <TextField
        multiline
        minRows={5}
        maxRows={18}
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        error={!!error}
        helperText={
          error ||
          (native
            ? 'Nested objects and arrays are supported. This is sample input only; the server checks the saved input contract before execution.'
            : 'Use a JSON object containing the input fields required by this workflow.')
        }
        inputProps={{ maxLength: 128_000, spellCheck: false }}
        sx={{ '& textarea': { fontFamily: 'monospace', overflowWrap: 'anywhere' } }}
      />
      <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
        <Button
          size="small"
          disabled={disabled || !!error}
          onClick={() => onChange(JSON.stringify(JSON.parse(value), null, 2))}
        >
          Format JSON
        </Button>
        <Typography variant="caption" color="text.secondary">
          Formatting does not run or validate the workflow. Use non-sensitive sample data.
        </Typography>
      </Stack>
    </Stack>
  );
}
