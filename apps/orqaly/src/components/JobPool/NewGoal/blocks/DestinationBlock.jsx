import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { DESTINATION_OPTIONS } from '../newGoalConstants';

/**
 * Where the goal runs: a new business, an existing one, or standalone.
 *
 * Every destination still resolves to an organization. Standalone means no
 * business unit, not no tenant: the goal keeps a workspace so its Agent Hub
 * roster, evidence and AxWise decisions stay scoped.
 */
export default function DestinationBlock({
  value,
  onChange,
  orgName,
  onOrgNameChange,
  industry,
  onIndustryChange,
  organizations,
  organizationsLoading,
  organizationLoadError,
  selectedOrgId,
  onSelectedOrgIdChange,
}) {
  const isNew = value === 'new_business';
  const isExisting = value === 'existing_business';
  const workspaceLabel = isExisting ? 'Organization' : 'Execution workspace';

  return (
    <Box>
      <Box
        role="radiogroup"
        aria-label="Goal destination"
        sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}
      >
        {DESTINATION_OPTIONS.map((option) => {
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

      {isNew ? (
        <>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 1,
              mt: 1.5,
            }}
          >
            <TextField
              size="small"
              label="Business name"
              value={orgName}
              onChange={(event) => onOrgNameChange(event.target.value)}
              required
              sx={{ flex: 1, minWidth: 0, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <TextField
              size="small"
              label="Industry"
              value={industry}
              onChange={(event) => onIndustryChange(event.target.value)}
              sx={{ flex: 1, minWidth: 0, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            The workspace is created before the goal starts, so AxWise receives the correct tenant
            and Agent Hub boundary from the very first pipeline step.
          </Typography>
        </>
      ) : (
        <>
          <FormControl fullWidth size="small" sx={{ mt: 1.5 }}>
            <InputLabel id="new-goal-workspace-label">{workspaceLabel}</InputLabel>
            <Select
              labelId="new-goal-workspace-label"
              value={selectedOrgId}
              label={workspaceLabel}
              onChange={(event) => onSelectedOrgIdChange(event.target.value)}
              disabled={organizationsLoading || organizations.length === 0}
              sx={{ borderRadius: 2 }}
            >
              {organizations.map((org) => (
                <MenuItem key={org.id} value={org.id}>
                  {org.name || 'Untitled workspace'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {organizationsLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.secondary">
                Loading workspaces…
              </Typography>
            </Box>
          )}
          {!organizationsLoading && organizationLoadError && (
            <Alert severity="error" sx={{ mt: 1, py: 0.25, fontSize: '0.75rem' }}>
              {organizationLoadError}
            </Alert>
          )}
          {!organizationLoadError && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {isExisting
                ? 'The goal starts inside this organization; you can choose its unit right after creation.'
                : 'Runs on its own, scoped to this workspace.'}
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
