import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

// The server must explicitly enable the action and supply these field
// descriptors. No model-proposed URL, field or credential type grants access.
const credentialFields = {
  orqalyBoundedHttp: { name: 'text', value: 'secret' },
  httpHeaderAuth: { name: 'text', value: 'secret' },
  githubApi: { accessToken: 'secret' },
  twilioApi: { accountSid: 'text', authToken: 'secret' },
};
function supportedFields(requirement) {
  const expected = Object.hasOwn(credentialFields, requirement.credentialType)
    ? credentialFields[requirement.credentialType]
    : null;
  if (
    !expected ||
    !Array.isArray(requirement.fields) ||
    requirement.fields.length !== Object.keys(expected).length
  )
    return false;
  return (
    new Set(requirement.fields.map((field) => field.name)).size === requirement.fields.length &&
    requirement.fields.every(
      (field) =>
        expected[field.name] === field.type &&
        field.required === true &&
        typeof field.label === 'string'
    )
  );
}

export default function WorkflowBuildConnections(props) {
  return (
    <ConnectionWorkspace
      key={`${props.build.id}:${props.build.workflowHash || 'no-draft'}`}
      {...props}
    />
  );
}

function ConnectionWorkspace({ client, build, disabled, onSaved, onRefresh, onBusyChange }) {
  const [selected, setSelected] = useState(null);
  const [values, setValues] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => {
    onBusyChange?.(busyRef.current);
  }, [onBusyChange]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      busyCallback.current?.(false);
    };
  }, []);
  function updateBusy(value) {
    busyRef.current = value;
    setBusy(value);
    // Report ownership before awaiting either the current-scope read or the
    // secure write. Only a boolean crosses into the surrounding chat surface.
    busyCallback.current?.(value);
  }
  const requirements = build.connectionRequirements || [];
  if (!requirements.length) return null;
  const close = () => {
    if (busyRef.current) return;
    setSelected(null);
    setValues({});
    setConfirmed(false);
  };
  async function refreshConnections() {
    if (busyRef.current) return;
    updateBusy(true);
    try {
      const response = await client.solutionBuildRequest(build.id);
      if (!alive.current) return;
      if (response.buildRequest?.id !== build.id)
        throw new Error('CONNECTION_RESPONSE_UNCONFIRMED');
      onSaved(response);
      setError(null);
    } catch {
      if (alive.current)
        setError(
          'Connection status could not be refreshed. No new connection request has been made.'
        );
    } finally {
      if (alive.current) updateBusy(false);
    }
  }
  async function connect(event) {
    event.preventDefault();
    if (busyRef.current || disabled || !selected || !confirmed) return;
    updateBusy(true);
    setError(null);
    try {
      const latest = await client.solutionBuildRequest(build.id);
      if (!alive.current) return;
      const current = latest.buildRequest;
      const requirement = current?.connectionRequirements?.find((item) => item.id === selected.id);
      if (
        current?.rowVersion !== selected.expectedVersion ||
        !requirement?.canConnect ||
        !supportedFields(requirement)
      )
        throw new Error('CONNECTION_SCOPE_CHANGED');
      const credentials = Object.fromEntries(
        selected.fields.map((field) => [field.name, values[field.name] || ''])
      );
      const response = await client.createSolutionBuildConnection(
        build.id,
        {
          expectedVersion: selected.expectedVersion,
          requirementId: selected.id,
          credentials,
        },
        selected.requestKey
      );
      if (!alive.current) return;
      if (response.buildRequest?.id !== build.id)
        throw new Error('CONNECTION_RESPONSE_UNCONFIRMED');
      // Only the refreshed server record may claim verified status or resume.
      onSaved(response);
      setSelected(null);
      setValues({});
      setConfirmed(false);
    } catch {
      if (!alive.current) return;
      setSelected(null);
      setValues({});
      setConfirmed(false);
      setError(
        'The connection could not be confirmed. Entered credentials were cleared. Refresh its saved status before trying again; do not assume an account was connected.'
      );
      onRefresh();
    } finally {
      if (alive.current) updateBusy(false);
    }
  }
  return (
    <Stack gap={1.5} aria-label="Secure connection requirements" sx={{ minWidth: 0 }}>
      {error ? (
        <Alert
          severity="warning"
          action={
            <Button disabled={busy} onClick={refreshConnections}>
              Refresh connection status
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}
      {requirements.map((requirement) => {
        const canConnect =
          requirement.canConnect === true &&
          supportedFields(requirement) &&
          typeof client.createSolutionBuildConnection === 'function';
        return (
          <Box
            key={requirement.id}
            sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, minWidth: 0 }}
          >
            <Typography variant="subtitle2">
              {requirement.service || 'Service connection'}
            </Typography>
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              {requirement.reason}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Saved connection status: {requirement.status?.replaceAll('_', ' ') || 'Not verified'}
              {requirement.nodeIds?.length ? ` · Nodes: ${requirement.nodeIds.join(', ')}` : ''}
            </Typography>
            {canConnect ? (
              <Button
                sx={{ mt: 1 }}
                variant="outlined"
                disabled={disabled || busy || !!error}
                onClick={() => {
                  setSelected({
                    ...requirement,
                    expectedVersion: build.rowVersion,
                    requestKey: crypto.randomUUID(),
                  });
                  setValues({});
                  setConfirmed(false);
                }}
              >
                Connect {requirement.service || 'service'} securely
              </Button>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {requirement.status === 'verified'
                  ? 'Verification is recorded for this connection. It does not prove a workflow action succeeded.'
                  : 'Secure setup is not available for this requirement yet. No account or credential is selected automatically.'}
              </Typography>
            )}
          </Box>
        );
      })}
      {selected ? (
        <Dialog
          open
          fullWidth
          maxWidth="sm"
          onClose={close}
          disableEscapeKeyDown={busy}
          aria-labelledby="secure-build-connection-title"
        >
          <Box component="form" onSubmit={connect}>
            <DialogTitle id="secure-build-connection-title">
              Connect {selected.service || 'service'} securely
            </DialogTitle>
            <DialogContent>
              <Stack gap={2} sx={{ pt: 1 }}>
                <Alert severity="info">
                  Credentials go only to Orqanix’s scoped connection service, not to the Agent, chat
                  or native workflow JSON. Closing this dialog clears entered values.
                </Alert>
                <Typography variant="body2">{selected.reason}</Typography>
                {selected.scopeSummary ? (
                  <Typography variant="body2">
                    Account and destination scope: {selected.scopeSummary}
                  </Typography>
                ) : null}
                {selected.fields.map((field, index) => (
                  <TextField
                    key={field.name}
                    autoFocus={index === 0}
                    label={field.label}
                    type={field.type === 'secret' ? 'password' : 'text'}
                    autoComplete={field.type === 'secret' ? 'new-password' : 'off'}
                    required
                    disabled={busy}
                    value={values[field.name] || ''}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [field.name]: event.target.value }))
                    }
                    inputProps={{ maxLength: 8192, spellCheck: false }}
                  />
                ))}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                      disabled={busy}
                    />
                  }
                  label="I confirm this credential belongs to the intended account and has only the permissions needed for this task."
                />
                <Typography variant="caption" color="text.secondary">
                  Saving, verification and a successful provider action are different states.
                  Connection setup does not approve deployment or production effects.
                </Typography>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={busy} onClick={close}>
                Cancel and clear
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={
                  busy ||
                  disabled ||
                  !confirmed ||
                  selected.fields.some((field) => !values[field.name]?.trim())
                }
              >
                {busy ? 'Checking connection…' : 'Save secure connection'}
              </Button>
            </DialogActions>
          </Box>
        </Dialog>
      ) : null}
    </Stack>
  );
}
