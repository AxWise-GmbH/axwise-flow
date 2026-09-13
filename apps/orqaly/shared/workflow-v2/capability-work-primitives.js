// Browser-safe labels and deterministic compiler disclosure. No provider calls,
// authentication, source access, schema library, or execution authority here.
export const CAPABILITY_WORK_PROFILE = 'capability_work_v1';
export const CAPABILITY_COMPILER_NOTICE = 'google-scope-compiler-v1';
export const CAPABILITY_PROCESSING_NOTICE = 'google-selected-sources-v1';
export const CAPABILITY_OPERATION_TYPES = Object.freeze(['AnalyzeEvidenceV1', 'SimulateV1']);

export function isCapabilityWork(run) {
  return run?.workProfile?.type === CAPABILITY_WORK_PROFILE;
}

export function capabilityLabel(type) {
  return type === 'AnalyzeEvidenceV1' ? 'Analyze sources' : 'Run a simulation';
}

export function capabilityReviewLimitations(type, groundingMode = 'scenario_only') {
  const processing = [
    'Google receives this reviewed payload once for token counting and at most once for generation, together with fixed task instructions and the candidate schema.',
    'Token counting transmits the selected data even if the prompt is then rejected. There are no automatic generation retries or fallback providers.',
    'Free text is not automatically anonymized. Review it before consenting; usage or cost can remain unknown when Google does not supply a complete receipt.',
  ];
  if (type === 'AnalyzeEvidenceV1')
    return [
      ...processing,
      'Supplied transcripts are acquisition metadata, not proof of human testimony or authenticity.',
      'Synthetic source material remains synthetic; derived findings are hypotheses, not observed customer facts.',
    ];
  return [
    ...processing,
    'All participants and responses are synthetic, not human testimony.',
    'Sampling is reproducible; model-generated text is not guaranteed to repeat.',
    'This cohort does not establish population prevalence, customer demand or predictive accuracy.',
    'Personality vectors use a versioned illustrative uniform profile, not measured population traits.',
    groundingMode === 'source_grounded'
      ? 'Grounding records selected source passages; it does not verify simulated responses as real-world facts.'
      : 'No external grounding was requested or applied.',
  ];
}

export function capabilityScopeRequest({ capability, request, allowSimulationAnalysis }) {
  const purpose = String(request ?? '').trim();
  const action =
    capability === 'AnalyzeEvidenceV1'
      ? 'Qualitatively analyze only transcripts explicitly supplied and selected by the owner.'
      : 'Generate a bounded synthetic interview simulation, clearly labeled as synthetic.';
  const continuation =
    capability === 'SimulateV1' && allowSimulationAnalysis === true
      ? 'The owner may separately request qualitative analysis of these simulation outputs in this same work item, with new review and processing consent.'
      : 'No other capability is included in this scope.';
  return [
    'Explicit capability work. Compile a scope for owner review; do not execute this request.',
    action,
    continuation,
    'No web research, PRD, implementation plan, or deployment is requested.',
    'Transcript bytes are not part of this scope-compilation request. Each paid capability requires a separate, exact-input owner confirmation.',
    '',
    'Owner purpose:',
    purpose,
  ].join('\n');
}
