import { useEffect, useId, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';

export default function NativeN8nCanvas(props) {
  return (
    <NativeSession
      key={JSON.stringify([
        props.solutionId,
        props.buildRequestId,
        props.revisionId,
        props.dependencyId,
        props.mode || 'view',
      ])}
      {...props}
    />
  );
}

function NativeSession(props) {
  const [attempt, setAttempt] = useState(0);
  return (
    <NativeSessionAttempt
      key={attempt}
      {...props}
      onReconnect={() => setAttempt((value) => value + 1)}
    />
  );
}

function NativeSessionAttempt({
  client,
  solutionId,
  buildRequestId,
  revisionId = null,
  dependencyId,
  mode = 'view',
  compact = false,
  onReconnect,
  onSessionStateChange,
}) {
  const frameName = `n8n-${useId().replaceAll(':', '')}`;
  const formRef = useRef(null);
  const frameRef = useRef(null);
  const [launch, setLaunch] = useState(null);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [expired, setExpired] = useState(false);
  const [confirmReconnect, setConfirmReconnect] = useState(false);
  const sessionState = expired ? 'expired' : error ? 'error' : loaded ? 'ready' : 'connecting';
  useEffect(() => {
    onSessionStateChange?.(sessionState);
  }, [onSessionStateChange, sessionState]);
  useEffect(() => {
    let cancelled = false;
    const session = Promise.resolve().then(() => {
      if (Boolean(buildRequestId) === Boolean(solutionId) || (buildRequestId && revisionId))
        throw new Error('Choose exactly one workflow authoring target.');
      if (dependencyId && mode !== 'view')
        throw new Error('Linked error workflows can only be viewed here.');
      return buildRequestId
        ? client.nativeBuildRequestSession(buildRequestId, {
            mode,
            ...(dependencyId ? { dependencyId } : {}),
          })
        : client.nativeSolutionSession(solutionId, {
            revisionId,
            mode,
            ...(dependencyId ? { dependencyId } : {}),
          });
    });
    session
      .then((result) => {
        if (cancelled) return;
        const target = new URL(result.launchUrl);
        const endpoint = new URL(
          buildRequestId
            ? client.buildRequestEndpoint(buildRequestId)
            : client.solutionEndpoint(solutionId)
        );
        if (
          target.origin !== endpoint.origin ||
          target.pathname !== '/native-n8n/launch' ||
          target.search ||
          target.hash
        )
          throw new Error('The editor returned an unexpected connection address.');
        setLaunch(result);
      })
      .catch((value) => {
        if (!cancelled) setError(value.message);
      });
    return () => {
      cancelled = true;
    };
  }, [client, solutionId, buildRequestId, revisionId, dependencyId, mode]);
  useEffect(() => {
    if (launch) formRef.current?.submit();
  }, [launch]);
  useEffect(() => {
    if (!launch) return undefined;
    const origin = new URL(launch.launchUrl).origin;
    const receive = (event) => {
      if (event.origin !== origin || event.source !== frameRef.current?.contentWindow) return;
      let value;
      try {
        value = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (value?.command === 'n8nReady') setLoaded(true);
      if (value?.command === 'orqaly:n8n:error')
        setError('The editor session could not open. Reconnect to try again.');
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [launch]);
  useEffect(() => {
    if (!launch || error) return undefined;
    const timer = setTimeout(() => {
      setExpired(true);
      setLaunch(null);
    }, 10 * 60_000);
    return () => clearTimeout(timer);
  }, [launch, error]);
  useEffect(() => {
    if (!launch || loaded || error) return undefined;
    const timer = setTimeout(
      () => setError('The native canvas has not finished loading. Reconnect to try again.'),
      90_000
    );
    return () => clearTimeout(timer);
  }, [launch, loaded, error]);
  return (
    <Stack
      gap={1.5}
      aria-label={mode === 'edit' ? 'Native n8n draft editor' : 'Native n8n workflow viewer'}
    >
      {error || expired ? (
        <Alert
          severity="warning"
          action={
            <Button onClick={() => (mode === 'edit' ? setConfirmReconnect(true) : onReconnect())}>
              Reconnect
            </Button>
          }
        >
          {expired
            ? mode === 'edit'
              ? 'The editor session has expired. Copy any unsaved work from the open editor before reconnecting. This session can no longer save changes.'
              : 'The viewer session has expired. Reconnect to open the saved workflow again.'
            : error}
        </Alert>
      ) : null}
      {!error && !expired && !loaded ? (
        <Stack direction="row" alignItems="center" gap={1} role="status">
          <CircularProgress size={18} />
          <Typography variant="body2">
            Opening your n8n {mode === 'edit' ? 'draft editor' : 'workflow'}… The isolated editor
            may take up to a minute to wake up.
          </Typography>
        </Stack>
      ) : null}
      {launch ? (
        <form ref={formRef} action={launch.launchUrl} method="post" target={frameName} hidden>
          <input type="hidden" name="token" value={launch.token} readOnly />
        </form>
      ) : null}
      {(!error && !expired) || (mode === 'edit' && loaded) ? (
        <Box
          sx={{
            height: compact ? { xs: 420, lg: 540 } : { xs: 580, lg: 680 },
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            overflow: 'hidden',
            bgcolor: 'background.paper',
          }}
        >
          <iframe
            ref={frameRef}
            name={frameName}
            title={mode === 'edit' ? 'Native n8n draft editor' : 'Native n8n workflow viewer'}
            sandbox="allow-scripts allow-forms allow-same-origin"
            referrerPolicy="no-referrer"
            style={{ width: '100%', height: '100%', display: 'block', border: 0 }}
          />
        </Box>
      ) : null}
      <Dialog
        open={confirmReconnect}
        onClose={() => setConfirmReconnect(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Reconnect to the saved draft?</DialogTitle>
        <DialogContent>
          <Typography>
            Reconnecting replaces this editor. Only changes already saved by n8n will be retained;
            unsaved text will be lost. Copy anything you need before continuing.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmReconnect(false)}>Keep this editor open</Button>
          <Button variant="contained" onClick={onReconnect}>
            Reconnect to saved draft
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
