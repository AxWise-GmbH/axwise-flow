import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Stack, Typography } from '@mui/material';
import { SectionCard } from './WorkspacePrimitives.jsx';

const labels = { proposed: 'Review needed', approved: 'Approved · not started', queued: 'Queued by n8n', running: 'Running in isolated sandbox',
  succeeded: 'Tests passed', failed: 'Command failed', timed_out: 'Time limit reached', cancelled: 'Cancelled', outcome_unknown: 'Outcome uncertain' };
const isWaiting = (job) => ['queued', 'running'].includes(job.status);
const displayError = (error) => ['CODING_VERSION_CONFLICT', 'CODING_SPEC_CONFLICT', 'CODING_RUN_STATE_CONFLICT'].includes(error?.code)
  ? 'This job changed. Refresh and review the latest state before continuing.'
  : 'The result could not be confirmed. Refresh to check the persisted job; do not start a replacement for an uncertain run.';

function Files({ title, files }) {
  return <Box component="details"><Typography component="summary" sx={{ cursor: 'pointer' }}>{title}</Typography>
    <Stack gap={1} sx={{ pt: 1 }}>{files.map((file) => <Box key={file.path}>
      <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{file.path}</Typography>
      <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'action.hover', borderRadius: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}>{file.content ?? '(deleted)'}</Box>
    </Box>)}</Stack></Box>;
}
function download(artifact) {
  const url = URL.createObjectURL(new Blob([artifact.content], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = artifact.path.split('/').at(-1); link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function SolutionCodingJobs({ client, solution, runId }) {
  const [jobs, setJobs] = useState(null), [selected, setSelected] = useState(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [checked, setChecked] = useState(false), [uncertain, setUncertain] = useState(false);
  const epoch = useRef(0); const selectedId = useRef(null); const inFlight = useRef(false);
  const load = useCallback(async () => {
    if (!runId || !client.listSolutionCodingJobs) return;
    const generation = epoch.current;
    try {
      const data = await client.listSolutionCodingJobs(solution.id, { runId });
      if (epoch.current !== generation) return;
      setJobs(data.jobs); setError(''); setUncertain(false);
      if (selectedId.current) {
        const detail = await client.readSolutionCodingJob(solution.id, selectedId.current, { runId });
        if (epoch.current === generation && selectedId.current === detail.job.id) setSelected(detail.job);
      }
    } catch { if (epoch.current === generation) setError('Coding jobs could not be loaded. Refresh to reconnect.'); }
  }, [client, solution.id, runId]);
  useEffect(() => {
    epoch.current += 1; selectedId.current = null; setSelected(null); setJobs(null); setChecked(false); setError(''); setUncertain(false); setBusy(false);
    void load();
    return () => { epoch.current += 1; };
  }, [load]);
  useEffect(() => {
    if (!jobs?.some(isWaiting)) return;
    const timer = setInterval(() => { if (!inFlight.current) void load(); }, 3000);
    return () => clearInterval(timer);
  }, [jobs, load]);
  async function inspect(job) {
    const generation = epoch.current; selectedId.current = job.id; setChecked(false); setSelected(null);
    try { const data = await client.readSolutionCodingJob(solution.id, job.id, { runId });
      if (epoch.current === generation && selectedId.current === job.id) setSelected(data.job);
    } catch { if (epoch.current === generation) setError('The files could not be loaded. Refresh before approving.'); }
  }
  async function act(action) {
    if (inFlight.current || !selected) return;
    const generation = epoch.current; const snapshot = selected;
    inFlight.current = true; setBusy(true); setError('');
    const methods = { approve: 'approveSolutionCodingJob', run: 'runSolutionCodingJob', cancel: 'cancelSolutionCodingJob', reconcile: 'reconcileSolutionCodingJob' };
    try {
      await client[methods[action]](solution.id, snapshot.id, { runId, expectedVersion: snapshot.rowVersion, specHash: snapshot.specHash }, crypto.randomUUID());
      if (epoch.current === generation) { setChecked(false); await load(); }
    } catch (problem) { if (epoch.current === generation) { setError(displayError(problem)); setUncertain(true); } }
    finally { inFlight.current = false; if (epoch.current === generation) setBusy(false); }
  }
  if (!client.listSolutionCodingJobs) return null;
  const blocked = busy || uncertain;
  return <SectionCard title="Code & tests"><Stack gap={2} sx={{ minWidth: 0 }}>
    <Typography variant="body2">n8n queues your approved job. A separate, isolated worker applies the reviewed file changes and runs the exact tests without network access or account credentials.</Typography>
    <Alert severity="info">This release accepts prepared source-change proposals. Automatic Agent preparation and GitHub publishing are not connected yet. The output is files you can inspect and download, not a published repository change.</Alert>
    {!runId && <Typography variant="body2">This Solution has no linked task available for coding jobs.</Typography>}
    {error && <Alert severity="warning" role="alert">{error}</Alert>}
    {runId && <Button onClick={load} disabled={busy}>Refresh coding jobs</Button>}
    {jobs === null && runId && !error && <Typography role="status">Loading coding jobs…</Typography>}
    {jobs?.length === 0 && <Typography>No coding proposal has been prepared for this task yet.</Typography>}
    {jobs?.map((job) => <Stack key={job.id} direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }}>
      <Typography sx={{ flex: 1, overflowWrap: 'anywhere' }}>{job.title}</Typography><Chip size="small" label={labels[job.status] || 'State unavailable'} />
      <Button onClick={() => inspect(job)} disabled={busy} aria-label={`Review files for ${job.title}`}>Review files</Button>
    </Stack>)}
    {selected?.spec && <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}><Stack gap={2}>
      <Typography component="h3" variant="subtitle1">{selected.title}</Typography>
      <Typography variant="body2">Approved boundary: Node.js tests only · {selected.spec.limits.timeoutMs / 1000}s maximum · no package downloads · no GitHub writes.</Typography>
      <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>Exact version: {selected.specHash}</Typography>
      <Files title="Original source" files={selected.spec.source} /><Files title="Proposed changes" files={selected.spec.changes} /><Files title="Tests that will run (read-only)" files={selected.spec.tests} />
      {selected.status === 'proposed' && <>
        <FormControlLabel control={<Checkbox checked={checked} onChange={(event) => setChecked(event.target.checked)} disabled={blocked} />} label="I reviewed these exact changes, tests and limits." />
        <Button variant="contained" disabled={blocked || !checked} onClick={() => act('approve')}>Approve this coding job</Button>
      </>}
      {selected.status === 'approved' && <>
        <Typography variant="body2">Approval is saved. Running creates a short-lived n8n dispatch for this exact job, then the isolated worker produces test evidence and files.</Typography>
        {selected.orchestration && selected.orchestration.status !== 'accepted' ? <Alert severity="warning">A previous n8n launch is unresolved. Refresh and inspect its status; another launch is not allowed.</Alert>
          : <Button variant="contained" disabled={blocked} onClick={() => act('run')}>Run via n8n</Button>}
      </>}
      {['proposed', 'approved', 'queued'].includes(selected.status) && <Button disabled={blocked} onClick={() => act('cancel')}>Cancel unstarted job</Button>}
      {isWaiting(selected) && <Typography role="status">{labels[selected.status]}. This continues with the browser closed.</Typography>}
      {selected.status === 'outcome_unknown' && <Alert severity="warning">The command outcome is uncertain. It will not run again automatically. {selected.evidence?.cleanup?.status === 'removed' ? 'Sandbox cleanup is confirmed; no test success is claimed.' : 'Other coding jobs remain blocked until sandbox cleanup is confirmed.'}</Alert>}
      {selected.status === 'outcome_unknown' && selected.evidence?.cleanup?.status !== 'removed' && <Button disabled={blocked} onClick={() => act('reconcile')}>Check & clean up sandbox</Button>}
      {selected.orchestration && <Typography variant="body2">n8n dispatch: {selected.orchestration.status.replaceAll('_', ' ')}{selected.orchestration.evidence?.executionId ? ` · Execution ${selected.orchestration.evidence.executionId}` : ''}</Typography>}
      {selected.orchestration && ['initiating', 'outcome_unknown'].includes(selected.orchestration.status) &&
        (selected.orchestration.evidence?.workflowCleanup !== 'removed' || selected.orchestration.evidence?.credentialCleanup !== 'removed') && <>
        <Typography variant="body2">After the five-minute dispatch permission expires, check and remove only this launch’s temporary n8n resources. This does not resend the job.</Typography>
        <Button disabled={blocked} onClick={() => act('reconcile')}>Check n8n dispatch cleanup</Button>
      </>}
      {selected.evidence && <Box><Typography variant="subtitle2">Actual execution evidence</Typography>
        <Typography variant="body2">{labels[selected.status]}. Exit code: {selected.evidence.command?.exitCode ?? 'not reported'}{selected.evidence.command?.signal ? ` · Signal: ${selected.evidence.command.signal}` : ''}. Cleanup: {selected.evidence.cleanup?.status ?? 'unconfirmed'}.</Typography>
        {selected.evidence.log && <Box component="pre" aria-label="Actual test output" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, maxHeight: 260, overflow: 'auto' }}>{selected.evidence.log}</Box>}
      </Box>}
      {selected.artifacts?.map((artifact) => <Stack key={artifact.path} gap={0.5}><Button onClick={() => download(artifact)} sx={{ alignSelf: 'start', overflowWrap: 'anywhere' }}>Download {artifact.path}</Button><Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>{artifact.bytes} bytes · SHA-256 {artifact.hash}</Typography></Stack>)}
    </Stack></Box>}
  </Stack></SectionCard>;
}
