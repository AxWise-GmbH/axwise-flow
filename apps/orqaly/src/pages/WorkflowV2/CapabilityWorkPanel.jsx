import { useLayoutEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  CAPABILITY_COMPILER_NOTICE,
  CAPABILITY_PROCESSING_NOTICE,
  capabilityLabel,
  capabilityScopeRequest,
  capabilityReviewLimitations,
  isCapabilityWork,
} from '../../../shared/workflow-v2/capability-work-primitives.js';

const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const WRITABLE = new Set(['awaiting_capability_input', 'completed', 'failed']);
const refFields = ['artifactId', 'artifactHash', 'kind'];
const exactRef = (reference) => Object.fromEntries(refFields.map((key) => [key, reference[key]]));
const sameRef = (left, right) =>
  !!left && !!right && refFields.every((key) => left[key] === right[key]);
const validRef = (reference) =>
  reference &&
  UUID.test(reference.artifactId) &&
  HASH.test(reference.artifactHash) &&
  typeof reference.kind === 'string';
const commandIdentity = () => ({
  commandId: crypto.randomUUID(),
  issuedAt: new Date().toISOString(),
});
const newDocument = () => ({ title: '', participantId: '', displayName: '', text: '' });
const newStakeholder = () => ({
  label: '',
  description: '',
  participantCount: '1',
  countryCode: '',
  locality: '',
  questions: [''],
});

function check(condition, message) {
  if (!condition) throw new Error(message);
}
function boundedText(value, maximum, label) {
  check(
    typeof value === 'string' && value.trim() && [...value].length <= maximum,
    `${label} must contain 1–${maximum} characters.`
  );
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      check(next >= 0xdc00 && next <= 0xdfff, `${label} contains invalid Unicode.`);
    } else check(unit < 0xdc00 || unit > 0xdfff, `${label} contains invalid Unicode.`);
  }
  return value;
}
function boundedInteger(value, minimum, maximum, label) {
  check(
    String(value).trim() !== '' && /^\d+$/.test(String(value)),
    `${label} must be a whole number.`
  );
  const result = Number(value);
  check(
    Number.isSafeInteger(result) && result >= minimum && result <= maximum,
    `${label} must be between ${minimum} and ${maximum}.`
  );
  return result;
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
async function sha256Text(value) {
  // TextEncoder replaces lone surrogates. Reject them instead of hashing
  // different bytes from those disclosed to the owner.
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      check(next >= 0xdc00 && next <= 0xdfff, 'Invalid source Unicode.');
    } else check(unit < 0xdc00 || unit > 0xdfff, 'Invalid source Unicode.');
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function exactProjection(value, fields) {
  check(
    value &&
      !Array.isArray(value) &&
      stableJson(Object.keys(value).sort()) === stableJson([...fields].sort()),
    'The source disclosure contains missing or additional fields.'
  );
  return Object.fromEntries(fields.map((field) => [field, value[field]]));
}
function participantProjection(value) {
  const participant = exactProjection(value, [
    'participantId',
    'displayName',
    'role',
    'stakeholderId',
  ]);
  check(
    typeof participant.participantId === 'string' &&
      participant.participantId.length > 0 &&
      (participant.displayName === null ||
        (typeof participant.displayName === 'string' && participant.displayName.length > 0)) &&
      ['participant', 'interviewer', 'author', 'unknown'].includes(participant.role) &&
      (participant.stakeholderId === null ||
        (typeof participant.stakeholderId === 'string' && participant.stakeholderId.length > 0)),
    'The participant disclosure is incomplete.'
  );
  return participant;
}
function turnProjection(value) {
  const turn = exactProjection(value, [
    'turnId',
    'participantId',
    'questionId',
    'start',
    'end',
    'offsetUnit',
  ]);
  check(
    typeof turn.turnId === 'string' &&
      turn.turnId.length > 0 &&
      typeof turn.participantId === 'string' &&
      turn.participantId.length > 0 &&
      (turn.questionId === null ||
        (typeof turn.questionId === 'string' && turn.questionId.length > 0)) &&
      Number.isSafeInteger(turn.start) &&
      turn.start >= 0 &&
      Number.isSafeInteger(turn.end) &&
      turn.end > turn.start &&
      turn.end <= 128_000 &&
      turn.offsetUnit === 'utf8_bytes',
    'The turn disclosure is incomplete.'
  );
  return turn;
}
async function disclosedSimulationPlan(request, operationId) {
  const slots = request.stakeholders.flatMap((group) =>
    Array.from({ length: group.participantCount }, (_, index) => ({ group, slotIndex: index + 1 }))
  );
  return Promise.all(
    slots.map(async ({ group, slotIndex }) => {
      const digest = await sha256Text(
        stableJson({
          namespace: 'axwise.simulation.v1',
          kind: 'participant',
          operationId: operationId.toLowerCase(),
          parts: [group.stakeholderId, slotIndex],
        })
      );
      const bytes = digest
        .slice(0, 32)
        .match(/../g)
        .map((byte) => Number.parseInt(byte, 16));
      bytes[6] = (bytes[6] & 15) | 0x50;
      bytes[8] = (bytes[8] & 63) | 0x80;
      const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const oceanMicros = Object.fromEntries(
        await Promise.all(
          ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'].map(
            async (trait) => {
              const sample = await sha256Text(
                stableJson({
                  profile: request.sampling.profileVersion,
                  seed: request.sampling.seed,
                  stakeholderId: group.stakeholderId,
                  slotIndex,
                  trait,
                })
              );
              return [trait, 300_000 + Number(BigInt(`0x${sample.slice(0, 16)}`) % 400_001n)];
            }
          )
        )
      );
      return {
        participantId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
        stakeholderId: group.stakeholderId,
        slotIndex,
        countryCode: group.countryCode,
        locality: group.locality,
        oceanMicros,
      };
    })
  );
}
async function verifyProviderPayload(review, draft) {
  let expected;
  if (draft.operationType === 'AnalyzeEvidenceV1') {
    const documents = await Promise.all(
      review.selectedSources[0].documents.map(async (document) => ({
        documentId: document.documentId,
        title: document.title,
        text: document.text,
        textSha256: await sha256Text(document.text),
        origin: document.origin,
        participants: document.participants.map(participantProjection),
        turns: document.turns.map(turnProjection),
      }))
    );
    expected = {
      request: draft.request,
      corpus: { schemaVersion: 'axwise.transcript-corpus.v1', documents },
    };
  } else {
    const request = draft.request;
    const selectedPassages = draft.selectedGrounding.map((selection, index) => {
      const source = review.selectedSources.find((entry) =>
        sameRef(entry.artifact, selection.artifact)
      );
      return {
        passageId: `passage-${index + 1}`,
        text: source.passages.find((entry) => entry.entryId === selection.entryId).text,
      };
    });
    expected = {
      scenario: request.scenario,
      stakeholders: request.stakeholders,
      sampling: request.sampling,
      responseStyle: request.responseStyle,
      generationProfile: request.generationProfile,
      plan: await disclosedSimulationPlan(request, review.operationId),
      selectedPassages,
    };
  }
  check(
    stableJson(review.providerPayload) === stableJson(expected),
    'The disclosed Google data does not match the selected source, scenario, or deterministic plan.'
  );
  check(
    stableJson(review.limitations) ===
      stableJson(capabilityReviewLimitations(draft.operationType, draft.request.grounding?.mode)),
    'The processing limitations are missing or changed.'
  );
}
function eligibleArtifacts(workflow, kinds) {
  const unique = new Map();
  for (const stage of workflow?.stages ?? []) {
    const reference = stage.outputArtifact;
    if (
      stage.kind === 'execution' &&
      stage.status === 'completed' &&
      validRef(reference) &&
      kinds.includes(reference.kind) &&
      (reference.runId == null || reference.runId === workflow.run.id)
    ) {
      unique.set(reference.artifactId, exactRef(reference));
    }
  }
  return [...unique.values()];
}
function scopeReference(workflow) {
  const reference = workflow?.stages?.find(
    (stage) => stage.kind === 'compile_scope' && stage.status === 'completed'
  )?.outputArtifact;
  return validRef(reference) &&
    reference.kind === 'scope' &&
    (reference.runId == null || reference.runId === workflow.run.id)
    ? exactRef(reference)
    : null;
}
function verifyArtifact(response, reference, runId) {
  const artifact = response?.artifact;
  check(
    sameRef(artifact, reference) && (artifact.runId == null || artifact.runId === runId),
    'The selected artifact identity did not match.'
  );
  check(
    artifact.payload && typeof artifact.payload === 'object',
    'The selected artifact has no structured content.'
  );
  return artifact.payload;
}

// Browser-only review checks. The server independently revalidates immutable
// source hashes and recomputes the consent binding; no server modules enter this bundle.
async function verifyReview(review, draft, runId, scope, loadedGrounding) {
  check(
    review &&
      HASH.test(review.reviewId) &&
      HASH.test(review.bindingHash) &&
      UUID.test(review.operationId),
    'The processing review is incomplete.'
  );
  check(
    review.provider === 'google' &&
      review.purpose === draft.operationType &&
      review.noticeVersion === CAPABILITY_PROCESSING_NOTICE &&
      review.runId === runId &&
      review.expectedRowVersion === draft.expectedRowVersion,
    'The processing review no longer matches this work item.'
  );
  check(
    sameRef(review.acceptedScope, scope) &&
      (review.acceptedScope.runId == null || review.acceptedScope.runId === runId) &&
      stableJson(review.request) === stableJson(draft.request),
    'The processing review changed the selected scope or request.'
  );
  const expected =
    draft.operationType === 'AnalyzeEvidenceV1'
      ? [draft.sourceArtifact]
      : draft.request.grounding.sourceArtifacts;
  check(
    Array.isArray(review.selectedSources) && review.selectedSources.length === expected.length,
    'The processing review changed the selected sources.'
  );
  const seen = new Set();
  for (const source of review.selectedSources) {
    check(
      expected.some((ref) => sameRef(ref, source.artifact)) &&
        (source.artifact.runId == null || source.artifact.runId === runId) &&
        !seen.has(source.artifact.artifactId),
      'The processing review contains an unselected source.'
    );
    seen.add(source.artifact.artifactId);
    check(typeof source.title === 'string', 'The source disclosure is incomplete.');
    if (draft.operationType === 'AnalyzeEvidenceV1') {
      check(
        Array.isArray(source.documents) &&
          source.documents.length > 0 &&
          source.documents.length <= 16,
        'The transcript disclosure is incomplete.'
      );
      check(
        source.documents.every(
          (document) =>
            UUID.test(document.documentId) &&
            typeof document.title === 'string' &&
            typeof document.text === 'string' &&
            ['supplied_transcript', 'supplied_document', 'synthetic_transcript'].includes(
              document.origin
            ) &&
            Array.isArray(document.participants) &&
            Array.isArray(document.turns)
        ),
        'The transcript disclosure is incomplete.'
      );
    } else {
      const selected = draft.selectedGrounding.filter((entry) =>
        sameRef(entry.artifact, source.artifact)
      );
      check(
        Array.isArray(source.passages) &&
          source.passages.length === selected.length &&
          new Set(source.passages.map((entry) => entry.entryId)).size === selected.length &&
          source.passages.every(
            (entry) =>
              typeof entry.text === 'string' &&
              selected.some((selection) => selection.entryId === entry.entryId) &&
              loadedGrounding[source.artifact.artifactId]?.find(
                (quote) => quote.quoteId === entry.entryId
              )?.text === entry.text
          ),
        'The grounding disclosure changed the selected passages.'
      );
    }
  }
  check(
    review.limits &&
      ['deadlineMs', 'maxModelCalls', 'maxInputTokens', 'maxOutputTokens'].every(
        (key) => Number.isSafeInteger(review.limits[key]) && review.limits[key] > 0
      ),
    'The processing limits are missing.'
  );
  await verifyProviderPayload(review, draft);
  return review;
}

function JsonDisclosure({ label, value }) {
  return (
    <Box>
      <Typography component="h4" variant="subtitle2">
        {label}
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0,
          mt: 1,
          p: 1.5,
          bgcolor: 'action.hover',
          borderRadius: 1,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          maxHeight: 360,
          overflow: 'auto',
          fontSize: '0.75rem',
        }}
      >
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </Box>
    </Box>
  );
}
function Check({ label, checked, onChange, disabled }) {
  return (
    <FormControlLabel
      control={
        <Checkbox
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
        />
      }
      label={label}
    />
  );
}
function Field({
  label,
  value,
  onChange,
  multiline = false,
  disabled = false,
  inputProps,
  ...rest
}) {
  const hintStart = label.indexOf(' (');
  const shortLabel = (hintStart < 0 ? label : label.slice(0, hintStart)).replace(
    'exact participant transcript',
    'transcript'
  );
  const guidance =
    hintStart < 0
      ? shortLabel === label
        ? undefined
        : 'One participant’s exact words; no automatic speaker detection.'
      : label.slice(hintStart + 2, -1);
  return (
    <TextField
      fullWidth
      size="small"
      label={shortLabel}
      helperText={guidance}
      inputProps={{ ...inputProps, 'aria-label': label }}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      multiline={multiline}
      minRows={multiline ? 3 : undefined}
      disabled={disabled}
      {...rest}
    />
  );
}
function Choice({ label, value, onChange, options, disabled }) {
  return (
    <TextField
      fullWidth
      select
      size="small"
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      SelectProps={{ native: true }}
      InputLabelProps={{ shrink: true }}
    >
      {options.map(([key, text]) => (
        <option key={key} value={key}>
          {text}
        </option>
      ))}
    </TextField>
  );
}

function StartForm({ disabled, onStart, invalidate }) {
  const [capability, setCapability] = useState('AnalyzeEvidenceV1');
  const [purpose, setPurpose] = useState('');
  const [allowAnalysis, setAllowAnalysis] = useState(false);
  const [consent, setConsent] = useState(false);
  const change = (setter) => (value) => {
    invalidate();
    setConsent(false);
    setter(value);
  };
  const request = {
    capability,
    request: purpose,
    allowSimulationAnalysis: capability === 'SimulateV1' && allowAnalysis,
  };
  return (
    <Stack spacing={2}>
      <Typography component="h2" variant="h6">
        New analysis or simulation
      </Typography>
      <Alert severity="info">
        This creates a separate capability work item. It does not require a PRD, research,
        implementation, or deployment. Existing Goal outputs stay unchanged.
      </Alert>
      <Choice
        label="Capability"
        value={capability}
        onChange={change(setCapability)}
        disabled={disabled}
        options={[
          ['AnalyzeEvidenceV1', 'Analyze supplied transcripts'],
          ['SimulateV1', 'Simulate synthetic interviews'],
        ]}
      />
      <Field
        label="Purpose (maximum 4,000 characters; no transcript text)"
        value={purpose}
        onChange={change(setPurpose)}
        multiline
        disabled={disabled}
      />
      {capability === 'SimulateV1' && (
        <Check
          label="Include optional, separately confirmed analysis of this simulation in the scope"
          checked={allowAnalysis}
          onChange={change(setAllowAnalysis)}
          disabled={disabled}
        />
      )}
      <JsonDisclosure
        label="Exact scope-compilation request sent to Google"
        value={capabilityScopeRequest(request)}
      />
      <Check
        label="I authorize paid Google scope compilation using only the request shown above"
        checked={consent}
        onChange={setConsent}
        disabled={disabled}
      />
      <Button
        variant="contained"
        disabled={disabled || !consent || !purpose.trim()}
        onClick={() => onStart(request)}
      >
        Create work item and compile scope
      </Button>
    </Stack>
  );
}

function TranscriptForm({ disabled, onAdmit, invalidate }) {
  const [documents, setDocuments] = useState([newDocument()]);
  const [assignment, setAssignment] = useState(false);
  function edit(index, key, value) {
    invalidate();
    setAssignment(false);
    setDocuments((current) =>
      current.map((document, i) => (i === index ? { ...document, [key]: value } : document))
    );
  }
  async function buildCorpus() {
    let totalBytes = 0;
    const corpusDocuments = [];
    for (const document of documents) {
      const title = boundedText(document.title, 500, 'Document title');
      const participantId = boundedText(document.participantId.trim(), 120, 'Participant ID');
      const text = boundedText(document.text, 128_000, 'Transcript text');
      const bytes = new TextEncoder().encode(text);
      totalBytes += bytes.length;
      check(
        totalBytes <= 128_000,
        'All transcript text together must fit within 128,000 UTF-8 bytes.'
      );
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      corpusDocuments.push({
        documentId: crypto.randomUUID(),
        title,
        text,
        textSha256: [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(''),
        origin: 'supplied_transcript',
        originArtifactRefs: [],
        participants: [
          {
            participantId,
            displayName: document.displayName
              ? boundedText(document.displayName, 500, 'Participant name')
              : null,
            role: 'participant',
            stakeholderId: null,
          },
        ],
        turns: [
          {
            turnId: 't1',
            participantId,
            questionId: null,
            start: 0,
            end: bytes.length,
            offsetUnit: 'utf8_bytes',
          },
        ],
      });
    }
    return { schemaVersion: 'axwise.transcript-corpus.v1', documents: corpusDocuments };
  }
  return (
    <Stack spacing={2}>
      <Typography component="h3" variant="subtitle1">
        Admit supplied transcripts
      </Typography>
      <Typography variant="body2">
        Each document must contain one participant’s exact words, assigned by you. Separate speakers
        into separate documents; no automatic speaker detection or invented participants. Up to 16
        documents and 128,000 UTF-8 bytes in total.
      </Typography>
      {documents.map((document, index) => (
        <Paper variant="outlined" sx={{ p: 2 }} key={index}>
          <Stack spacing={1.5}>
            <Field
              label={`Document ${index + 1} title`}
              value={document.title}
              onChange={(value) => edit(index, 'title', value)}
              disabled={disabled}
            />
            <Field
              label={`Document ${index + 1} participant ID (maximum 120 characters)`}
              value={document.participantId}
              onChange={(value) => edit(index, 'participantId', value)}
              disabled={disabled}
            />
            <Field
              label={`Document ${index + 1} participant name (optional)`}
              value={document.displayName}
              onChange={(value) => edit(index, 'displayName', value)}
              disabled={disabled}
            />
            <Field
              label={`Document ${index + 1} exact participant transcript`}
              value={document.text}
              onChange={(value) => edit(index, 'text', value)}
              multiline
              disabled={disabled}
            />
            {documents.length > 1 && (
              <Button
                disabled={disabled}
                onClick={() => {
                  invalidate();
                  setAssignment(false);
                  setDocuments((current) => current.filter((_, i) => i !== index));
                }}
              >
                Remove document {index + 1}
              </Button>
            )}
          </Stack>
        </Paper>
      ))}
      <Button
        disabled={disabled || documents.length >= 16}
        onClick={() => {
          invalidate();
          setAssignment(false);
          setDocuments((current) => [...current, newDocument()]);
        }}
      >
        Add participant document
      </Button>
      <Check
        label="I confirm each document contains only the stated participant’s words"
        checked={assignment}
        onChange={setAssignment}
        disabled={disabled}
      />
      <Typography variant="caption">
        Admission stores the supplied source in this work item. It does not authorize Google
        processing; that requires a separate source review and confirmation below.
      </Typography>
      <Button
        variant="outlined"
        disabled={disabled || !assignment}
        onClick={() => onAdmit(buildCorpus)}
      >
        Admit supplied sources (no Google processing)
      </Button>
    </Stack>
  );
}

function AnalysisForm({ value, setValue, references, disabled }) {
  const update = (key, field) => setValue({ ...value, [key]: field });
  return (
    <Stack spacing={2}>
      <Choice
        label="Source from this work item"
        value={value.sourceId}
        onChange={(field) => update('sourceId', field)}
        disabled={disabled}
        options={[
          ['', 'Choose one immutable source'],
          ...references.map((ref) => [ref.artifactId, `${ref.kind} · ${ref.artifactId}`]),
        ]}
      />
      <Field
        label="Decision question (maximum 4,000 characters)"
        value={value.decisionQuestion}
        onChange={(field) => update('decisionQuestion', field)}
        multiline
        disabled={disabled}
      />
      {value.questions.map((question, index) => (
        <Stack spacing={1} key={index}>
          <Field
            label={`Analysis question ${index + 1} (maximum 4,000 characters)`}
            value={question}
            onChange={(field) =>
              update(
                'questions',
                value.questions.map((text, i) => (i === index ? field : text))
              )
            }
            disabled={disabled}
          />
          {value.questions.length > 1 && (
            <Button
              disabled={disabled}
              onClick={() =>
                update(
                  'questions',
                  value.questions.filter((_, i) => i !== index)
                )
              }
            >
              Remove analysis question {index + 1}
            </Button>
          )}
        </Stack>
      ))}
      <Button
        disabled={disabled || value.questions.length >= 16}
        onClick={() => update('questions', [...value.questions, ''])}
      >
        Add analysis question
      </Button>
      <Stack direction="row" flexWrap="wrap">
        <Check
          label="Jobs and pains"
          checked={value.outputs.includes('jobs_pains')}
          onChange={(checked) =>
            update(
              'outputs',
              checked
                ? [...value.outputs, 'jobs_pains']
                : value.outputs.filter((entry) => entry !== 'jobs_pains')
            )
          }
          disabled={disabled}
        />
        <Check
          label="Personas"
          checked={value.outputs.includes('personas')}
          onChange={(checked) =>
            update(
              'outputs',
              checked
                ? [...value.outputs, 'personas']
                : value.outputs.filter((entry) => entry !== 'personas')
            )
          }
          disabled={disabled}
        />
      </Stack>
      {!references.length && (
        <Alert severity="info">
          Admit supplied transcripts or complete an explicitly requested simulation in this work
          item before choosing a source.
        </Alert>
      )}
    </Stack>
  );
}

function SimulationForm({
  value,
  setValue,
  references,
  grounding,
  onLoadGrounding,
  onSelectGrounding,
  disabled,
}) {
  const update = (key, field) => setValue({ ...value, [key]: field });
  const groupUpdate = (index, key, field) =>
    update(
      'stakeholders',
      value.stakeholders.map((group, i) => (i === index ? { ...group, [key]: field } : group))
    );
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        All generated participants and responses are synthetic hypotheses, not interviews with real
        people. Geography conditions the scenario; it does not verify a person’s location.
        Personality vectors are an illustrative profile, not demographic data.
      </Alert>
      <Field
        label="Scenario description (maximum 4,000 characters)"
        value={value.description}
        onChange={(field) => update('description', field)}
        multiline
        disabled={disabled}
      />
      <Field
        label="Target audience (maximum 4,000 characters)"
        value={value.targetAudience}
        onChange={(field) => update('targetAudience', field)}
        disabled={disabled}
      />
      <Field
        label="Problem (maximum 4,000 characters)"
        value={value.problem}
        onChange={(field) => update('problem', field)}
        disabled={disabled}
      />
      {value.stakeholders.map((group, index) => (
        <Paper variant="outlined" key={index} sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Typography component="h4" variant="subtitle2">
              Stakeholder group {index + 1}
            </Typography>
            <Field
              label={`Group ${index + 1} label (maximum 500 characters)`}
              value={group.label}
              onChange={(field) => groupUpdate(index, 'label', field)}
              disabled={disabled}
            />
            <Field
              label={`Group ${index + 1} description (maximum 4,000 characters)`}
              value={group.description}
              onChange={(field) => groupUpdate(index, 'description', field)}
              multiline
              disabled={disabled}
            />
            <Field
              label={`Group ${index + 1} synthetic participant count (1–3)`}
              value={group.participantCount}
              onChange={(field) => groupUpdate(index, 'participantCount', field)}
              disabled={disabled}
              inputProps={{ inputMode: 'numeric' }}
            />
            <Field
              label={`Group ${index + 1} country code (optional, two uppercase letters)`}
              value={group.countryCode}
              onChange={(field) => groupUpdate(index, 'countryCode', field)}
              disabled={disabled}
            />
            <Field
              label={`Group ${index + 1} locality (optional; requires country)`}
              value={group.locality}
              onChange={(field) => groupUpdate(index, 'locality', field)}
              disabled={disabled}
            />
            {group.questions.map((question, questionIndex) => (
              <Stack spacing={1} key={questionIndex}>
                <Field
                  label={`Group ${index + 1} interview question ${questionIndex + 1} (maximum 1,000 characters)`}
                  value={question}
                  onChange={(field) =>
                    groupUpdate(
                      index,
                      'questions',
                      group.questions.map((text, i) => (i === questionIndex ? field : text))
                    )
                  }
                  disabled={disabled}
                />
                {group.questions.length > 1 && (
                  <Button
                    disabled={disabled}
                    onClick={() =>
                      groupUpdate(
                        index,
                        'questions',
                        group.questions.filter((_, i) => i !== questionIndex)
                      )
                    }
                  >
                    Remove group {index + 1} question {questionIndex + 1}
                  </Button>
                )}
              </Stack>
            ))}
            <Button
              disabled={disabled || group.questions.length >= 6}
              onClick={() => groupUpdate(index, 'questions', [...group.questions, ''])}
            >
              Add group {index + 1} interview question
            </Button>
            {value.stakeholders.length > 1 && (
              <Button
                disabled={disabled}
                onClick={() =>
                  update(
                    'stakeholders',
                    value.stakeholders.filter((_, i) => i !== index)
                  )
                }
              >
                Remove stakeholder group {index + 1}
              </Button>
            )}
          </Stack>
        </Paper>
      ))}
      <Button
        disabled={disabled || value.stakeholders.length >= 4}
        onClick={() => update('stakeholders', [...value.stakeholders, newStakeholder()])}
      >
        Add stakeholder group
      </Button>
      <Field
        label="Sampling seed (whole number, 0–9,007,199,254,740,991)"
        value={value.seed}
        onChange={(field) => update('seed', field)}
        disabled={disabled}
        inputProps={{ inputMode: 'numeric' }}
      />
      <Choice
        label="Response style"
        value={value.responseStyle}
        onChange={(field) => update('responseStyle', field)}
        options={['realistic', 'optimistic', 'critical', 'mixed'].map((entry) => [entry, entry])}
        disabled={disabled}
      />
      <Typography variant="body2">
        Grounding:{' '}
        {grounding.selected.length
          ? `${grounding.selected.length} explicitly selected analysis quotes`
          : 'scenario only; no source passages selected'}
        .
      </Typography>
      {references.length > 0 && (
        <Typography variant="caption">
          Select at most 16 quotes across 4 analysis artifacts, totaling at most 32,000 UTF-8 bytes.
        </Typography>
      )}
      {references.map((ref) => (
        <Stack key={ref.artifactId} spacing={1}>
          <Button disabled={disabled} onClick={() => onLoadGrounding(ref)}>
            Review grounding quotes from {ref.artifactId}
          </Button>
          {grounding.loaded[ref.artifactId]?.map((quote) => (
            <Box key={quote.quoteId}>
              <Check
                label={`Use quote ${quote.quoteId}`}
                checked={grounding.selected.some(
                  (entry) =>
                    entry.artifact.artifactId === ref.artifactId && entry.entryId === quote.quoteId
                )}
                onChange={(checked) => onSelectGrounding(ref, quote.quoteId, checked)}
                disabled={
                  disabled ||
                  (grounding.selected.length >= 16 &&
                    !grounding.selected.some(
                      (entry) =>
                        entry.artifact.artifactId === ref.artifactId &&
                        entry.entryId === quote.quoteId
                    ))
                }
              />
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {quote.text}
              </Typography>
            </Box>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

function ProcessingReview({ review, consent, onConsent, disabled, onConfirm }) {
  return (
    <Stack spacing={2}>
      <Typography component="h3" variant="h6">
        Review exact Google processing payload
      </Typography>
      <Alert severity="warning">
        This is paid processing by Google. Only confirm if the accepted scope permits this operation
        and you authorize processing every selected source and the request below. Simulation remains
        synthetic. Google receives the reviewed payload once for token counting and at most once for
        generation. Token counting sends the data even if generation is rejected. Free text is not
        automatically anonymized.
      </Alert>
      <JsonDisclosure label="Exact data sent to Google" value={review.providerPayload} />
      <JsonDisclosure label="Processing limitations" value={review.limitations} />
      <Typography component="h4" variant="subtitle2">
        Review metadata (not additional provider fields)
      </Typography>
      <JsonDisclosure label="Accepted scope reference" value={review.acceptedScope} />
      {review.selectedSources.map((source) => (
        <Stack spacing={1} key={source.artifact.artifactId}>
          <JsonDisclosure
            label={`Selected source: ${source.title}`}
            value={exactRef(source.artifact)}
          />
          {source.documents?.map((document) => (
            <Typography
              component="h4"
              variant="subtitle2"
              key={document.documentId}
            >{`Source document: ${document.title} (${document.origin})`}</Typography>
          ))}
          {source.passages?.map((passage) => (
            <JsonDisclosure
              key={passage.entryId}
              label={`Selected grounding passage ${passage.entryId}`}
              value={{ entryId: passage.entryId }}
            />
          ))}
        </Stack>
      ))}
      {!review.selectedSources.length && (
        <Typography variant="body2">
          No source artifact content will be sent; this is a scenario-only simulation.
        </Typography>
      )}
      <JsonDisclosure
        label="Processing limits"
        value={Object.fromEntries(
          ['deadlineMs', 'maxModelCalls', 'maxInputTokens', 'maxOutputTokens'].map((key) => [
            key,
            review.limits[key],
          ])
        )}
      />
      <Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>
        Run {review.runId} · Version {review.expectedRowVersion} · Operation {review.operationId} ·
        Review {review.reviewId} · Binding {review.bindingHash} · Notice {review.noticeVersion}
      </Typography>
      <Check
        label="I confirm scope compatibility and authorize paid Google processing of this exact reviewed payload"
        checked={consent}
        onChange={onConsent}
        disabled={disabled}
      />
      <Button variant="contained" disabled={disabled || !consent} onClick={onConfirm}>
        Confirm and run with Google
      </Button>
    </Stack>
  );
}

function CapabilitySession({ client, workflow, onWorkflow, ownerUserId, busy, onRefresh }) {
  const run = workflow?.run;
  const scope = scopeReference(workflow);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [scopePayload, setScopePayload] = useState(null);
  const [scopeCompatible, setScopeCompatible] = useState(false);
  const [operation, setOperation] = useState(run?.workProfile.capability ?? 'AnalyzeEvidenceV1');
  const [analysis, setAnalysis] = useState({
    sourceId: '',
    decisionQuestion: '',
    questions: [''],
    outputs: ['jobs_pains', 'personas'],
  });
  const [simulation, setSimulation] = useState({
    description: '',
    targetAudience: '',
    problem: '',
    stakeholders: [newStakeholder()],
    seed: '0',
    responseStyle: 'realistic',
  });
  const [grounding, setGrounding] = useState({ loaded: {}, selected: [] });
  const [prepared, setPrepared] = useState(null);
  const [consent, setConsent] = useState(false);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const editVersion = useRef(0);
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const current = () => alive.current;
  const disabled = busy || pending || uncertain || submitted;
  const writable = !!scope && WRITABLE.has(run?.status);
  const sourceRefs = eligibleArtifacts(
    workflow,
    run?.workProfile.capability === 'SimulateV1' ? ['simulation'] : ['transcript_corpus']
  );
  const analysisRefs = run?.workProfile.allowSimulationAnalysis
    ? eligibleArtifacts(workflow, ['qualitative_analysis'])
    : [];
  function invalidate() {
    editVersion.current += 1;
    setPrepared(null);
    setConsent(false);
    setError('');
  }
  function acceptWorkflow(response) {
    const next = response?.workflow;
    check(
      next &&
        isCapabilityWork(next.run) &&
        next.run.ownerUserId === ownerUserId &&
        (!run || (next.run.id === run.id && next.run.rowVersion >= run.rowVersion)),
      'The returned work item identity did not match.'
    );
    onWorkflow(next);
  }
  async function perform(
    action,
    {
      mutation = false,
      preserveReview = false,
      failure = 'This action could not be completed. Review the inputs and try again.',
    } = {}
  ) {
    if (!current() || busy || inFlight.current || (mutation && (uncertain || submitted))) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    if (!preserveReview) {
      setPrepared(null);
      setConsent(false);
    }
    const version = editVersion.current;
    const stillCurrent = () => current() && version === editVersion.current;
    let sent = false;
    try {
      await action({
        stillCurrent,
        markSent: () => {
          check(stillCurrent(), 'Inputs changed before submission.');
          sent = true;
        },
      });
      if (mutation && sent && current()) setSubmitted(true);
    } catch {
      if (current()) {
        if (mutation && sent) {
          setUncertain(true);
          setPrepared(null);
          setConsent(false);
          setError(
            run
              ? 'Submission status is unknown. Refresh this work item before preparing any new operation. No automatic retry will run.'
              : 'Submission status is unknown. Reload the work-item list and open the created capability item before taking another action. No automatic retry will run.'
          );
        } else if (stillCurrent()) setError(failure);
      }
    } finally {
      inFlight.current = false;
      if (current()) setPending(false);
    }
  }
  function start(request) {
    return perform(
      async ({ stillCurrent, markSent }) => {
        const command = {
          ...commandIdentity(),
          ...request,
          request: boundedText(request.request.trim(), 4000, 'Purpose'),
          compilerDisclosure: { accepted: true, noticeVersion: CAPABILITY_COMPILER_NOTICE },
        };
        markSent();
        const response = await client.startCapabilityWork(command);
        if (stillCurrent()) acceptWorkflow(response);
      },
      { mutation: true }
    );
  }
  function draftOperation() {
    check(writable, 'This work item is not ready for a capability operation.');
    const base = {
      ...commandIdentity(),
      expectedRowVersion: run.rowVersion,
      operationType: operation,
    };
    if (operation === 'AnalyzeEvidenceV1') {
      const sourceArtifact = sourceRefs.find((ref) => ref.artifactId === analysis.sourceId);
      check(
        sourceArtifact && analysis.outputs.length > 0,
        'Choose a source and at least one output.'
      );
      return {
        ...base,
        sourceArtifact,
        request: {
          decisionQuestion: boundedText(analysis.decisionQuestion, 4000, 'Decision question'),
          questions: analysis.questions.map((text, index) => ({
            id: `analysis-q${index + 1}`,
            text: boundedText(text, 4000, 'Analysis question'),
          })),
          outputs: [...analysis.outputs],
          analysisProfile: 'qualitative_v1',
        },
      };
    }
    const stakeholders = simulation.stakeholders.map((group, index) => {
      check(
        !group.countryCode || /^[A-Z]{2}$/.test(group.countryCode),
        'Country codes must contain two uppercase letters.'
      );
      check(!group.locality || group.countryCode, 'Locality requires a country code.');
      return {
        stakeholderId: `stakeholder-${index + 1}`,
        label: boundedText(group.label, 500, 'Stakeholder label'),
        description: boundedText(group.description, 4000, 'Stakeholder description'),
        participantCount: boundedInteger(group.participantCount, 1, 3, 'Participant count'),
        countryCode: group.countryCode || null,
        locality: group.locality ? boundedText(group.locality, 500, 'Locality') : null,
        questions: group.questions.map((text, i) => ({
          questionId: `interview-q${i + 1}`,
          text: boundedText(text, 1000, 'Interview question'),
        })),
      };
    });
    const selectedGrounding = grounding.selected.map((selection) => ({
      ...selection,
      artifact: exactRef(selection.artifact),
    }));
    const sourceArtifacts = [
      ...new Map(
        selectedGrounding.map((entry) => [entry.artifact.artifactId, entry.artifact])
      ).values(),
    ];
    check(
      sourceArtifacts.length <= 4 && selectedGrounding.length <= 16,
      'Grounding is limited to 16 quotes across 4 artifacts.'
    );
    const groundingBytes = selectedGrounding.reduce((total, entry) => {
      const quote = grounding.loaded[entry.artifact.artifactId]?.find(
        (item) => item.quoteId === entry.entryId
      );
      check(quote, 'A selected grounding quote is not loaded.');
      return total + new TextEncoder().encode(quote.text).length;
    }, 0);
    check(groundingBytes <= 32_000, 'Selected grounding exceeds 32,000 UTF-8 bytes.');
    return {
      ...base,
      selectedGrounding,
      request: {
        requested: true,
        scenario: {
          id: 'owner-scenario',
          description: boundedText(simulation.description, 4000, 'Scenario'),
          targetAudience: boundedText(simulation.targetAudience, 4000, 'Target audience'),
          problem: boundedText(simulation.problem, 4000, 'Problem'),
        },
        stakeholders,
        grounding: {
          mode: sourceArtifacts.length ? 'source_grounded' : 'scenario_only',
          sourceArtifacts,
        },
        sampling: {
          seed: boundedInteger(simulation.seed, 0, Number.MAX_SAFE_INTEGER, 'Sampling seed'),
          profileVersion: 'hash_uniform_v1',
        },
        responseStyle: simulation.responseStyle,
        generationProfile: 'bounded_v1',
      },
    };
  }
  function prepare() {
    return perform(
      async ({ stillCurrent }) => {
        const draft = draftOperation();
        const response = await client.prepareCapabilityOperation(run.id, draft);
        if (!stillCurrent()) return;
        const review = await verifyReview(response?.review, draft, run.id, scope, grounding.loaded);
        if (!stillCurrent()) return;
        setPrepared({ draft, review });
        setConsent(false);
      },
      {
        failure:
          'A matching processing review could not be prepared. Check every required field, selected source, bounds, and current work-item version.',
      }
    );
  }
  function confirm() {
    if (!prepared || !consent || !writable || disabled) return;
    const { draft, review } = prepared;
    return perform(
      async ({ stillCurrent, markSent }) => {
        await verifyReview(review, draft, run.id, scope, grounding.loaded);
        markSent();
        const response = await client.confirmCapabilityOperation(run.id, {
          draft,
          confirmation: {
            granted: true,
            provider: review.provider,
            purpose: review.purpose,
            operationId: review.operationId,
            bindingHash: review.bindingHash,
            reviewId: review.reviewId,
            noticeVersion: review.noticeVersion,
            scopeCompatible: true,
          },
        });
        if (stillCurrent()) acceptWorkflow(response);
      },
      { mutation: true }
    );
  }
  return (
    <Stack spacing={3}>
      {pending && <LinearProgress aria-label="Working on the explicit request" />}
      {error && <Alert severity="warning">{error}</Alert>}
      {submitted && (
        <Alert severity="info">
          Request submitted. Refresh to see current state; previous outputs remain available.
        </Alert>
      )}
      {!run ? (
        <StartForm
          disabled={disabled}
          onStart={(command) => start(command)}
          invalidate={invalidate}
        />
      ) : (
        <>
          <Typography component="h2" variant="h6">
            {capabilityLabel(run.workProfile.capability)}
          </Typography>
          <Typography variant="body2">{run.workProfile.purpose}</Typography>
          <Typography variant="caption">
            Work item {run.id} · Version {run.rowVersion} · {run.status}
          </Typography>
          <Button
            disabled={busy || pending}
            onClick={() =>
              perform(
                async ({ stillCurrent }) => {
                  const response = await client.read(run.id);
                  if (stillCurrent()) {
                    acceptWorkflow(response);
                    onRefresh();
                  }
                },
                {
                  failure:
                    'The current work item could not be refreshed. No operation was retried.',
                }
              )
            }
          >
            Refresh work item
          </Button>
          {!writable && run.status !== 'awaiting_gate_1' && (
            <Alert severity="info">
              This work item is not accepting new capability inputs while its current request is in
              progress.
            </Alert>
          )}
          {scope && (
            <Stack spacing={2}>
              <Button
                disabled={disabled}
                onClick={() =>
                  perform(
                    async ({ stillCurrent }) => {
                      const response = await client.artifact(run.id, scope.artifactId);
                      if (stillCurrent()) {
                        setScopePayload(verifyArtifact(response, scope, run.id));
                        setScopeCompatible(false);
                      }
                    },
                    {
                      failure:
                        'The exact compiled scope could not be loaded. Its identity must match this work item.',
                    }
                  )
                }
              >
                Review compiled scope
              </Button>
              {scopePayload && (
                <JsonDisclosure label="Compiled scope for owner review" value={scopePayload} />
              )}
              {scopePayload &&
                run.status === 'awaiting_gate_1' &&
                workflow.stages.some(
                  (stage) => stage.kind === 'gate_1' && stage.status === 'awaiting_approval'
                ) && (
                  <>
                    <Check
                      label="I reviewed this scope and confirm it permits the requested capability"
                      checked={scopeCompatible}
                      onChange={setScopeCompatible}
                      disabled={disabled}
                    />
                    <Button
                      variant="contained"
                      disabled={disabled || !scopeCompatible}
                      onClick={() =>
                        perform(
                          async ({ stillCurrent, markSent }) => {
                            const command = {
                              ...commandIdentity(),
                              artifact: scope,
                              scopeCompatible: true,
                            };
                            markSent();
                            const response = await client.approveCapabilityScope(run.id, command);
                            if (stillCurrent()) acceptWorkflow(response);
                          },
                          { mutation: true }
                        )
                      }
                    >
                      Approve compatible scope
                    </Button>
                  </>
                )}
            </Stack>
          )}
          {writable && (
            <>
              {run.workProfile.capability === 'AnalyzeEvidenceV1' && (
                <TranscriptForm
                  disabled={disabled}
                  invalidate={invalidate}
                  onAdmit={(buildCorpus) =>
                    perform(
                      async ({ stillCurrent, markSent }) => {
                        const corpus = await buildCorpus();
                        if (!stillCurrent()) return;
                        const command = {
                          ...commandIdentity(),
                          expectedRowVersion: run.rowVersion,
                          corpus,
                        };
                        markSent();
                        const response = await client.admitCapabilityCorpus(run.id, command);
                        if (stillCurrent()) acceptWorkflow(response);
                      },
                      {
                        mutation: true,
                        failure:
                          'Sources were not submitted. Check document titles, explicit participant IDs, exact text, and the 128,000-byte total limit.',
                      }
                    )
                  }
                />
              )}
              <Typography component="h3" variant="h6">
                Prepare a new capability operation
              </Typography>
              {run.workProfile.capability === 'SimulateV1' &&
                run.workProfile.allowSimulationAnalysis && (
                  <Choice
                    label="Operation"
                    value={operation}
                    onChange={(value) => {
                      invalidate();
                      setOperation(value);
                    }}
                    options={[
                      ['SimulateV1', 'Run a synthetic simulation'],
                      ['AnalyzeEvidenceV1', 'Analyze this work item’s simulation'],
                    ]}
                    disabled={disabled}
                  />
                )}
              {operation === 'AnalyzeEvidenceV1' ? (
                <AnalysisForm
                  value={analysis}
                  setValue={(value) => {
                    invalidate();
                    setAnalysis(value);
                  }}
                  references={
                    run.workProfile.capability === 'SimulateV1'
                      ? sourceRefs.filter((ref) => ref.kind === 'simulation')
                      : sourceRefs
                  }
                  disabled={disabled}
                />
              ) : (
                <SimulationForm
                  value={simulation}
                  setValue={(value) => {
                    invalidate();
                    setSimulation(value);
                  }}
                  references={analysisRefs}
                  grounding={grounding}
                  disabled={disabled}
                  onLoadGrounding={(reference) =>
                    perform(
                      async ({ stillCurrent }) => {
                        const response = await client.artifact(run.id, reference.artifactId);
                        if (!stillCurrent()) return;
                        const payload = verifyArtifact(response, reference, run.id);
                        check(
                          payload.schemaVersion === 'axwise.qualitative-analysis.v1' &&
                            sameRef(payload.acceptedScope, scope) &&
                            Array.isArray(payload.quotes) &&
                            payload.quotes.length <= 256 &&
                            payload.quotes.every(
                              (quote) => HASH.test(quote.quoteId) && typeof quote.text === 'string'
                            ),
                          'Grounding quotes are not valid.'
                        );
                        setGrounding((value) => ({
                          ...value,
                          loaded: {
                            ...value.loaded,
                            [reference.artifactId]: payload.quotes.map(({ quoteId, text }) => ({
                              quoteId,
                              text,
                            })),
                          },
                        }));
                      },
                      { failure: 'The exact same-work-item analysis quotes could not be loaded.' }
                    )
                  }
                  onSelectGrounding={(reference, entryId, checked) => {
                    invalidate();
                    setGrounding((value) => ({
                      ...value,
                      selected: checked
                        ? [...value.selected, { artifact: reference, entryKind: 'quote', entryId }]
                        : value.selected.filter(
                            (entry) =>
                              !(
                                entry.artifact.artifactId === reference.artifactId &&
                                entry.entryId === entryId
                              )
                          ),
                    }));
                  }}
                />
              )}
              <Button variant="outlined" disabled={disabled} onClick={prepare}>
                Prepare exact processing review (no Google call)
              </Button>
              {prepared && (
                <ProcessingReview
                  review={prepared.review}
                  consent={consent}
                  onConsent={setConsent}
                  disabled={disabled}
                  onConfirm={confirm}
                />
              )}
            </>
          )}
        </>
      )}
    </Stack>
  );
}

export function CapabilityWorkPanel({
  client,
  workflow = null,
  onWorkflow,
  authScopeKey,
  ownerUserId,
  busy = false,
}) {
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const [clientIdentity, setClientIdentity] = useState({ client, epoch: 0 });
  // Reset all source bytes, selected passages, drafts and checkboxes together.
  // Layout-effect cleanup rejects stale promises in the same commit that hides content.
  const context = JSON.stringify([
    authScopeKey,
    ownerUserId,
    refreshEpoch,
    workflow?.run,
    workflow?.stages?.map(({ id, kind, status, rowVersion, outputArtifact }) => ({
      id,
      kind,
      status,
      rowVersion,
      outputArtifact,
    })),
  ]);
  if (clientIdentity.client !== client) {
    setClientIdentity({ client, epoch: clientIdentity.epoch + 1 });
    return null;
  }
  if (!authScopeKey || !ownerUserId || !client || typeof onWorkflow !== 'function')
    return (
      <Alert severity="info">
        Sign in as the work-item owner to request analysis or simulation.
      </Alert>
    );
  if (
    workflow &&
    (!isCapabilityWork(workflow.run) ||
      workflow.run.ownerUserId !== ownerUserId ||
      !UUID.test(workflow.run.id) ||
      !Number.isSafeInteger(workflow.run.rowVersion) ||
      workflow.run.rowVersion < 0)
  )
    return (
      <Alert severity="info">
        This panel only accepts a new capability work item owned by the signed-in user. Existing
        Goals are read-only here.
      </Alert>
    );
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, md: 3 },
        '& .MuiButton-root': { whiteSpace: 'normal', overflowWrap: 'anywhere', maxWidth: '100%' },
        '& .MuiFormControlLabel-label': { overflowWrap: 'anywhere' },
      }}
    >
      <CapabilitySession
        key={`${clientIdentity.epoch}:${context}`}
        client={client}
        workflow={workflow}
        onWorkflow={onWorkflow}
        ownerUserId={ownerUserId}
        busy={busy}
        onRefresh={() => setRefreshEpoch((value) => value + 1)}
      />
    </Paper>
  );
}
