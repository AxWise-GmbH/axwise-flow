/**
 * Submit-path helpers for the New Goal dialog.
 *
 * Goal creation is deliberately two-phase: a draft is created first, evidence
 * is persisted second, and only then is the goal started. A failed upload can
 * therefore never race the worker or AxWise customer intelligence.
 */
import { startGoal } from '../../../services/goalService';
import { uploadGoalFile } from '../../../services/goalFileService';
import {
  COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES,
  COMMERCIAL_MARKET_LAUNCH_INTENT,
} from '../researchPolicy';

export async function persistEvidenceAndStartGoal(
  goal,
  attachments,
  onProgress = () => {},
  kbDocumentIds = []
) {
  if (!goal?.id) throw new Error('The Smart Request draft was not created.');

  const persisted = [];
  if (attachments?.length) onProgress('Persisting evidence before analysis…');
  for (const attachment of attachments) {
    if (attachment._file) {
      // Uploaded files are persisted first. Their metadata—not uninspected
      // binary content—is then handed to the server evidence boundary.
      persisted.push(await uploadGoalFile(goal.id, attachment._file));
    } else {
      const { _file, ...safeReference } = attachment;
      void _file;
      persisted.push(safeReference);
    }
  }
  onProgress('Starting customer and evidence analysis…');
  const started = await startGoal(goal.id, persisted, kbDocumentIds);
  return {
    ...goal,
    ...started,
    data: { ...(goal.data || {}), ...(started?.data || {}) },
  };
}

export const SHA256_HASH_PATTERN = /^[a-f0-9]{64}$/;
export const PHYSICAL_EVIDENCE_ROLE_SLOTS = [
  'customer_market',
  'pricing_finance',
  'legal_compliance',
  'sales_distribution',
  'risk_operations',
];

export function assertPreparedPhysicalEvidenceProfile(value, { orgId, researchMode }) {
  const profile = value?.business_evidence_profile;
  const [offerRequirement] = profile?.fact_requirements || [];
  const [differenceRequirement] = profile?.calculation_requirements || [];
  const exactRoles =
    Array.isArray(value?.requested_execution_roles) &&
    value.requested_execution_roles.length === COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES.length &&
    COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES.every(
      (role, index) => value.requested_execution_roles[index] === role
    );
  const exactRoleSlots =
    Array.isArray(profile?.required_role_slots) &&
    profile.required_role_slots.length === PHYSICAL_EVIDENCE_ROLE_SLOTS.length &&
    PHYSICAL_EVIDENCE_ROLE_SLOTS.every(
      (slot, index) => profile.required_role_slots[index] === slot
    );
  const valid =
    profile?.version === 'business_evidence_profile_v1' &&
    value?.research_intent === COMMERCIAL_MARKET_LAUNCH_INTENT &&
    profile.intent === COMMERCIAL_MARKET_LAUNCH_INTENT &&
    profile.economic_model === 'physical_product' &&
    profile.fact_requirements?.length === 1 &&
    offerRequirement?.kind === 'physical_product_offer' &&
    offerRequirement.minimum_verified === 2 &&
    offerRequirement.applicability === 'required' &&
    profile.calculation_requirements?.length === 1 &&
    differenceRequirement?.kind === 'physical_offer_price_difference' &&
    differenceRequirement.minimum_verified === 1 &&
    differenceRequirement.applicability === 'required' &&
    exactRoleSlots &&
    exactRoles &&
    SHA256_HASH_PATTERN.test(String(value?.business_evidence_profile_hash || '')) &&
    SHA256_HASH_PATTERN.test(String(value?.market_scope_hash || '')) &&
    profile.market_scope_hash === value.market_scope_hash &&
    value?.binding?.org_id === orgId &&
    value?.binding?.research_mode === researchMode &&
    value?.binding?.market_scope_hash === value.market_scope_hash;

  if (!valid) {
    throw new Error(
      'The server returned an invalid physical evidence profile. Nothing was created.'
    );
  }
  return value;
}
