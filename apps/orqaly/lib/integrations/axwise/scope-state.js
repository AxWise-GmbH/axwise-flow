/**
 * Exact Orqaly cognitive-state projection for AxWise ScopeStateV1.
 *
 * This module intentionally has no provider or persistence dependency. The
 * caller supplies the already CAS-validated owner scope context.
 */
import { validateNativeAxwiseDecisionContracts } from '../../agent-handlers/compact-agent-contracts.js';
import { hasNativeAxwiseScopeMarkers } from '../../_shared/native-scope-approval.js';
import { resolveNativeScopeRevisionBase } from '../../_shared/native-goal-authority.js';

function contractText(value, depth = 0) {
  if (value == null) return '';
  if (typeof value === 'string') {
    const result = value.trim();
    return /^(?:null|undefined|\[object object\])$/i.test(result) ? '' : result;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => contractText(item, depth + 1))
      .filter(Boolean)
      .join('; ');
  }
  if (typeof value === 'object' && depth < 4) {
    return Object.entries(value)
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, item]) => {
        const rendered = contractText(item, depth + 1);
        return rendered ? `${key.replaceAll('_', ' ')}: ${rendered}` : '';
      })
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

function unique(values) {
  const list = Array.isArray(values) ? values : values == null ? [] : [values];
  return [
    ...new Set(
      list
        .filter(Boolean)
        .map((value) => contractText(value))
        .filter(Boolean)
    ),
  ];
}

function contractList(value, maximum = 100) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return unique(values).slice(0, maximum);
}

const SCOPE_REQUIREMENT_TEXT_LIMIT = 4000;
const SCOPE_OWNER_REQUEST_TEXT_LIMIT = 7800;
const BEGINNING_REQUEST_MARKER = '[BEGINNING OF BOUNDED OWNER REQUEST]\n';
const END_REQUEST_MARKER = '[END OF BOUNDED OWNER REQUEST]\n';

/**
 * Preserve both ends of a long owner request without increasing the existing
 * AxWise disclosure envelope. The old projection sent up to 4k from both
 * description and parsed_requirements, which were usually duplicate prefixes.
 * These two bounded windows use the same approximate volume while retaining
 * late exclusions and output requirements.
 */
function boundedRequestWindows(value, sourceRef, maximumText = SCOPE_OWNER_REQUEST_TEXT_LIMIT) {
  const fullText = contractText(value);
  if (!fullText) return [];
  const boundedMaximum = Math.max(256, Number(maximumText) || SCOPE_OWNER_REQUEST_TEXT_LIMIT);
  if (fullText.length <= Math.min(SCOPE_REQUIREMENT_TEXT_LIMIT, boundedMaximum)) {
    return [
      {
        text: fullText,
        priority: 'P0',
        authority: 'user',
        source_refs: [sourceRef],
      },
    ];
  }
  const availableContent = Math.max(
    2,
    boundedMaximum - BEGINNING_REQUEST_MARKER.length - END_REQUEST_MARKER.length
  );
  const contentBudget = Math.min(fullText.length, availableContent);
  const beginningBudget = Math.ceil(contentBudget / 2);
  const endingBudget = Math.floor(contentBudget / 2);
  return [
    {
      text: `${BEGINNING_REQUEST_MARKER}${fullText.slice(0, beginningBudget)}`,
      priority: 'P0',
      authority: 'user',
      source_refs: [`${sourceRef}#beginning`],
    },
    {
      text: `${END_REQUEST_MARKER}${fullText.slice(-endingBudget)}`,
      priority: 'P0',
      authority: 'user',
      source_refs: [`${sourceRef}#end`],
    },
  ];
}

function rawOwnerRequestRequirements(goal) {
  const parsedRequest = contractText(goal?.parsed_requirements);
  const describedRequest = contractText(goal?.description);
  const rawRequestSources = [
    ...(parsedRequest
      ? [{ text: parsedRequest, sourceRef: 'goal.parsed_requirements' }]
      : describedRequest
        ? [{ text: describedRequest, sourceRef: 'goal.description' }]
        : []),
    ...(describedRequest &&
    parsedRequest &&
    describedRequest !== parsedRequest &&
    !describedRequest.startsWith(`${parsedRequest}\n\nTool Usage:`)
      ? [{ text: describedRequest, sourceRef: 'goal.description' }]
      : []),
  ];
  const perSourceRequestLimit = Math.floor(
    SCOPE_OWNER_REQUEST_TEXT_LIMIT / Math.max(1, rawRequestSources.length)
  );
  return rawRequestSources.flatMap(({ text, sourceRef }) =>
    boundedRequestWindows(text, sourceRef, perSourceRequestLimit)
  );
}

function seedSourceRefs(value) {
  return contractList(value, 100);
}

function seedObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const NATIVE_SCOPE_WORK_TYPES = new Set([
  'software_development',
  'outreach_campaign',
  'external_service_operation',
  'procurement_logistics',
  'content_asset_creation',
  'research_analysis',
  'strategy_planning',
  'physical_operations',
  'mixed_custom',
]);

function validAdmissionStrings(values, maximum, minimum = 0) {
  return (
    Array.isArray(values) &&
    values.length >= minimum &&
    values.length <= maximum &&
    values.every((item) => typeof item === 'string' && item.trim().length >= 1)
  );
}

function nativeAdmission(value) {
  const admission = seedObject(value);
  if (admission.version !== 'axwise_scope_admission_v1') return null;
  const requestedActions = Array.isArray(admission.requested_actions)
    ? admission.requested_actions.map(seedObject)
    : null;
  if (
    !validAdmissionStrings(admission.work_types, 9, 1) ||
    admission.work_types.some((item) => !NATIVE_SCOPE_WORK_TYPES.has(item)) ||
    !validAdmissionStrings(admission.geographies, 100) ||
    !validAdmissionStrings(admission.channels, 100) ||
    !validAdmissionStrings(admission.success_criteria, 200, 1) ||
    !validAdmissionStrings(admission.required_capabilities, 100) ||
    !requestedActions ||
    requestedActions.length > 100 ||
    requestedActions.some(
      (item) =>
        typeof item.action !== 'string' ||
        item.action.trim().length < 1 ||
        item.action.trim().length > 500 ||
        !['advise', 'prepare', 'execute'].includes(item.mode) ||
        !['none', 'reversible', 'irreversible'].includes(item.side_effect) ||
        typeof item.requires_authorization !== 'boolean' ||
        ((item.mode === 'execute' || item.side_effect !== 'none') &&
          item.requires_authorization !== true)
    )
  ) {
    return null;
  }
  return {
    version: admission.version,
    work_types: [...admission.work_types],
    geographies: [...admission.geographies],
    channels: [...admission.channels],
    success_criteria: [...admission.success_criteria],
    required_capabilities: [...admission.required_capabilities],
    requested_actions: requestedActions.map((item) => ({
      action: item.action,
      mode: item.mode,
      side_effect: item.side_effect,
      requires_authorization: item.requires_authorization,
    })),
  };
}

function nativeScopeState(intelligence) {
  const packet = intelligence?.scope_packet;
  if (packet?.version !== 'axwise_scope_packet_v1' || !packet.ledger) return null;
  const ledger = packet.ledger;
  const requirements = (Array.isArray(ledger.requirements) ? ledger.requirements : [])
    .map((item) => {
      const value = seedObject(item);
      const text = contractText(value.text).slice(0, 4000);
      if (text.length < 3) return null;
      return {
        text,
        priority: ['P0', 'P1', 'P2'].includes(value.priority) ? value.priority : 'P0',
        authority: [
          'user',
          'system_policy',
          'trusted_runtime',
          'verified_evidence',
          'accepted_assumption',
        ].includes(value.authority)
          ? value.authority
          : 'user',
        source_refs: seedSourceRefs(value.source_refs),
      };
    })
    .filter(Boolean);
  const facts = (Array.isArray(ledger.facts) ? ledger.facts : [])
    .map((item) => {
      const value = seedObject(item);
      const claim = contractText(value.claim).slice(0, 4000);
      const verification = ['verified', 'unverified', 'disputed'].includes(value.verification)
        ? value.verification
        : null;
      if (claim.length < 3 || !verification) return null;
      const sourceRefs = seedSourceRefs(value.source_refs);
      const sourceAuthorityIds = seedSourceRefs(value.source_authority_ids);
      const verbatimExcerpt = contractText(value.verbatim_excerpt).slice(0, 8000);
      const contentHash = String(value.content_hash || '').trim();
      if (
        verification === 'verified' &&
        (!sourceRefs.length ||
          !sourceAuthorityIds.length ||
          !verbatimExcerpt ||
          !/^[a-f0-9]{64}$/.test(contentHash))
      ) {
        return null;
      }
      return {
        claim,
        verification,
        source_refs: sourceRefs,
        source_authority_ids: sourceAuthorityIds,
        ...(verbatimExcerpt ? { verbatim_excerpt: verbatimExcerpt } : {}),
        ...(contentHash ? { content_hash: contentHash } : {}),
      };
    })
    .filter(Boolean);
  const assumptions = (Array.isArray(ledger.assumptions) ? ledger.assumptions : [])
    .map((item) => {
      const value = seedObject(item);
      const text = contractText(value.text).slice(0, 4000);
      if (text.length < 3) return null;
      return {
        text,
        materiality: value.materiality === 'material' ? 'material' : 'non_material',
        owner_confirmed: value.owner_confirmed === true,
        truth_status: 'assumption',
        source_refs: seedSourceRefs(value.source_refs),
      };
    })
    .filter(Boolean);
  const decisions = (Array.isArray(ledger.decisions) ? ledger.decisions : [])
    .map((item) => {
      const value = seedObject(item);
      const question = contractText(value.question).slice(0, 4000);
      const status = ['open', 'proposed', 'accepted', 'rejected'].includes(value.status)
        ? value.status
        : 'open';
      const proposal = contractText(value.proposal).slice(0, 4000);
      const resolvedChoice = contractText(value.resolved_choice).slice(0, 4000);
      if (question.length < 3) return null;
      if (status === 'proposed' && !proposal) return null;
      if (status === 'accepted' && !proposal && !resolvedChoice) return null;
      return {
        question,
        status,
        materiality: value.materiality === 'non_material' ? 'non_material' : 'material',
        ...(proposal ? { proposal } : {}),
        ...(resolvedChoice ? { resolved_choice: resolvedChoice } : {}),
        source_refs: seedSourceRefs(value.source_refs),
      };
    })
    .filter(Boolean);
  const constraints = (Array.isArray(ledger.constraints) ? ledger.constraints : [])
    .map((item) => {
      const value = seedObject(item);
      const text = contractText(value.text).slice(0, 4000);
      if (text.length < 3) return null;
      return {
        text,
        kind: [
          'policy',
          'security',
          'privacy',
          'budget',
          'time',
          'technical',
          'product',
          'other',
        ].includes(value.kind)
          ? value.kind
          : 'other',
        authority: ['user', 'system_policy', 'trusted_runtime'].includes(value.authority)
          ? value.authority
          : 'user',
        source_refs: seedSourceRefs(value.source_refs),
      };
    })
    .filter(Boolean);
  const acceptance = (Array.isArray(ledger.acceptance) ? ledger.acceptance : [])
    .map((item) => {
      const value = seedObject(item);
      const given = contractText(value.given).slice(0, 2000);
      const when = contractText(value.when).slice(0, 2000);
      const then = contractList(value.then, 30).map((text) => text.slice(0, 2000));
      if (given.length < 3 || when.length < 3 || !then.length) return null;
      return {
        given,
        when,
        then,
        supports: seedSourceRefs(value.supports),
        data_class: ['synthetic', 'production_safe', 'manual_review'].includes(value.data_class)
          ? value.data_class
          : 'synthetic',
      };
    })
    .filter(Boolean);
  const deliverable = seedObject(packet.deliverable);
  const deliverableType = contractText(deliverable.type).slice(0, 120);
  const admission = nativeAdmission(packet.admission);
  const researchContract = seedObject(packet.research_contract);
  return {
    requirements,
    facts,
    assumptions,
    decisions,
    constraints,
    acceptance,
    audiences: contractList(packet.intent?.audiences, 100),
    non_goals: contractList(packet.intent?.non_goals, 100),
    ...(admission ? { admission } : {}),
    ...(researchContract.version === 'axwise_scope_research_contract_v1'
      ? {
          research_contract: {
            version: researchContract.version,
            document_intent: researchContract.document_intent,
            work_types: [...researchContract.work_types],
            geographies: [...researchContract.geographies],
            evidence: {
              mode: researchContract.evidence.mode,
              grounding_required: researchContract.evidence.grounding_required,
              required_outputs: [...researchContract.evidence.required_outputs],
              external_sources_required: researchContract.evidence.external_sources_required,
            },
            executor_role_slots: researchContract.executor_role_slots.map((slot) => ({
              slot_id: slot.slot_id,
              role: slot.role,
              required: true,
            })),
            contract_hash: researchContract.contract_hash,
          },
        }
      : {}),
    ...(deliverableType
      ? {
          deliverable: {
            type: deliverableType,
            count: Math.max(1, Math.min(20, Number(deliverable.count) || 1)),
            ...(contractText(deliverable.title_prefix)
              ? { title_prefix: contractText(deliverable.title_prefix).slice(0, 255) }
              : {}),
            required_sections: contractList(deliverable.required_sections, 100),
            presentation: [
              'markdown_artifact',
              'structured_data',
              'chat_response',
              'mixed',
            ].includes(deliverable.presentation)
              ? deliverable.presentation
              : 'markdown_artifact',
          },
        }
      : {}),
  };
}

function mergeScopeSeeds(existing, additions, key) {
  const merged = new Map();
  for (const item of [...(existing || []), ...(additions || [])]) {
    const identity = contractText(key(item)).toLowerCase();
    if (identity) merged.set(identity, item);
  }
  return [...merged.values()];
}

function scopeConstraintKind(value) {
  const text = contractText(value).toLowerCase();
  if (/privacy|personal(?:\s+\w+)?\s+data|health data|gdpr/.test(text)) return 'privacy';
  if (/security|secret|credential|auth/.test(text)) return 'security';
  if (/budget|cost|price/.test(text)) return 'budget';
  if (/deadline|latency|time/.test(text)) return 'time';
  if (/policy|approval|authoriz/.test(text)) return 'policy';
  if (/technical|runtime|model|api/.test(text)) return 'technical';
  if (/product|customer|user experience/.test(text)) return 'product';
  return 'other';
}

/**
 * Project Orqaly's accepted cognitive state into AxWise's exact ScopeStateV1
 * request schema. Owner confirmation authorizes scope, never empirical truth;
 * only facts from an already validated native AxWise packet are carried as
 * facts. Evidence catalogue references can support a requirement but cannot
 * manufacture a claim or a verbatim excerpt.
 */
export function buildAxwiseScopeState(goal, owner = null) {
  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  const revisionPending = goal?.data?.scope_revision?.status === 'pending_rebuild';
  const revisionFeedback = contractText(
    goal?.data?.context_revision_feedback ||
      (revisionPending ? goal?.data?.scope_revision?.desired_outcome : null)
  ).slice(0, 4000);
  const packetPresent = intelligence.scope_packet != null;
  const revisionBase = resolveNativeScopeRevisionBase(goal);
  let canonicalNativeState = null;
  if (!revisionFeedback && packetPresent) {
    if (intelligence.scope_packet?.version !== 'axwise_scope_packet_v1') {
      throw new Error('Native AxWise scope packet version is unsupported');
    }
    const handoff = validateNativeAxwiseDecisionContracts({
      scope_packet: intelligence.scope_packet,
      scope_validation: intelligence.scope_validation,
      scope_confirmation: intelligence.axwise_scope_confirmation,
      scope_contract_binding: intelligence.scope_contract_binding,
    });
    canonicalNativeState = nativeScopeState({ scope_packet: handoff.scope_packet });
    if (!canonicalNativeState) {
      throw new Error('Native AxWise scope packet cannot be projected into ScopeStateV1');
    }
  } else if (revisionFeedback && packetPresent) {
    if (intelligence.scope_packet?.version !== 'axwise_scope_packet_v1') {
      throw new Error('Native AxWise scope packet version is unsupported');
    }
    const handoff = validateNativeAxwiseDecisionContracts({
      scope_packet: intelligence.scope_packet,
      scope_validation: intelligence.scope_validation,
      scope_confirmation: intelligence.axwise_scope_confirmation,
      scope_contract_binding: intelligence.scope_contract_binding,
    });
    canonicalNativeState = nativeScopeState({ scope_packet: handoff.scope_packet });
    if (!canonicalNativeState) {
      throw new Error('Native AxWise scope packet cannot be projected into ScopeStateV1');
    }
  } else if (revisionBase.applies) {
    if (!revisionBase.ready) {
      throw new Error(
        `Native AxWise scope revision base is invalid: ${revisionBase.reasons.join(', ')}`
      );
    }
    canonicalNativeState = nativeScopeState({ scope_packet: revisionBase.packet });
  } else if (!revisionFeedback && hasNativeAxwiseScopeMarkers(goal)) {
    const admissionStatus = String(goal?.data?.scope_admission?.status || '');
    const expectedPrePacketLifecycle =
      revisionPending ||
      intelligence.clarification_scope != null ||
      ['queued', 'started', 'running', 'revision_requested', 'evidence_requested'].includes(
        admissionStatus
      );
    if (!expectedPrePacketLifecycle) {
      throw new Error('Native AxWise scope packet is missing outside a rebuild lifecycle');
    }
  }
  // A correction requests a replacement cognitive contract. Do not feed any
  // rejected typed packet field back as authority. Reclassify the bounded raw
  // owner request, with the latest correction taking precedence over only the
  // conflicting parts of that original request.
  const state = canonicalNativeState || {
    requirements: [],
    facts: [],
    assumptions: [],
    decisions: [],
    constraints: [],
    acceptance: [],
    audiences: [],
    non_goals: [],
  };
  // Once a packet has passed the complete native handoff validator, it is the
  // sole semantic input to the next AxWise decision. Historical raw goal text,
  // tech_doc fields, and older owner adapters must not add scope back in.
  if (canonicalNativeState && !revisionFeedback) return state;
  if (canonicalNativeState && revisionFeedback) {
    return {
      requirements: mergeScopeSeeds(
        [],
        [
          ...rawOwnerRequestRequirements(goal),
          {
            text: `Apply the goal owner's latest scope correction as authoritative over any conflicting original requirement, while preserving non-conflicting original scope: ${revisionFeedback}`.slice(
              0,
              4000
            ),
            priority: 'P0',
            authority: 'user',
            source_refs: ['goal.data.context_revision_feedback'],
          },
        ],
        (item) => item?.text
      ),
      facts: [],
      assumptions: [],
      decisions: [],
      constraints: [],
      acceptance: [],
      audiences: [],
      non_goals: [],
    };
  }
  const techDoc = goal?.tech_doc || {};
  const confirmationRef = owner ? 'orqaly-owner-scope-confirmation' : 'orqaly-goal-contract';
  const verifiedEvidenceRefs = contractList(
    [
      ...(intelligence.clarification_scope?.evidence || []),
      ...(intelligence.persona_resolution?.customer_persona?.evidence || []),
    ]
      .filter(
        (item) =>
          item?.verified === true &&
          item?.verification_source &&
          item.verification_source !== 'none' &&
          item.reference_id !== 'orqaly-owner-scope-confirmation'
      )
      .map((item) => item.reference_id),
    100
  );
  const requirementRefs = seedSourceRefs([confirmationRef, ...verifiedEvidenceRefs]);
  const successCriteria = contractList(
    [
      ...contractList(techDoc.success_criteria, 100),
      ...contractList(techDoc.acceptance_criteria, 100),
      ...contractList(techDoc.acceptance_tests, 100),
    ],
    100
  );
  const rawRequestRequirements = rawOwnerRequestRequirements(goal);
  const ownerRequirements = [
    ...rawRequestRequirements,
    owner?.targetCustomer
      ? {
          text: `Address the needs of the owner-confirmed audience: ${owner.targetCustomer}`.slice(
            0,
            4000
          ),
          priority: 'P0',
          authority: 'accepted_assumption',
          source_refs: requirementRefs,
        }
      : null,
    owner?.problem
      ? {
          text: `Address the owner-confirmed problem: ${owner.problem}`.slice(0, 4000),
          priority: 'P0',
          authority: 'accepted_assumption',
          source_refs: requirementRefs,
        }
      : null,
    owner?.desiredOutcome
      ? {
          text: `Deliver the owner-confirmed outcome: ${owner.desiredOutcome}`.slice(0, 4000),
          priority: 'P0',
          authority: 'user',
          source_refs: requirementRefs,
        }
      : null,
    owner?.correction
      ? {
          text: `Apply the owner's latest correction or optional detail: ${owner.correction}`.slice(
            0,
            4000
          ),
          priority: 'P0',
          authority: 'user',
          source_refs: [confirmationRef],
        }
      : null,
    revisionFeedback && owner?.correction !== revisionFeedback
      ? {
          text: `Apply the goal owner's latest scope correction: ${revisionFeedback}`.slice(
            0,
            4000
          ),
          priority: 'P0',
          authority: 'user',
          source_refs: ['goal.data.context_revision_feedback'],
        }
      : null,
    ...successCriteria.map((text) => ({
      text: text.slice(0, 4000),
      priority: 'P0',
      authority: 'user',
      source_refs: ['goal.tech_doc.success_criteria'],
    })),
  ].filter((item) => item?.text?.length >= 3);
  const ownerAssumptions = owner
    ? [
        owner.targetCustomer ? `Owner-confirmed target audience: ${owner.targetCustomer}` : null,
        owner.problem ? `Owner-confirmed problem context: ${owner.problem}` : null,
      ]
        .filter(Boolean)
        .map((text) => ({
          text: text.slice(0, 4000),
          materiality: 'material',
          owner_confirmed: true,
          truth_status: 'assumption',
          source_refs: [confirmationRef],
        }))
    : [];
  const declaredAssumptions = contractList(techDoc.assumptions, 100).map((text) => ({
    text: text.slice(0, 4000),
    materiality: 'material',
    owner_confirmed: false,
    truth_status: 'assumption',
    source_refs: ['goal.tech_doc.assumptions'],
  }));
  const openDecisions = contractList(techDoc.open_decisions || techDoc.open_questions, 100).map(
    (question) => ({
      question: question.slice(0, 4000),
      status: 'open',
      materiality: 'material',
      source_refs: ['goal.tech_doc.open_decisions'],
    })
  );
  const acceptedDecision = owner
    ? [
        {
          question: 'Which owner-confirmed scope governs this goal?',
          status: 'accepted',
          materiality: 'material',
          resolved_choice: contractText(
            owner.summary || `${owner.targetCustomer}: ${owner.desiredOutcome}`
          ).slice(0, 4000),
          source_refs: [confirmationRef],
        },
      ]
    : [];
  const recordedDecisions = contractList(techDoc.decisions, 100).map((choice) => ({
    question: `What recorded goal decision should govern this scope: ${choice}?`.slice(0, 4000),
    status: 'accepted',
    materiality: 'material',
    resolved_choice: choice.slice(0, 4000),
    source_refs: ['goal.tech_doc.decisions'],
  }));
  const ownerConstraints = contractList(
    [
      ...contractList(techDoc.constraints, 100),
      ...(owner?.constraints || []),
      revisionFeedback ? `Goal owner scope correction: ${revisionFeedback}` : null,
    ],
    200
  ).map((text) => ({
    text: text.slice(0, 4000),
    kind: scopeConstraintKind(text),
    authority: 'user',
    source_refs: [owner ? confirmationRef : 'goal.tech_doc.constraints'],
  }));
  const ownerOutcomeRequirement = ownerRequirements.find((item) =>
    item.text.startsWith('Deliver the owner-confirmed outcome:')
  );
  const explicitAcceptance = successCriteria.map((criterion) => ({
    given: 'the approved owner scope and its permitted evidence',
    when: 'the requested deliverable is reviewed',
    then: [criterion.slice(0, 2000)],
    supports: [criterion.slice(0, 4000)],
    data_class: 'manual_review',
  }));
  if (ownerOutcomeRequirement) {
    explicitAcceptance.push({
      given: 'the owner-confirmed scope',
      when: 'the requested deliverable is reviewed',
      then: [`The deliverable supports: ${owner.desiredOutcome}`.slice(0, 2000)],
      supports: [ownerOutcomeRequirement.text],
      data_class: 'manual_review',
    });
  }
  const requiredSections = contractList(
    goal?.data?.artifact_contract?.required_sections || techDoc.required_sections,
    100
  );
  const deliverable = state.deliverable
    ? {
        ...state.deliverable,
        required_sections: contractList(
          [...(state.deliverable.required_sections || []), ...requiredSections],
          100
        ),
      }
    : requiredSections.length
      ? {
          type: contractText(techDoc.deliverable_type || 'research_prd').slice(0, 120),
          count: 1,
          required_sections: requiredSections,
          presentation: 'markdown_artifact',
        }
      : undefined;
  return {
    requirements: mergeScopeSeeds(state.requirements, ownerRequirements, (item) => item.text),
    facts: state.facts,
    assumptions: mergeScopeSeeds(
      state.assumptions,
      [...ownerAssumptions, ...declaredAssumptions],
      (item) => item.text
    ),
    decisions: mergeScopeSeeds(
      state.decisions,
      [...openDecisions, ...acceptedDecision, ...recordedDecisions],
      (item) => item.question
    ),
    constraints: mergeScopeSeeds(state.constraints, ownerConstraints, (item) => item.text),
    acceptance: mergeScopeSeeds(
      state.acceptance,
      explicitAcceptance,
      (item) => `${item.given}\u0000${item.when}\u0000${contractList(item.then).join('\u0000')}`
    ),
    audiences: contractList(
      [...(state.audiences || []), techDoc.target_audience, owner?.targetCustomer],
      100
    ),
    non_goals: contractList(
      [...(state.non_goals || []), ...contractList(techDoc.out_of_scope)],
      100
    ),
    ...(state.admission ? { admission: state.admission } : {}),
    ...(deliverable ? { deliverable } : {}),
  };
}
