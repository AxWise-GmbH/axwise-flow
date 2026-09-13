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

const fieldsByType = {
  orqalyBoundedHttp: { name: 'text', value: 'secret' },
  httpHeaderAuth: { name: 'text', value: 'secret' },
  githubApi: { accessToken: 'secret' },
  twilioApi: { accountSid: 'text', authToken: 'secret' },
};
const hasScope = (item) =>
  /^[a-f0-9]{64}$/.test(item.scopeHash || '') &&
  Array.isArray(item.scope?.targets) &&
  item.scope.targets.length > 0;
function supported(item) {
  const fields =
    Object.hasOwn(fieldsByType, item.credentialType) && fieldsByType[item.credentialType];
  return (
    fields &&
    Array.isArray(item.fields) &&
    item.fields.length === Object.keys(fields).length &&
    new Set(item.fields.map((field) => field.name)).size === item.fields.length &&
    item.fields.every(
      (field) =>
        fields[field.name] === field.type &&
        field.required === true &&
        typeof field.label === 'string'
    )
  );
}
const sameRevision = (left, right) =>
  left?.id === right.id &&
  left.rowVersion === right.rowVersion &&
  left.workflowHash === right.workflowHash &&
  (left.bundleHash || null) === (right.bundleHash || null);
function Scope({ requirement }) {
  return (
    <Stack gap={0.5}>
      <Typography variant="body2">
        {requirement.dependencyId ? 'Linked error workflow' : 'Main workflow'} · Nodes:{' '}
        {requirement.nodeIds?.join(', ')}
      </Typography>
      {requirement.scope?.targets?.map((target, index) => (
        <Typography key={index} variant="body2" sx={{ overflowWrap: 'anywhere' }}>
          {[
            target.method,
            target.destination || target.hostname,
            target.owner,
            target.repository,
            target.resource,
            target.operation,
            target.from && `From: ${target.from}`,
            target.to && `To: ${target.to}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Typography>
      ))}
    </Stack>
  );
}

export default function SolutionRevisionConnections(props) {
  const { revision, solutionId } = props;
  return (
    <RevisionConnections
      key={`${solutionId}:${revision.id}:${revision.rowVersion}:${revision.workflowHash}:${revision.bundleHash || ''}`}
      {...props}
    />
  );
}

function RevisionConnections({
  client,
  solutionId,
  revision,
  disabled = false,
  onSaved,
  onBusyChange,
  onSetupChange,
}) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [values, setValues] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const alive = useRef(true);
  const pending = useRef(false);
  const selection = useRef(null);
  const requestMetadata = useRef(null);
  const callbacks = useRef({ onSaved, onBusyChange, onSetupChange });
  callbacks.current = { onSaved, onBusyChange, onSetupChange };
  const readEpoch = useRef(0);
  const supportedClient = typeof client.solutionRevisionSetup === 'function';
  useEffect(() => {
    onBusyChange?.(busy || !!selected);
  }, [busy, selected, onBusyChange]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      callbacks.current.onBusyChange?.(false);
      callbacks.current.onSetupChange?.(null);
    };
  }, []);
  function accept(response) {
    if (
      !sameRevision(response?.revision, revision) ||
      !Array.isArray(response.connectionRequirements)
    )
      throw new Error('SETUP_SCOPE_CHANGED');
    setData(response);
    callbacks.current.onSetupChange?.({
      revisionId: revision.id,
      workflowHash: revision.workflowHash,
      bundleHash: revision.bundleHash || null,
      ready: response.setup?.ready === true,
      reason: response.setup?.reason || '',
      requirements: response.connectionRequirements.map(
        ({ id, service, status, dependencyId }) => ({ id, service, status, dependencyId })
      ),
    });
  }
  useEffect(() => {
    if (!supportedClient) return undefined;
    const epoch = ++readEpoch.current;
    let cancelled = false;
    client
      .solutionRevisionSetup(solutionId, revision.id)
      .then((response) => {
        if (!cancelled && alive.current && readEpoch.current === epoch) accept(response);
      })
      .catch(() => {
        if (!cancelled && alive.current && readEpoch.current === epoch)
          setError(
            'Connection status is unavailable. Refresh before adding or removing credentials.'
          );
      });
    return () => {
      cancelled = true;
    };
    // The wrapper remounts on every authoritative revision identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, solutionId, revision.id, supportedClient]);
  function ownership(value) {
    pending.current = value;
    setBusy(value);
    callbacks.current.onBusyChange?.(value || !!selection.current);
  }
  function close() {
    if (pending.current) return;
    selection.current = null;
    setSelected(null);
    setValues({});
    setConfirmed(false);
    callbacks.current.onBusyChange?.(false);
  }
  function open(requirement, action) {
    if (disabled || pending.current) return;
    const fingerprint = JSON.stringify({
      action,
      requirementId: requirement.id,
      connectionId: requirement.connectionId,
      scopeHash: requirement.scopeHash,
    });
    if (requestMetadata.current?.fingerprint !== fingerprint)
      requestMetadata.current = { fingerprint, key: crypto.randomUUID() };
    const next = { ...requirement, action, requestKey: requestMetadata.current.key };
    selection.current = next;
    setSelected(next);
    setValues({});
    setConfirmed(false);
    callbacks.current.onBusyChange?.(true);
  }
  async function refresh() {
    if (pending.current || disabled) return;
    ownership(true);
    try {
      const response = await client.solutionRevisionSetup(solutionId, revision.id);
      if (!alive.current) return;
      if (!sameRevision(response?.revision, revision)) {
        await callbacks.current.onSaved?.();
      } else accept(response);
      if (alive.current) setError(null);
    } catch {
      if (alive.current)
        setError('Saved connection status could not be refreshed. No setup request was repeated.');
    } finally {
      if (alive.current) ownership(false);
    }
  }
  async function submit(event) {
    event.preventDefault();
    const target = selection.current;
    if (!target || pending.current || disabled || !confirmed) return;
    if (target.action === 'save' && target.fields.some((field) => !values[field.name]?.trim()))
      return;
    // Values exist only in this form and this one request closure, never in a retry
    // cache, storage, parent/chat callback or model context. Clear visible fields
    // as soon as submission starts, even while the exact-scope preflight awaits.
    const credentials =
      target.action === 'save'
        ? Object.fromEntries(target.fields.map((field) => [field.name, values[field.name]]))
        : null;
    setValues({});
    ownership(true);
    setError(null);
    try {
      const latest = await client.solutionRevisionSetup(solutionId, revision.id);
      if (!alive.current) return;
      const current = latest.connectionRequirements?.find((item) => item.id === target.id);
      if (
        !sameRevision(latest?.revision, revision) ||
        !current ||
        current.scopeHash !== target.scopeHash ||
        JSON.stringify(current.scope) !== JSON.stringify(target.scope) ||
        current.connectionId !== target.connectionId ||
        (target.action === 'save'
          ? !current.canConnect || !supported(current)
          : !current.canRevoke || current.inherited)
      )
        throw new Error('SETUP_SCOPE_CHANGED');
      const command = {
        expectedVersion: revision.rowVersion,
        workflowHash: revision.workflowHash,
        ...(revision.bundleHash ? { bundleHash: revision.bundleHash } : {}),
        confirmedScopeHash: target.scopeHash,
        acknowledge: true,
        ...(target.action === 'save'
          ? { requirementId: target.id, credentials }
          : { connectionId: target.connectionId }),
      };
      const response =
        target.action === 'save'
          ? await client.createSolutionRevisionConnection(
              solutionId,
              revision.id,
              command,
              target.requestKey
            )
          : await client.revokeSolutionRevisionConnection(
              solutionId,
              revision.id,
              command,
              target.requestKey
            );
      if (!alive.current) return;
      if (
        response?.revision?.id !== revision.id ||
        response.revision.solutionId !== solutionId ||
        !Number.isInteger(response.revision.rowVersion) ||
        response.revision.rowVersion < revision.rowVersion
      )
        throw new Error('SETUP_RESPONSE_UNCONFIRMED');
      selection.current = null;
      setSelected(null);
      setConfirmed(false);
      requestMetadata.current = null;
      await callbacks.current.onSaved?.();
    } catch {
      if (!alive.current) return;
      // The key remains only in the metadata ref until success/unmount;
      // an ambiguous create is never silently submitted again with new secrets.
      selection.current = null;
      setSelected(null);
      setConfirmed(false);
      setError(
        'The connection change could not be confirmed. Entered credentials were cleared. Refresh saved status before another action; no request is retried automatically.'
      );
    } finally {
      if (alive.current) ownership(false);
    }
  }
  if (!supportedClient) return null;
  if (!data && !error)
    return (
      <Typography variant="caption" role="status">
        Checking this draft’s connection requirements…
      </Typography>
    );
  return (
    <Stack gap={1} aria-label="Secure draft connections">
      {error && (
        <Alert
          severity="warning"
          action={
            <Button disabled={busy || disabled} onClick={refresh}>
              Refresh connection status
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {data?.connectionRequirements?.length ? (
        <>
          <Typography variant="subtitle2">Connections for candidate v{revision.version}</Typography>
          <Typography variant="body2">
            {data.setup?.ready
              ? 'Connections are saved. Review this draft next; a successful service test is still required.'
              : data.setup?.reason || 'Needs you: set up the exact destination before continuing.'}
          </Typography>
          {data.connectionRequirements.map((item) => (
            <Box key={item.id} sx={{ borderLeft: 2, borderColor: 'divider', pl: 1.5 }}>
              <Typography variant="body2">
                {item.service} ·{' '}
                {item.status === 'saved' ? 'Saved — not tested' : item.status?.replaceAll('_', ' ')}
              </Typography>
              <Scope requirement={item} />
              <Typography variant="caption" color="text.secondary">
                {item.reason}
              </Typography>
              {item.inherited && (
                <Typography variant="caption" display="block">
                  Inherited connection: read-only here. This draft cannot revoke a credential used
                  by another version.
                </Typography>
              )}
              {item.canConnect &&
                hasScope(item) &&
                supported(item) &&
                typeof client.createSolutionRevisionConnection === 'function' && (
                  <Button disabled={disabled || busy || !!error} onClick={() => open(item, 'save')}>
                    Set up {item.service} securely
                  </Button>
                )}
              {item.canRevoke &&
                !item.inherited &&
                hasScope(item) &&
                typeof client.revokeSolutionRevisionConnection === 'function' && (
                  <Button
                    disabled={disabled || busy || !!error}
                    color="warning"
                    onClick={() => open(item, 'revoke')}
                  >
                    Revoke {item.service} connection
                  </Button>
                )}
            </Box>
          ))}
        </>
      ) : null}
      {selected && (
        <Dialog
          open
          fullWidth
          maxWidth="sm"
          onClose={close}
          disableEscapeKeyDown={busy}
          aria-labelledby="revision-connection-title"
        >
          <Box component="form" onSubmit={submit}>
            <DialogTitle id="revision-connection-title">
              {selected.action === 'save' ? 'Set up' : 'Revoke'} {selected.service} connection
            </DialogTitle>
            <DialogContent>
              <Stack gap={2} sx={{ pt: 1 }}>
                <Alert severity={selected.action === 'save' ? 'info' : 'warning'}>
                  {selected.action === 'save'
                    ? 'Credentials go only to the scoped connection service, never to chat, the Agent or workflow JSON. Saving does not send a provider request or activate this draft.'
                    : 'Revoke only this draft-owned connection. This can block the candidate until you set it up again; it does not undo requests already sent.'}
                </Alert>
                <Scope requirement={selected} />
                {selected.action === 'save' &&
                  selected.fields.map((field, index) => (
                    <TextField
                      key={field.name}
                      autoFocus={index === 0}
                      label={field.label}
                      type={field.type === 'secret' ? 'password' : 'text'}
                      autoComplete={field.type === 'secret' ? 'new-password' : 'off'}
                      value={values[field.name] || ''}
                      disabled={busy}
                      required
                      onChange={(event) =>
                        setValues((current) => ({ ...current, [field.name]: event.target.value }))
                      }
                      inputProps={{ maxLength: 8000, spellCheck: false }}
                    />
                  ))}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={confirmed}
                      disabled={busy}
                      onChange={(event) => setConfirmed(event.target.checked)}
                    />
                  }
                  label={
                    selected.action === 'save'
                      ? 'I confirm this exact destination and operation, and that this credential has only the required permissions.'
                      : 'I confirm revoking this exact draft connection.'
                  }
                />
                <Typography variant="caption">
                  Saved is not verified. Review, real testing and activation remain separate
                  explicit actions.
                </Typography>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={busy} onClick={close}>
                Cancel and clear
              </Button>
              <Button
                variant="contained"
                type="submit"
                disabled={
                  busy ||
                  disabled ||
                  !confirmed ||
                  (selected.action === 'save' &&
                    selected.fields.some((field) => !values[field.name]?.trim()))
                }
              >
                {busy
                  ? 'Confirming setup…'
                  : selected.action === 'save'
                    ? 'Save secure connection'
                    : 'Confirm revocation'}
              </Button>
            </DialogActions>
          </Box>
        </Dialog>
      )}
    </Stack>
  );
}
