import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import BentoCard from '../Common/BentoCard';
import EmptyState from '../Common/EmptyState';

const ADMISSION_LABELS = {
  ready: { label: 'Ready', color: 'success' },
  needs_customer_action: { label: 'Needs customer action', color: 'warning' },
  'needs-customer-action': { label: 'Needs customer action', color: 'warning' },
  plan_only: { label: 'Plan only', color: 'info' },
  'plan-only': { label: 'Plan only', color: 'info' },
  unsupported: { label: 'Unsupported', color: 'error' },
};

const STEP_KIND_OPTIONS = [
  { value: 'reason', label: 'Think or analyze' },
  { value: 'retrieve', label: 'Retrieve knowledge' },
  { value: 'produce_artifact', label: 'Create an artifact' },
  { value: 'connector_read', label: 'Read from a connected system' },
  { value: 'connector_write', label: 'Change a connected system' },
  { value: 'sandbox_work', label: 'Run isolated code or files' },
  { value: 'human_input', label: 'Ask for human input' },
  { value: 'review', label: 'Review another Agent’s work' },
  { value: 'wait_or_monitor', label: 'Wait or monitor' },
  { value: 'notify', label: 'Send a notification' },
];

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function admissionSummary(result) {
  if (result?.status === 'ready' && result?.dispatchable) {
    return 'The requested capability is available and execution is enabled. This check did not start a run.';
  }
  if (result?.status === 'ready' && result?.executionEnabled === false) {
    return 'The requested capability is available, but execution is disabled in the control plane.';
  }
  if (result?.status === 'ready') {
    return 'The requested capability is available. This check did not create an Agent or start a run.';
  }
  if (result?.status === 'needs_customer_action') {
    return 'A required connection must be configured before this operation can run.';
  }
  if (result?.status === 'plan_only') {
    return 'The task can be planned, but one or more execution capabilities are not available.';
  }
  if (result?.status === 'unsupported') {
    return 'The current control plane cannot safely execute this requested operation.';
  }
  return 'The control plane returned an admission result without a customer-facing explanation.';
}

function missingLabel(requirement) {
  if (!requirement || typeof requirement !== 'object') return String(requirement);
  const type = String(requirement.type || 'requirement').replaceAll('_', ' ');
  return `${type.charAt(0).toUpperCase()}${type.slice(1)}: ${requirement.key || 'not specified'}`;
}

export default function TaskAdmissionPanel({
  task,
  onTaskChange,
  stepKind,
  onStepKindChange,
  descriptorKey,
  onDescriptorKeyChange,
  connectionKey,
  onConnectionKeyChange,
  onSubmit,
  state = 'idle',
  result,
  error,
}) {
  const resultStatus = result?.status || result?.admission_status || result?.admissionStatus;
  const statusMeta = ADMISSION_LABELS[resultStatus] || {
    label: resultStatus ? 'Review required' : 'Unknown',
    color: 'default',
  };
  const missingRequirements = asList(result?.missing);

  return (
    <BentoCard
      title="Task admission"
      subtitle="Check capability and authority before an Agent is created"
      icon={FactCheckOutlinedIcon}
    >
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.();
        }}
      >
        <Stack spacing={1.5}>
          <TextField
            label="What should the Agent handle?"
            value={task}
            onChange={(event) => onTaskChange?.(event.target.value)}
            placeholder="Describe the outcome, constraints and systems involved"
            multiline
            minRows={3}
            size="small"
            fullWidth
            inputProps={{ maxLength: 500 }}
          />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
              gap: 1.5,
            }}
          >
            <FormControl size="small" fullWidth>
              <InputLabel id="agentic-step-kind-label">Primary operation</InputLabel>
              <Select
                labelId="agentic-step-kind-label"
                value={stepKind}
                label="Primary operation"
                onChange={(event) => onStepKindChange?.(event.target.value)}
              >
                {STEP_KIND_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Capability key (optional)"
              value={descriptorKey}
              onChange={(event) => onDescriptorKeyChange?.(event.target.value)}
              helperText="Checks a specific registered descriptor"
              inputProps={{ maxLength: 200 }}
            />
            <TextField
              size="small"
              label="Connection key (optional)"
              value={connectionKey}
              onChange={(event) => onConnectionKeyChange?.(event.target.value)}
              helperText="Checks a required customer connection"
              inputProps={{ maxLength: 200 }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary">
            The current v1 check evaluates this declared operation only. It does not infer
            additional actions from the task text.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="submit"
              variant="contained"
              disabled={!task?.trim() || state === 'loading'}
              startIcon={
                state === 'loading' ? <CircularProgress size={16} color="inherit" /> : undefined
              }
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
            >
              {state === 'loading' ? 'Checking task…' : 'Check task'}
            </Button>
          </Box>

          {state === 'idle' && (
            <EmptyState
              dense
              icon={FactCheckOutlinedIcon}
              title="No admission result yet"
              description="This check creates no Agent and performs no external action."
            />
          )}

          {state === 'error' && (
            <Alert severity="error">
              {error || 'The task could not be checked. No Agent was created.'}
            </Alert>
          )}

          {state === 'success' && result && (
            <Box
              aria-live="polite"
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}
            >
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Typography variant="h6">Admission result</Typography>
                <Chip size="small" label={statusMeta.label} color={statusMeta.color} />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {admissionSummary(result)}
              </Typography>

              {missingRequirements.length > 0 && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Required before execution
                  </Typography>
                  <List dense disablePadding>
                    {missingRequirements.map((requirement, index) => (
                      <ListItem key={requirement.id || requirement.code || index} disableGutters>
                        <ListItemText
                          primary={missingLabel(requirement)}
                          secondary={
                            requirement.stepKind
                              ? `Needed for ${String(requirement.stepKind).replaceAll('_', ' ')}`
                              : null
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
                <Chip
                  variant="outlined"
                  color={result.executable ? 'success' : 'default'}
                  label={result.executable ? 'Executable capability' : 'Planning only'}
                />
                <Chip
                  variant="outlined"
                  color={result.executionEnabled ? 'success' : 'default'}
                  label={result.executionEnabled ? 'Runtime enabled' : 'Runtime disabled'}
                />
                <Chip
                  variant="outlined"
                  color={result.dispatchable ? 'success' : 'default'}
                  label={result.dispatchable ? 'Dispatchable' : 'Not dispatchable'}
                />
              </Stack>
            </Box>
          )}
        </Stack>
      </Box>
    </BentoCard>
  );
}
