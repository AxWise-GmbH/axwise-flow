const NATIVE_SCOPE_PACKET_VERSION = 'axwise_scope_packet_v1';
const NATIVE_SCOPE_VALIDATION_VERSION = 'axwise_scope_validation_v1';

function scopeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function scopeToken(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).trim();
  return normalized || null;
}

/**
 * Detect durable native-scope state without trusting the packet being valid.
 *
 * A missing or corrupted packet is exactly when downstream consumers must not
 * reinterpret a native goal as legacy. These markers are written only by the
 * native AxWise lifecycle and therefore keep Gate 1 and later authority
 * boundaries fail-closed while the canonical packet is repaired.
 */
export function hasNativeAxwiseScopeMarkers(goal) {
  const data = goal?.data || {};
  const intelligence = data.axwise_customer_intelligence || {};
  const packetVersion = scopeText(intelligence.scope_packet?.version);
  const approvedNativeContract =
    data.goal_approvals?.context?.snapshot?.native_scope_contract || null;
  const previousNativeContract = intelligence.previous_scope_contract || null;
  const smartRequestAdmission = data.smart_request_admission || null;
  // `scope_packet` is a native-only field. Its presence remains authoritative
  // even when the packet's own version is malformed; otherwise corruption
  // could downgrade the row into the raw legacy planner.
  const nativePacketPresent = intelligence.scope_packet != null;
  // Both fields are native-only durable lifecycle records. Their internal
  // identity may itself be partially damaged, which is exactly when presence
  // must keep the row fail-closed instead of making detection depend on a
  // surviving hash/version field.
  const approvedNativeMarker = approvedNativeContract != null;
  const previousNativeMarker = previousNativeContract != null;
  // Before the explicit `scope_admission.native_scope` discriminator shipped,
  // started Smart Requests already persisted this admission record. Preserve
  // those in-flight rows across deploys without reviving the ambiguous legacy
  // scope-admission state key. `started_at` also survives enqueue_failed.
  const smartRequestAdmissionStatus = scopeText(smartRequestAdmission?.status);
  const startedSmartRequestMarker = Boolean(
    smartRequestAdmission &&
    (scopeToken(smartRequestAdmission.started_at) ||
      (smartRequestAdmissionStatus && smartRequestAdmissionStatus !== 'draft'))
  );

  return Boolean(
    nativePacketPresent ||
    intelligence.clarification_scope != null ||
    packetVersion === NATIVE_SCOPE_PACKET_VERSION ||
    packetVersion.startsWith('axwise_scope_packet_') ||
    data.scope_admission?.native_scope === true ||
    data.scope_revision != null ||
    startedSmartRequestMarker ||
    intelligence.scope_validation != null ||
    intelligence.axwise_scope_confirmation != null ||
    data.work_shape_route?.authoritative_scope === true ||
    approvedNativeMarker ||
    previousNativeMarker ||
    data.native_planning_attempt != null ||
    data.native_team_formation_attempt != null ||
    data.native_tool_provisioning_attempt != null ||
    data.native_discovery_estimation_attempt != null
  );
}

/**
 * Immutable identity carried by every native Gate-1 human/automatic action.
 *
 * The pending approval snapshot is already a canonical digest of the complete
 * reviewable context. Scope hash, generation and AxWise update time make the
 * binding independently inspectable and ensure that even a repeated packet
 * hash from a newer provider generation cannot inherit an older click.
 */
export function nativeAxwiseScopeActionBinding(goal) {
  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  const packet = intelligence.scope_packet;
  if (packet?.version !== NATIVE_SCOPE_PACKET_VERSION) return null;

  return {
    version: 'orqaly_native_scope_action_binding_v1',
    org_id: scopeToken(goal?.org_id),
    user_id: scopeToken(goal?.user_id),
    scope_hash: scopeToken(packet.scope_hash),
    research_contract_hash: scopeToken(packet.research_contract?.contract_hash),
    research_execution_inputs_hash: scopeToken(intelligence.research_execution_inputs_hash),
    generation: scopeToken(intelligence.generation),
    scope_updated_at: scopeToken(intelligence.updated_at),
    context_snapshot_hash: scopeToken(goal?.data?.goal_approvals?.context?.snapshot_hash),
  };
}

/** Native actions fail closed unless every immutable identity field matches. */
export function nativeAxwiseScopeActionBindingMatches(goal, submitted) {
  const expected = nativeAxwiseScopeActionBinding(goal);
  if (!expected) return !hasNativeAxwiseScopeMarkers(goal);
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) return false;
  if (
    !expected.scope_hash ||
    !expected.org_id ||
    !expected.user_id ||
    !expected.research_contract_hash ||
    !expected.research_execution_inputs_hash ||
    !expected.scope_updated_at ||
    !expected.context_snapshot_hash
  ) {
    return false;
  }

  return (
    submitted.version === expected.version &&
    scopeToken(submitted.org_id) === expected.org_id &&
    scopeToken(submitted.user_id) === expected.user_id &&
    scopeToken(submitted.scope_hash) === expected.scope_hash &&
    scopeToken(submitted.research_contract_hash) === expected.research_contract_hash &&
    scopeToken(submitted.research_execution_inputs_hash) ===
      expected.research_execution_inputs_hash &&
    scopeToken(submitted.generation) === expected.generation &&
    scopeToken(submitted.scope_updated_at) === expected.scope_updated_at &&
    scopeToken(submitted.context_snapshot_hash) === expected.context_snapshot_hash
  );
}

/**
 * Return the reason a canonical native AxWise scope cannot be approved yet.
 *
 * Legacy scopes and Orqaly fallback context deliberately return null. Once a
 * native lifecycle marker is present, however, approval must fail closed
 * unless its packet, validation, and confirmation are hash-bound and
 * synthesis-ready. A material question is returned verbatim so every UI can
 * present the provider's one canonical question instead of manufacturing
 * another questionnaire.
 */
export function nativeAxwiseScopeApprovalBlock(goal) {
  const revision = goal?.data?.scope_revision || {};
  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  const packet = intelligence.scope_packet;
  if (!hasNativeAxwiseScopeMarkers(goal)) return null;

  if (revision.status === 'pending_rebuild') {
    return {
      code: 'native_scope_revision_pending',
      message: 'The requested AxWise scope revision must be rebuilt before approval.',
      materialQuestion: null,
    };
  }

  const validation = intelligence.scope_validation || {};
  const confirmation = intelligence.axwise_scope_confirmation || {};
  const packetHash = scopeText(packet?.scope_hash);
  const question = scopeText(confirmation.material_question);
  const nativeIdentityValid =
    packet?.version === NATIVE_SCOPE_PACKET_VERSION &&
    validation.version === NATIVE_SCOPE_VALIDATION_VERSION &&
    Boolean(packetHash) &&
    scopeText(validation.scope_hash) === packetHash &&
    scopeText(confirmation.scope_hash) === packetHash &&
    validation.valid === true;
  const materialInputRequired =
    nativeIdentityValid &&
    validation.ready_for_synthesis === false &&
    confirmation.status === 'needs_material_input' &&
    confirmation.primary_action === 'answer' &&
    Boolean(question);

  if (materialInputRequired) {
    return {
      code: 'native_scope_material_input_required',
      message: 'AxWise needs one material answer before this scope can be approved.',
      materialQuestion: question,
    };
  }

  const validationReady = nativeIdentityValid && validation.ready_for_synthesis === true;
  const confirmationReady =
    confirmation.status === 'proceed_or_edit' &&
    confirmation.primary_action === 'proceed' &&
    scopeText(confirmation.scope_hash) === packetHash;

  if (!validationReady || !confirmationReady) {
    return {
      code: 'native_scope_not_ready',
      message: 'The native AxWise scope is invalid or not ready for synthesis.',
      materialQuestion: null,
    };
  }

  return null;
}

export function nativeAxwiseMaterialQuestion(goal) {
  return nativeAxwiseScopeApprovalBlock(goal)?.materialQuestion || null;
}
