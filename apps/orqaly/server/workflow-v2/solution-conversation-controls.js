const statuses = new Set([
  'draft',
  'reviewed',
  'approved',
  'deploying',
  'deployment_unknown',
  'ready',
  'active',
  'paused',
  'rejected',
  'superseded',
  'failed',
]);

// Explanation data only, never an authorization decision or executable action.
export function conversationControlState({
  selected,
  isDraft = false,
  coverage = null,
  unresolved = false,
} = {}) {
  const status = statuses.has(selected?.status) ? selected.status : 'unknown';
  const version =
    Number.isSafeInteger(selected?.version) && selected.version > 0 ? selected.version : null;
  const deployed = !!selected?.deployment;
  const unknown =
    unresolved ||
    ['deploying', 'deployment_unknown'].includes(status) ||
    !!selected?.last_error?.includes('VERIFICATION');
  let nextControl = null;
  if (!unknown) {
    if (status === 'draft') nextControl = 'Review changes';
    else if (status === 'reviewed')
      nextControl =
        selected?.review?.valid === true && version ? `Approve v${version}` : 'Review changes';
    else if (status === 'approved') nextControl = 'Deploy approved version';
    else if (status === 'ready' && deployed)
      nextControl =
        coverage === true && selected?.tested_at && version
          ? `Activate v${version}`
          : 'Test all agreed cases';
  }
  return {
    kind: selected ? (isDraft ? 'selected_draft' : 'current_release') : 'unknown',
    revisionId: isDraft ? (selected?.id ?? null) : (selected?.revision_id ?? null),
    version,
    status,
    workflowHash: selected?.workflow_hash ?? null,
    reviewValid: typeof selected?.review?.valid === 'boolean' ? selected.review.valid : null,
    approved: !!selected?.approved_at && !['draft', 'reviewed'].includes(status),
    deployment: unknown ? 'unknown' : deployed ? 'deployed' : 'not_deployed',
    testCoverage: {
      status: unknown
        ? 'unknown'
        : coverage === true
          ? 'verified'
          : coverage === false
            ? 'missing'
            : 'not_checked',
      testedAt: selected?.tested_at ?? null,
      agreedCaseCount: selected?.spec?.acceptanceCases?.length ?? null,
    },
    unresolvedOutcome: unknown,
    nextControl,
    nextControlAvailability: 'check_current_orqaly_controls_and_setup_gates',
    nextControlIsAuthorization: false,
  };
}

export const conversationControlGuidance = [
  'Orqaly customer-control rules (server-owned): Explain the selected version in customerControls, not the live Solution status when a draft is selected. Missing evidence is unknown, never approval or test success.',
  'For an unapproved revision use the existing Orqaly controls in order: Review changes, Approve vN, Deploy approved version (stages it inactive), then Test all agreed cases. Replace N only with the supplied version. Review or approval is not deployment; deployment is not test success. Tests use the agreed cases and require explicit approval for external effects.',
  'Activate vN is a separate explicit customer decision after exact-version acceptance coverage and all runtime/setup gates pass. A test timestamp alone is not proof that every agreed case passed. Unknown outcomes or pending deployment require verification, never a fresh retry or activation. customerControls describes persisted state, not permission to bypass disabled controls. Deployment metadata alone does not prove whether n8n is currently published; paused describes the Orqaly production-call gate, not proof that every provider trigger was unpublished.',
  'Do not tell the customer to send requests directly to a native draft webhook, n8n test/production path, private runtime host or generated workflow identifier. These are internal managed transport, not customer invocation URLs. Use Orqaly’s controls for testing. External application calls require the separately configured application-access endpoint and key shown by Orqaly for an active release; never invent either.',
  'Missing connections must be handled with Set up required connections, never credentials in chat. When editing n8n, wait for Saved and use Review saved changes. Do not claim an explanation performs any action. Keep next-step advice concise and relevant to the actual selected state.',
].join('\n');

export function explanationNodeParameters(node) {
  if (node.type !== 'n8n-nodes-base.webhook') return node.parameters;
  const parameters = { ...node.parameters };
  delete parameters.path;
  return parameters;
}
