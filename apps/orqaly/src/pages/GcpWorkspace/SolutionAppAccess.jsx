import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { SectionCard } from './WorkspacePrimitives.jsx';

const keyLabels = {
  active: 'Active key',
  expired: 'Expired',
  revoked: 'Revoked',
  release_changed: 'Release changed · create a new key',
};
const keyFields = [
  'id',
  'label',
  'prefix',
  'status',
  'workflowHash',
  'createdAt',
  'expiresAt',
  'lastUsedAt',
  'revokedAt',
  'rowVersion',
];
const metadataOnly = (key) => Object.fromEntries(keyFields.map((field) => [field, key[field]]));
const when = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Not recorded';
};
const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
function appRequestExample(endpoint, input) {
  return [
    `curl --request POST ${quote(endpoint)} \\`,
    '  --header "Authorization: Bearer $ORQALY_APP_KEY" \\',
    '  --header "Idempotency-Key: $ORQALY_REQUEST_ID" \\',
    "  --header 'Content-Type: application/json' \\",
    `  --data ${quote(JSON.stringify({ input }))}`,
  ].join('\n');
}

function actionMessage(error, kind) {
  if (error.code === 'APP_KEY_ALREADY_CREATED')
    return 'That request already created a key. Its secret cannot be shown again. Check the key list; revoke the key if you did not save it, then create a replacement.';
  if (error.code === 'APP_KEY_LIMIT')
    return 'The key limit has been reached. Refresh the list and revoke an unused or old-release key before creating another.';
  if (error.code === 'SOLUTION_NOT_ACTIVE')
    return 'This Solution is not active. Refresh its state; deployment, a successful test and activation are required before creating a key.';
  if (error.code === 'APP_KEY_RELEASE_CHANGED')
    return 'The approved workflow changed. Refresh and review the current release before explicitly granting a new key.';
  if (error.status === 409 || error.status === 412)
    return 'The Solution or key changed. Refresh and review its current state before trying again. No new access was confirmed.';
  if (error.status === 401 || error.status === 403)
    return 'Access could not be verified. Sign in with the account that owns this Solution and refresh.';
  return kind === 'create'
    ? 'Key creation could not be confirmed. Refresh the key list before retrying. Retrying unchanged fields checks the same request; a lost secret cannot be retrieved.'
    : 'The action could not be confirmed. Refresh the key list before trying again.';
}

export default function SolutionAppAccess(props) {
  return (
    <AppAccessWorkspace key={`${props.solution.id}:${props.solution.workflowHash}`} {...props} />
  );
}

function AppAccessWorkspace({ client, solution, example, onRefreshSolution }) {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(30);
  const [secret, setSecret] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [notice, setNotice] = useState(null);
  const alive = useRef(false);
  const readEpoch = useRef(0);
  const actionEpoch = useRef(0);
  const pendingCreate = useRef(null);
  const secretInput = useRef(null);

  const refresh = useCallback(async () => {
    const epoch = ++readEpoch.current;
    setLoading(true);
    try {
      const response = await client.solutionAppKeys(solution.id);
      if (!alive.current || epoch !== readEpoch.current) return;
      if (
        !Array.isArray(response.keys) ||
        !response.policy ||
        ![
          'defaultExpiryDays',
          'maxExpiryDays',
          'maxActiveKeys',
          'requestsPerMinute',
          'requestsPerDay',
          'maxConcurrentInvocations',
        ].every((field) => Number.isInteger(response.policy[field]) && response.policy[field] > 0)
      )
        throw new Error('invalid_app_key_response');
      setSnapshot({ keys: response.keys.map(metadataOnly), policy: response.policy });
      setError(null);
    } catch (value) {
      if (alive.current && epoch === readEpoch.current) {
        setSecret(null);
        setError(actionMessage(value, 'read'));
      }
    } finally {
      if (alive.current && epoch === readEpoch.current) setLoading(false);
    }
  }, [client, solution.id]);

  const dispose = useCallback(() => {
    alive.current = false;
    readEpoch.current++;
    actionEpoch.current++;
    pendingCreate.current = null;
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    return dispose;
  }, [refresh, dispose]);

  const keys = snapshot?.keys || [];
  const policy = snapshot?.policy;
  const activeCount = keys.filter((key) =>
    ['active', 'release_changed'].includes(key.status)
  ).length;
  const eligible = solution.status === 'active' && !!solution.deployment && !!solution.testedAt;
  const atLimit = !!policy && activeCount >= policy.maxActiveKeys;
  const requestExample = appRequestExample(client.appInvocationEndpoint(solution.id), example);

  const create = async (event) => {
    event.preventDefault();
    if (busy || loading || error || !eligible || atLimit || !label.trim() || !policy) return;
    const epoch = ++actionEpoch.current;
    readEpoch.current++;
    setSecret(null);
    setNotice(null);
    setError(null);
    setBusy('create');
    const command = { label: label.trim(), expiresInDays: days };
    const fingerprint = JSON.stringify({
      id: solution.id,
      version: solution.rowVersion,
      hash: solution.workflowHash,
      command,
    });
    if (pendingCreate.current?.fingerprint !== fingerprint)
      pendingCreate.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await client.createSolutionAppKey(
        solution,
        command,
        pendingCreate.current.key
      );
      if (!alive.current || epoch !== actionEpoch.current) return;
      if (
        !result.key?.id ||
        typeof result.token !== 'string' ||
        !result.token ||
        result.key.workflowHash !== solution.workflowHash
      )
        throw new Error('invalid_created_key_response');
      const key = metadataOnly(result.key);
      setSnapshot((current) => ({
        ...current,
        keys: [key, ...current.keys.filter((item) => item.id !== key.id)],
      }));
      setSecret({ token: result.token, label: key.label });
      pendingCreate.current = null;
      setLabel('');
    } catch (value) {
      if (!alive.current || epoch !== actionEpoch.current) return;
      setSecret(null);
      if (value.code === 'APP_KEY_ALREADY_CREATED') pendingCreate.current = null;
      setError(actionMessage(value, 'create'));
      if (value.status === 409 || value.status === 412) void onRefreshSolution?.();
    } finally {
      if (alive.current && epoch === actionEpoch.current) setBusy(null);
    }
  };

  const revoke = async () => {
    if (!revokeTarget || busy) return;
    const epoch = ++actionEpoch.current;
    readEpoch.current++;
    setSecret(null);
    setError(null);
    setNotice(null);
    setBusy('revoke');
    try {
      const result = await client.revokeSolutionAppKey(solution.id, revokeTarget);
      if (!alive.current || epoch !== actionEpoch.current) return;
      if (result.key?.id !== revokeTarget.id || result.key.status !== 'revoked')
        throw new Error('revocation_not_confirmed');
      const key = metadataOnly(result.key);
      setSnapshot((current) => ({
        ...current,
        keys: current.keys.map((item) => (item.id === key.id ? key : item)),
      }));
      setNotice(
        `Access revoked for ${key.label}. New calls with this key are blocked; running calls are not cancelled.`
      );
      setRevokeTarget(null);
      pendingCreate.current = null;
    } catch (value) {
      if (alive.current && epoch === actionEpoch.current) {
        setSecret(null);
        setError(actionMessage(value, 'revoke'));
        setRevokeTarget(null);
      }
    } finally {
      if (alive.current && epoch === actionEpoch.current) setBusy(null);
    }
  };

  const copy = async (value, isSecret = false) => {
    const epoch = actionEpoch.current;
    try {
      await navigator.clipboard.writeText(value);
      if (alive.current && epoch === actionEpoch.current)
        setNotice(
          isSecret
            ? 'Access key copied. Store it securely on your server.'
            : 'Request example copied.'
        );
    } catch {
      if (!alive.current || epoch !== actionEpoch.current) return;
      if (isSecret) secretInput.current?.select();
      setNotice(
        isSecret
          ? 'Automatic copy is unavailable. The key is selected; use your keyboard copy command before closing.'
          : 'Automatic copy is unavailable. Select and copy the request example below.'
      );
    }
  };

  const closeSecret = () => {
    actionEpoch.current++;
    setSecret(null);
    setNotice('The key is hidden and cannot be shown again. Its safe metadata remains below.');
  };

  return (
    <SectionCard
      title="Connect your application"
      description="Call this Solution from your server without keeping Orqaly open. App access keys allow production invocation only—not editing, deployment or activation."
    >
      <Stack gap={2}>
        <Chip
          sx={{ alignSelf: 'flex-start' }}
          color={solution.status === 'active' ? 'success' : 'default'}
          label={
            solution.status === 'active'
              ? 'Production endpoint active'
              : 'Production endpoint paused or inactive'
          }
        />
        <Typography variant="body2">
          Keys are bound to this exact approved workflow v{solution.version}. Activating a different
          workflow invalidates its previous keys; explicitly create a new key for that release.
          Pausing this Solution blocks new production calls from every app.
        </Typography>
        {!eligible ? (
          <Alert severity="info">
            Deploy, successfully test and activate this Solution before creating an app key.
          </Alert>
        ) : null}
        {error ? (
          <Alert
            severity="error"
            action={
              <Button disabled={!!busy || loading} onClick={refresh}>
                Refresh keys
              </Button>
            }
          >
            {error}
          </Alert>
        ) : null}
        {notice && !secret ? (
          <Alert severity="info" role="status">
            {notice}
          </Alert>
        ) : null}
        {loading ? <Typography role="status">Checking saved app access…</Typography> : null}
        <Box component="form" onSubmit={create} aria-label="Create app access key">
          <Stack gap={1.5}>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
              <TextField
                label="App key name"
                required
                value={label}
                fullWidth
                onChange={(event) => setLabel(event.target.value)}
                disabled={!!busy || !!secret}
                inputProps={{ maxLength: 80, autoComplete: 'off' }}
                helperText="A name you recognize, such as Billing server. Never enter a secret here."
              />
              <TextField
                select
                label="Key expires after"
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
                disabled={!!busy || !!secret}
                sx={{ minWidth: { sm: 175 } }}
              >
                <MenuItem value={30}>30 days</MenuItem>
                <MenuItem value={90}>90 days</MenuItem>
              </TextField>
            </Stack>
            {atLimit ? (
              <Alert severity="warning">
                You have reached the limit of {policy.maxActiveKeys} unrevoked, unexpired keys.
                Old-release keys also count. Revoke an unused or old-release key before creating
                another.
              </Alert>
            ) : null}
            <Button
              type="submit"
              variant="contained"
              sx={{ alignSelf: 'flex-start' }}
              disabled={
                !!busy || loading || !!error || !eligible || atLimit || !label.trim() || !policy
              }
            >
              {busy === 'create' ? 'Creating key…' : `Create key for v${solution.version}`}
            </Button>
          </Stack>
        </Box>
        <Stack direction="row" gap={1} justifyContent="space-between" alignItems="center">
          <Typography component="h3" variant="subtitle1">
            Application keys
          </Typography>
          <Button disabled={!!busy || loading} onClick={refresh}>
            Refresh keys
          </Button>
        </Stack>
        {!loading && !error && !keys.length ? (
          <Typography color="text.secondary">No application keys yet.</Typography>
        ) : null}
        <Stack
          component="ul"
          gap={1.5}
          sx={{ listStyle: 'none', m: 0, p: 0 }}
          aria-label="Application access keys"
        >
          {keys.map((key) => (
            <Box
              component="li"
              key={key.id}
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                gap={1.5}
                justifyContent="space-between"
              >
                <Stack gap={0.75} sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ overflowWrap: 'anywhere' }}>
                    {key.label}
                  </Typography>
                  <Chip
                    size="small"
                    sx={{ alignSelf: 'flex-start' }}
                    label={keyLabels[key.status] || 'Status unavailable'}
                  />
                  <Typography variant="caption" component="code">
                    {key.prefix}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Expires {when(key.expiresAt)} · Last used{' '}
                    {key.lastUsedAt ? when(key.lastUsedAt) : 'Never recorded'}
                  </Typography>
                  {key.status === 'active' && solution.status !== 'active' ? (
                    <Typography variant="body2">
                      Key retained; production calls are blocked while this Solution is inactive.
                    </Typography>
                  ) : null}
                </Stack>
                {key.status !== 'revoked' ? (
                  <Button
                    color="warning"
                    variant="outlined"
                    disabled={!!busy || loading || !!error}
                    sx={{ alignSelf: 'flex-start', flexShrink: 0 }}
                    onClick={() => {
                      setSecret(null);
                      setRevokeTarget(key);
                    }}
                    aria-label={`Revoke ${key.label}`}
                  >
                    Revoke
                  </Button>
                ) : null}
              </Stack>
            </Box>
          ))}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          To rotate access, create a replacement, update your server, then explicitly revoke the old
          key. Creating a replacement does not revoke anything. Do not retry an uncertain call with
          a new key.
        </Typography>
        <Typography component="h3" variant="subtitle1">
          Server-side request example
        </Typography>
        <Typography variant="body2">
          Store your key in your server’s secret manager, not browser code or chat. Set
          ORQALY_APP_KEY and a unique ORQALY_REQUEST_ID for each logical request. Reuse the same
          request ID only for an identical retry with the same key.
        </Typography>
        <Box
          component="pre"
          aria-label="Server-side application request"
          sx={{
            m: 0,
            p: 2,
            borderRadius: 1,
            bgcolor: 'action.hover',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            fontSize: 13,
          }}
        >
          {requestExample}
        </Box>
        <Button
          variant="outlined"
          sx={{ alignSelf: 'flex-start' }}
          onClick={() => copy(requestExample)}
        >
          Copy request example
        </Button>
        <Typography variant="body2" color="text.secondary">
          If an outcome is pending or unknown, check its receipt with the same key at{' '}
          <Box component="code" sx={{ overflowWrap: 'anywhere' }}>
            {client.appInvocationEndpoint(solution.id)}/invocations/INVOCATION_ID
          </Box>
          . Do not automatically send another production call. No Clerk session or browser cookies
          are needed.
        </Typography>
        {policy ? (
          <Typography variant="caption" color="text.secondary">
            Shared Solution limits: {policy.requestsPerMinute} requests/minute,{' '}
            {policy.requestsPerDay}/day, {policy.maxConcurrentInvocations} in flight. Up to{' '}
            {policy.maxActiveKeys} unrevoked, unexpired keys; maximum {policy.maxExpiryDays}-day
            expiry.
          </Typography>
        ) : null}
        {secret ? (
          <Dialog
            open
            disableEscapeKeyDown
            onClose={() =>
              setNotice(
                'Save the key first, then choose “I saved it · hide key” to close this dialog.'
              )
            }
            fullWidth
            maxWidth="sm"
            aria-labelledby="app-key-secret-title"
            aria-describedby="app-key-secret-description"
          >
            <DialogTitle id="app-key-secret-title">Save your new app key</DialogTitle>
            <DialogContent dividers>
              <Stack gap={2}>
                <Typography id="app-key-secret-description">
                  {secret?.label}: this secret is shown once. Closing this dialog, leaving this tab
                  or changing the Solution discards it. It cannot be retrieved later.
                </Typography>
                <TextField
                  label="New app access key"
                  value={secret?.token || ''}
                  inputRef={secretInput}
                  multiline
                  fullWidth
                  inputProps={{ readOnly: true, autoComplete: 'off', spellCheck: false }}
                />
                {notice ? (
                  <Alert severity="info" role="status">
                    {notice}
                  </Alert>
                ) : null}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
              <Button autoFocus onClick={() => secret && copy(secret.token, true)}>
                Copy access key
              </Button>
              <Button variant="contained" onClick={closeSecret}>
                I saved it · hide key
              </Button>
            </DialogActions>
          </Dialog>
        ) : null}
        {revokeTarget ? (
          <Dialog
            open
            onClose={busy ? undefined : () => setRevokeTarget(null)}
            fullWidth
            maxWidth="sm"
            aria-labelledby="app-key-revoke-title"
            aria-describedby="app-key-revoke-description"
          >
            <DialogTitle id="app-key-revoke-title">Revoke {revokeTarget?.label}?</DialogTitle>
            <DialogContent>
              <Typography id="app-key-revoke-description">
                This stops new calls using this key. Other keys and the workflow remain unchanged.
                Already-running calls are not cancelled. This key cannot be restored.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button autoFocus disabled={!!busy} onClick={() => setRevokeTarget(null)}>
                Keep key
              </Button>
              <Button color="warning" variant="contained" disabled={!!busy} onClick={revoke}>
                {busy === 'revoke' ? 'Revoking…' : 'Revoke access'}
              </Button>
            </DialogActions>
          </Dialog>
        ) : null}
      </Stack>
    </SectionCard>
  );
}
