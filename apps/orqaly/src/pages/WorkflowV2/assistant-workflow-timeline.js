// A display projection only. Never pass these entries to assistantSend or the
// ordinary Assistant model context: workflow replies may contain consented data.
export function assistantWorkflowTimeline(assistantEntries, conversations) {
  const entries = assistantEntries.map((entry, index) => ({
    ...entry,
    kind: 'assistant',
    key: `assistant:${entry.message.id}`,
    time: timestamp(entry.message.createdAt, index),
  }));
  const seen = new Set();
  for (const conversation of conversations) {
    for (const turn of conversation.snapshot?.turns || []) {
      const key = `workflow:${conversation.solutionId}:${turn.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        kind: 'workflow',
        key,
        turn,
        solutionId: conversation.solutionId,
        solutionName: conversation.solutionName,
        time: timestamp(turn.createdAt, Number.MAX_SAFE_INTEGER),
      });
    }
  }
  return entries.sort((a, b) => a.time - b.time);
}

function timestamp(value, fallback) {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}
