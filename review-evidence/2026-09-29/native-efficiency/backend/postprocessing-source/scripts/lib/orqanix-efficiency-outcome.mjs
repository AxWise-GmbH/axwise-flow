/** Classify completion separately from the frozen independent code-correctness gate. */
export function terminationReason(row) {
  const text=(row.transcript||[]).join('\n');
  if(row.status==='timeout')return 'time_budget_exhausted';
  if(/maximum number of actions/i.test(text))return 'action_budget_exhausted';
  if(row.scopedRelay?.calls>=60&&row.scopedRelay?.denied>0&&/rate limit|request budget/i.test(text))return 'model_budget_exhausted';
  if(/^Ran into this error:/m.test(text))return 'agent_error';
  if(row.status!=='completed')return row.status||'unknown';
  if(row.response?.result?.stopReason&&row.response.result.stopReason!=='end_turn')return 'incomplete';
  return 'terminal_response';
}
