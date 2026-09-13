/**
 * Risk assessor: maps evaluation outcomes to risk/decision levels.
 * Determines whether human review is required.
 */

/**
 * Assess the risk level of an evaluation result.
 *
 * @param {object} opts
 * @param {number} opts.overallScore - 0-10
 * @param {number} opts.approvalRatio - 0-1
 * @param {boolean} opts.consensusReached
 * @param {boolean} opts.approved
 * @param {boolean} opts.collusionDetected
 * @param {number} opts.memberCount - How many members participated
 * @param {object} opts.boardConfig - Board configuration
 * @param {string} opts.boardConfig.security_level - 'minimal' | 'standard' | 'strict' | 'paranoid'
 * @returns {{ level: string, humanReviewRequired: boolean, reasons: string[] }}
 */
export function assessRisk(opts) {
  const {
    overallScore = 0,
    approvalRatio = 0,
    consensusReached = false,
    approved = false,
    collusionDetected = false,
    memberCount = 0,
    boardConfig = {},
  } = opts;

  const securityLevel = boardConfig.security_level || 'standard';
  const reasons = [];

  // ── CRITICAL ──
  if (collusionDetected) {
    reasons.push('Collusion detected between members');
    return { level: 'CRITICAL', humanReviewRequired: true, reasons };
  }

  if (securityLevel === 'paranoid') {
    reasons.push('Paranoid security level requires human review');
    return { level: 'HIGH', humanReviewRequired: true, reasons };
  }

  // ── HIGH ──
  if (!consensusReached) {
    reasons.push('Consensus not reached');
    return { level: 'HIGH', humanReviewRequired: securityLevel !== 'minimal', reasons };
  }

  if (overallScore <= 3 && approved) {
    reasons.push('Low score but approved — contradictory result');
    return { level: 'HIGH', humanReviewRequired: true, reasons };
  }

  if (memberCount === 1) {
    reasons.push('Single member evaluation');
    if (securityLevel === 'strict') {
      return { level: 'HIGH', humanReviewRequired: true, reasons };
    }
  }

  // ── MEDIUM ──
  if (approvalRatio < 0.6 && approved) {
    reasons.push('Narrow approval margin');
    return { level: 'MEDIUM', humanReviewRequired: securityLevel === 'strict', reasons };
  }

  if (overallScore < 5) {
    reasons.push('Below-average score');
    return { level: 'MEDIUM', humanReviewRequired: false, reasons };
  }

  // ── LOW ──
  return { level: 'LOW', humanReviewRequired: false, reasons };
}
