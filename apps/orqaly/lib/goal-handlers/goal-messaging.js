/**
 * Goal Messaging — structured communication between agents during goal execution.
 *
 * Communication hierarchy:
 *   Consilium → Team Lead (lead-consilium channel)
 *   Team Lead → Agents (agent-lead channel)
 *   All agents → team-room (broadcast)
 *   System → all (system channel)
 *
 * Rules enforced:
 * - Regular agents can only post to team-room and agent-lead
 * - Only team lead can post to lead-consilium
 * - System can post to any channel
 */
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('goal-messaging');

/**
 * Post a message to a goal room.
 */
export async function postMessage(
  admin,
  {
    goalId,
    senderAgentId,
    senderName,
    recipientAgentId,
    channel = 'team-room',
    message,
    messageType = 'text',
    metadata = {},
  }
) {
  try {
    const { error } = await admin.from('goal_messages').insert({
      goal_id: goalId,
      sender_agent_id: senderAgentId || null,
      sender_name: senderName || 'system',
      recipient_agent_id: recipientAgentId || null,
      channel,
      message,
      message_type: messageType,
      metadata,
    });
    if (error) log.warn(null, 'goal-messaging.post.failed', { error: error.message });
    return !error;
  } catch (err) {
    log.warn(null, 'goal-messaging.post.error', { error: err.message });
    return false;
  }
}

/**
 * Consilium briefs team lead before a phase.
 */
export async function consiliumBriefTeamLead(admin, goal, phaseIndex, briefing) {
  const phase = goal.plan?.phases?.[phaseIndex];
  return postMessage(admin, {
    goalId: goal.id,
    senderName: 'Consilium',
    channel: 'lead-consilium',
    message:
      briefing ||
      `Phase ${phaseIndex + 1} "${phase?.name || ''}": ${phase?.description || 'Execute phase tasks.'}`,
    messageType: 'instruction',
    metadata: { phase_index: phaseIndex, type: 'pre-phase-brief' },
  });
}

/**
 * Consilium provides feedback to team lead after phase evaluation.
 */
export async function consiliumFeedback(admin, goal, phaseIndex, feedback, passed) {
  return postMessage(admin, {
    goalId: goal.id,
    senderName: 'Consilium',
    channel: 'lead-consilium',
    message: feedback,
    messageType: 'feedback',
    metadata: { phase_index: phaseIndex, passed, type: 'post-phase-feedback' },
  });
}

/**
 * Team lead instructs an agent.
 */
export async function teamLeadInstruct(admin, goal, agentId, agentName, instruction) {
  return postMessage(admin, {
    goalId: goal.id,
    senderName: 'Team Lead',
    recipientAgentId: agentId,
    channel: 'agent-lead',
    message: instruction,
    messageType: 'instruction',
    metadata: { agent_name: agentName },
  });
}

/**
 * Agent reports to team room.
 */
export async function agentReport(admin, goal, agentId, agentName, report, phaseIndex) {
  return postMessage(admin, {
    goalId: goal.id,
    senderAgentId: agentId,
    senderName: agentName,
    channel: 'team-room',
    message: report,
    messageType: 'report',
    metadata: { phase_index: phaseIndex },
  });
}

/**
 * System alert to all.
 */
export async function systemAlert(admin, goalId, alert, alertType = 'info') {
  return postMessage(admin, {
    goalId,
    senderName: 'System',
    channel: 'system',
    message: alert,
    messageType: 'alert',
    metadata: { alert_type: alertType },
  });
}

/**
 * Archive all messages for a completed goal.
 */
export async function archiveGoalMessages(admin, goalId) {
  try {
    await admin
      .from('goal_messages')
      .update({ is_archived: true })
      .eq('goal_id', goalId)
      .eq('is_archived', false);
  } catch (err) {
    log.warn(null, 'goal-messaging.archive.failed', { error: err.message });
  }
}

/**
 * Get messages for a goal room (for UI display).
 */
export async function getGoalMessages(admin, goalId, userId, channel = null, limit = 50) {
  if (!goalId || !userId) return [];
  let q = admin
    .from('goal_messages')
    .select(
      'id, sender_name, sender_agent_id, channel, message, message_type, metadata, created_at, goals!inner(user_id)'
    )
    .eq('goal_id', goalId)
    .eq('goals.user_id', userId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (channel) q = q.eq('channel', channel);

  const { data, error } = await q;
  if (error) {
    log.warn(null, 'goal-messaging.get.failed', { error: error.message });
    return [];
  }
  return (data || []).map(({ goals: _ownedGoal, ...message }) => message);
}
