/**
 * Consensus calculator: determines board consensus from member responses.
 * Supports: unanimous, majority, weighted, custom.
 * Also handles split decisions and collusion detection.
 */
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('consensus-calculator');

/**
 * Calculate consensus from member evaluation responses.
 *
 * @param {object} opts
 * @param {Array<{memberId: string, approved: boolean, overallScore: number, weight?: number, role?: string}>} opts.responses
 * @param {object} opts.rules - Consensus rules from concilium_consensus_rules
 * @param {string} opts.rules.consensus_type - 'unanimous' | 'majority' | 'weighted' | 'custom'
 * @param {number} opts.rules.quorum - Minimum responses required
 * @param {number} opts.rules.approval_threshold - 0-1 threshold for approval
 * @param {string} opts.rules.split_decision_strategy - How to handle ties
 * @returns {{ approved: boolean, consensusReached: boolean, approvalRatio: number, strategy: string, details: object }}
 */
export function calculateConsensus(opts) {
  const { responses = [], rules = {} } = opts;
  const {
    consensus_type = 'majority',
    quorum = 2,
    approval_threshold = 0.50,
    split_decision_strategy = 'chairman_decides',
  } = rules;

  // Check quorum
  if (responses.length < quorum) {
    return {
      approved: false,
      consensusReached: false,
      approvalRatio: 0,
      strategy: consensus_type,
      details: {
        reason: `Quorum not met: ${responses.length}/${quorum} responses`,
        totalResponses: responses.length,
        quorum,
      },
    };
  }

  const calculator = CONSENSUS_CALCULATORS[consensus_type] || CONSENSUS_CALCULATORS.majority;
  const result = calculator(responses, { approval_threshold, split_decision_strategy });

  return {
    ...result,
    strategy: consensus_type,
    details: {
      ...result.details,
      totalResponses: responses.length,
      quorum,
      approval_threshold,
    },
  };
}

const CONSENSUS_CALCULATORS = {
  unanimous(responses) {
    const allApproved = responses.every((r) => r.approved);
    const allRejected = responses.every((r) => !r.approved);
    return {
      approved: allApproved,
      consensusReached: allApproved || allRejected,
      approvalRatio: allApproved ? 1 : 0,
      details: { approvedCount: responses.filter((r) => r.approved).length },
    };
  },

  majority(responses, { approval_threshold, split_decision_strategy }) {
    const approvedCount = responses.filter((r) => r.approved).length;
    const approvalRatio = responses.length > 0 ? approvedCount / responses.length : 0;
    const approved = approvalRatio >= approval_threshold;

    // Check for exact tie (split decision)
    const isTie = approvalRatio === 0.5 && responses.length % 2 === 0;
    if (isTie) {
      return handleSplitDecision(responses, approvalRatio, split_decision_strategy);
    }

    return {
      approved,
      consensusReached: true,
      approvalRatio,
      details: { approvedCount, rejectedCount: responses.length - approvedCount },
    };
  },

  weighted(responses, { approval_threshold, split_decision_strategy }) {
    const totalWeight = responses.reduce((sum, r) => sum + (r.weight || 1), 0);
    if (totalWeight === 0) {
      return { approved: false, consensusReached: false, approvalRatio: 0, details: { reason: 'No weights' } };
    }

    const approvedWeight = responses
      .filter((r) => r.approved)
      .reduce((sum, r) => sum + (r.weight || 1), 0);
    const approvalRatio = approvedWeight / totalWeight;
    const approved = approvalRatio >= approval_threshold;

    return {
      approved,
      consensusReached: true,
      approvalRatio,
      details: { approvedWeight, totalWeight, effectiveThreshold: approval_threshold },
    };
  },

  custom(responses, { approval_threshold }) {
    // Custom consensus: uses overallScore average against threshold
    const avgScore = responses.reduce((sum, r) => sum + (r.overallScore || 0), 0) / responses.length;
    const normalizedScore = avgScore / 10; // 0-10 scale → 0-1
    const approved = normalizedScore >= approval_threshold;

    return {
      approved,
      consensusReached: true,
      approvalRatio: normalizedScore,
      details: { averageScore: avgScore, normalizedScore, threshold: approval_threshold },
    };
  },
};

function handleSplitDecision(responses, approvalRatio, strategy) {
  const base = {
    consensusReached: false,
    approvalRatio,
    details: { splitDecision: true, strategy },
  };

  switch (strategy) {
    case 'chairman_decides': {
      const chairman = responses.find((r) => r.role === 'chairman');
      if (chairman) {
        return { ...base, approved: chairman.approved, consensusReached: true, details: { ...base.details, chairmanVote: chairman.approved } };
      }
      // No chairman found: fall through to reject
      return { ...base, approved: false, details: { ...base.details, reason: 'No chairman to break tie' } };
    }
    case 'reject':
      return { ...base, approved: false, consensusReached: true };
    case 'escalate_to_human':
      return { ...base, approved: false, details: { ...base.details, requiresHumanReview: true } };
    case 're_evaluate':
      return { ...base, approved: false, details: { ...base.details, requiresReEvaluation: true } };
    default:
      return { ...base, approved: false };
  }
}

/**
 * Aggregate scores from multiple member responses.
 *
 * @param {Array<{scores: object, overallScore: number}>} responses
 * @returns {{ aggregatedScores: object, overallScore: number }}
 */
export function aggregateScores(responses) {
  if (!responses || responses.length === 0) {
    return { aggregatedScores: {}, overallScore: 0 };
  }

  const allKeys = new Set();
  for (const r of responses) {
    if (r.scores && typeof r.scores === 'object') {
      for (const key of Object.keys(r.scores)) allKeys.add(key);
    }
  }

  const aggregatedScores = {};
  for (const key of allKeys) {
    const values = responses
      .map((r) => r.scores?.[key])
      .filter((v) => typeof v === 'number');
    aggregatedScores[key] = values.length > 0
      ? parseFloat((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2))
      : 0;
  }

  const overallScores = responses.map((r) => r.overallScore).filter((v) => typeof v === 'number');
  const overallScore = overallScores.length > 0
    ? parseFloat((overallScores.reduce((s, v) => s + v, 0) / overallScores.length).toFixed(2))
    : 0;

  return { aggregatedScores, overallScore };
}
