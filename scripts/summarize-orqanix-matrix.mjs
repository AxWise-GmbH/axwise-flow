#!/usr/bin/env node
/** Offline summary only. API: analyzeReport(report), renderMarkdown(analysis), main(argv).
 * CLI: node scripts/summarize-orqanix-matrix.mjs report.json output-directory
 * Writes analysis.json and summary.md. Never contacts providers or launches the app.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DIFFICULTIES = ['simple', 'medium', 'complex'];
const FLAGS = { jev: 'jevReviewEnabled', native: 'nativeGemsEnabled', axwise: 'axwiseLocalEnabled' };
const NATIVE = ['ast_search', 'lsp_query', 'hashline_edit', 'safe_edit_and_test'];
const AXWISE = ['prepare_discovery', 'research_market', 'generate_personas', 'simulate_interviews', 'chat_with_persona', 'analyze_interviews', 'create_prd', 'create_delivery_brief'];
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const counts = values => Object.fromEntries([...new Set(values)].sort().map(key => [key, values.filter(value => value === key).length]));
const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value))].sort();
const combo = flags => `j${+flags.jevReviewEnabled}n${+flags.nativeGemsEnabled}a${+flags.axwiseLocalEnabled}`;
const flagsFor = mask => ({ jevReviewEnabled: !!(mask & 4), nativeGemsEnabled: !!(mask & 2), axwiseLocalEnabled: !!(mask & 1) });
const rowKey = row => `${row.difficulty}-r${row.repeat}-${combo(row.flags)}`;
function stats(values) {
  values = values.filter(value => typeof value === 'number' && Number.isFinite(value));
  return { count: values.length, mean: values.length ? values.reduce((a,b) => a+b, 0) / values.length : null, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null };
}
function inventory(row) {
  const names = Array.isArray(row.actualToolInventory) ? row.actualToolInventory : [];
  const observed = Array.isArray(row.actualToolInventory) && names.length > 0 && names.every(x => typeof x === 'string');
  const native = NATIVE.filter(name => names.includes(name) || names.includes(`native_engineering__${name}`));
  const axwise = AXWISE.filter(name => names.includes(`axwise-local__${name}`));
  return { observed, native, axwise, verified: observed && row.inventoryMatches === true && (row.flags.nativeGemsEnabled ? native.length === NATIVE.length : native.length === 0) && (row.flags.axwiseLocalEnabled ? axwise.length === AXWISE.length : axwise.length === 0) };
}
function nativeAction(tool, name) {
  if (name === 'safe_edit_and_test') return 'guarded_edit_and_test';
  if (name !== 'hashline_edit') return 'unreported';
  const hasRaw = tool.rawInput != null && Object.hasOwn(tool.rawInput, 'action');
  const hasCurated = Object.hasOwn(tool, 'action');
  const action = hasRaw ? tool.rawInput.action : tool.action;
  if (hasRaw && hasCurated && tool.action !== action) return 'unreported';
  return ['read', 'edit'].includes(action) ? action : 'unreported';
}
function actionSummary(calls) {
  const native = calls.filter(call => typeof call.action === 'string');
  return {
    actions: counts(native.map(call => call.action)),
    actionOutcomes: Object.fromEntries(unique(native.map(call => call.action)).map(action => {
      const selected = native.filter(call => call.action === action);
      return [action, { called: selected.length, completed: selected.filter(call => call.completed).length, errors: selected.filter(call => call.error).length, unfinished: selected.filter(call => !call.completed && !call.error).length }];
    })),
  };
}
function toolSummary(tools = []) {
  const selected = { native: [], axwise: [], other: [] };
  for (const tool of tools) {
    const name = tool?._meta?.goose?.toolCall?.toolName || tool?.name || 'unknown';
    const short = name.split('__').at(-1);
    const group = NATIVE.includes(short) && (name === short || name.startsWith('native_engineering__')) ? 'native' : name.startsWith('axwise-local__') && AXWISE.includes(short) ? 'axwise' : 'other';
    const protocolStatus = tool.status || 'unreported';
    const error = ['failed','error','cancelled'].includes(protocolStatus) || tool.rawOutput?.isError === true || tool.rawOutput?.result?.isError === true;
    selected[group].push({ name, toolCallId: tool.toolCallId ?? null, protocolStatus, completed: protocolStatus === 'completed' && !error, error, ...(group === 'native' ? { action: nativeAction(tool, short) } : {}) });
  }
  return Object.fromEntries(Object.entries(selected).map(([group, calls]) => [group, { called: calls.length, completed: calls.filter(x => x.completed).length, errors: calls.filter(x => x.error).length, unfinished: calls.filter(x => !x.completed && !x.error).length, names: counts(calls.map(x => x.name)), ...(group === 'native' ? actionSummary(calls) : {}), calls }]));
}
function requests(row, field, kind) {
  if (Array.isArray(row.telemetry?.[field])) return row.telemetry[field];
  const kinds = Array.isArray(kind) ? kind : [kind];
  return Array.isArray(row.telemetry?.records) ? row.telemetry.records.filter(r => kinds.includes(r.kind)) : [];
}
function tokenMetric(modelRequests, field) {
  const values = modelRequests.map(request => request.usage?.[field]).filter(integer);
  return { reportedSum: values.length ? values.reduce((a,b) => a+b, 0) : null, requestsReported: values.length, requestsMissing: modelRequests.length - values.length };
}
function telemetry(rows) {
  const models = rows.flatMap(row => requests(row, 'modelRequests', 'model_http'));
  const jev = rows.flatMap(row => requests(row, 'jevRequests', ['jev_service', 'jev_http']));
  const jevProvider = rows.flatMap(row => requests(row, 'jevProviderRequests', 'jev_provider_http'));
  const providerUsageFields = unique(jevProvider.flatMap(x => Object.keys(x.usage || {}).filter(key => integer(x.usage[key]))));
  const forSource = source => models.filter(request => request.source === source);
  const usage = modelRequests => ({ requests: modelRequests.length, inputTokens: tokenMetric(modelRequests, 'prompt_tokens'), outputTokens: tokenMetric(modelRequests, 'completion_tokens'), totalTokens: tokenMetric(modelRequests, 'total_tokens') });
  return {
    model: { requests: models.length, statusCounts: counts(models.map(x => x.status || 'unreported')), httpStatusCounts: counts(models.map(x => String(x.httpStatus ?? 'unreported'))), errorCodes: counts(models.filter(x => typeof x.error === 'string').map(x => x.error)), identityCounts: counts(models.map(x => x.modelIdentity || 'unreported')), requestedModels: unique(models.map(x => x.requestedModel)), returnedModels: unique(models.flatMap(x => Array.isArray(x.responseModels) ? x.responseModels : [])), requestsWithoutReturnedModel: models.filter(x => !x.responseModels?.length).length, requestedEfforts: counts(models.map(x => x.requestedEffort || 'unspecified')), usage: usage(models), bySource: { primary: usage(forSource('primary')), axwise: usage(forSource('axwise')), unattributed: usage(models.filter(x => !['primary','axwise'].includes(x.source))) } },
    provenance: { jevMethods: counts(rows.map(row => row.telemetry?.provenance?.jevMethod || 'unreported')), jevProviderVisibilityRows: counts(rows.map(row => row.telemetry?.provenance?.jevProviderHttpVisible === true ? 'direct' : row.telemetry?.provenance?.jevProviderHttpVisible === false ? 'not_visible' : 'unreported')) },
    jev: { layer: 'service_outcome', requests: jev.length, statusCounts: counts(jev.map(x => x.status || 'unreported')), httpStatusCounts: counts(jev.map(x => String(x.httpStatus ?? 'unreported'))), evaluationCounts: counts(jev.map(x => x.evaluated === true ? 'evaluated' : x.evaluated === false ? 'not_evaluated' : 'unreported')), elapsedSeconds: stats(jev.filter(x => finite(x.elapsedMs)).map(x => x.elapsedMs/1000)), completedElapsedSeconds: stats(jev.filter(x => x.status === 'completed' && finite(x.elapsedMs)).map(x => x.elapsedMs/1000)), returnedAdvice: counts(jev.filter(x => typeof x.decision === 'string').map(x => x.decision)), reviewStatuses: counts(jev.filter(x => typeof x.reviewStatus === 'string').map(x => x.reviewStatus)), reasons: counts(jev.filter(x => typeof x.reason === 'string').map(x => x.reason)), models: unique(jev.map(x => x.responseModel)), timeoutsOrCancellations: jev.filter(x => /timeout|timed_out|cancel/i.test(`${x.status || ''} ${x.error || ''} ${x.reason || ''}`)).length, observations: jev.map(x => ({ id: x.id ?? null, route: x.route ?? null, status: x.status ?? null, httpStatus: x.httpStatus ?? null, elapsedMs: finite(x.elapsedMs) ? x.elapsedMs : null, evaluated: typeof x.evaluated === 'boolean' ? x.evaluated : null, decisionKind: x.decisionKind ?? null, enabledRequested: x.enabledRequested ?? null, advice: x.decision ?? null, reviewStatus: x.reviewStatus ?? null, reason: x.reason ?? null, model: x.responseModel ?? null, error: x.error ?? null, effectiveMode: x.effectiveMode ?? null })) },
    jevProvider: { layer: 'provider_http', requests: jevProvider.length, statusCounts: counts(jevProvider.map(x => x.status || 'unreported')), httpStatusCounts: counts(jevProvider.map(x => String(x.httpStatus ?? 'unreported'))), errorCodes: counts(jevProvider.filter(x => typeof x.error === 'string').map(x => x.error)), requestedModels: unique(jevProvider.map(x => x.requestedModel)), returnedModels: unique(jevProvider.map(x => x.responseModel)), requestsWithoutReturnedModel: jevProvider.filter(x => !x.responseModel).length, elapsedSeconds: stats(jevProvider.filter(x => finite(x.elapsedMs)).map(x => x.elapsedMs/1000)), completedElapsedSeconds: stats(jevProvider.filter(x => x.status === 'completed' && finite(x.elapsedMs)).map(x => x.elapsedMs/1000)), timeoutsOrCancellations: jevProvider.filter(x => /timeout|timed_out|cancel/i.test(`${x.status || ''} ${x.error || ''}`)).length, reportedUsageFields: Object.fromEntries(providerUsageFields.map(field => [field, tokenMetric(jevProvider, field)])), observations: jevProvider.map(x => ({ id: x.id ?? null, serviceRecordId: x.serviceRecordId ?? null, status: x.status ?? null, httpStatus: x.httpStatus ?? null, elapsedMs: finite(x.elapsedMs) ? x.elapsedMs : null, requestedModel: x.requestedModel ?? null, returnedModel: x.responseModel ?? null, error: x.error ?? null, metadataParseError: x.metadataParseError ?? null, usage: x.usage ? Object.fromEntries(Object.entries(x.usage).filter(([,value]) => integer(value))) : null })) },
    pendingRequests: rows.reduce((sum, row) => sum + (integer(row.telemetry?.pending) ? row.telemetry.pending : 0), 0),
    rowsWithoutTelemetry: rows.filter(row => !row.telemetry).length,
  };
}
const permissionReasons = {
  allowed_synthetic_fixture_operation: 'Allowed operation within the synthetic fixture policy',
  outside_benchmark_policy: 'Operation outside the benchmark permission policy',
  unknown_tool_or_invalid_input: 'Unknown tool or invalid tool input',
  invalid_or_unverifiable_operation: 'Operation invalid or not verifiable by the permission policy',
};
function permissionDecisions(decisions = []) {
  const observations = decisions.map(d => ({ requestId: d.requestId ?? null, toolCallId: d.toolCallId ?? null, name: d.name ?? 'unreported', allow: typeof d.allow === 'boolean' ? d.allow : null, reason: d.reason ?? 'unreported', readableReason: permissionReasons[d.reason] || String(d.reason || 'unreported').replaceAll('_', ' ') }));
  const denied = observations.filter(d => d.allow === false);
  return { recorded: observations.length, allowed: observations.filter(d => d.allow === true).length, denied: denied.length, unreported: observations.filter(d => d.allow === null).length, deniedReasons: counts(denied.map(d => d.readableReason)), observations };
}
function summarizeRows(raw, normalized, expected) {
  const valid = normalized.filter(row => row.validOutcome);
  const native = normalized.map(row => row.tools.native), axwise = normalized.map(row => row.tools.axwise);
  const tools = list => ({ called: list.reduce((sum,x) => sum+x.called,0), completed: list.reduce((sum,x) => sum+x.completed,0), errors: list.reduce((sum,x) => sum+x.errors,0), unfinished: list.reduce((sum,x) => sum+x.unfinished,0), rowsUsed: list.filter(x => x.called > 0).length, names: counts(list.flatMap(x => x.calls.map(call => call.name))) });
  return {
    expected, recorded: raw.length, missing: expected - raw.length, completed: normalized.filter(x => x.status === 'completed').length, reportedPassed: raw.filter(x => x.passed === true).length, validOutcomes: valid.length,
    oraclePassed: raw.filter(x => x.oracle?.passed === true).length, codePassed: raw.filter(x => x.oracle?.code?.passed === true).length, documentStructurePassed: raw.filter(x => x.oracle?.documents?.passed === true).length,
    invalidOutcomes: normalized.length - valid.length, terminalTaskSuccesses: normalized.filter(x => x.terminalTaskSuccess).length, measurementExclusionsAfterTaskSuccess: normalized.filter(x => x.terminalTaskSuccess && !x.validOutcome).map(x => x.key), timeouts: normalized.filter(x => /timeout/i.test(x.status)).length, statusCounts: counts(normalized.map(x => x.status)), validationFailures: counts(normalized.flatMap(x => x.exclusions)),
    validElapsedSeconds: stats(valid.map(x => x.elapsedMs/1000)), validFirstOutputSeconds: stats(valid.filter(x => finite(x.firstOutputMs)).map(x => x.firstOutputMs/1000)), validFirstOutputMissing: valid.filter(x => !finite(x.firstOutputMs)).length,
    setupSecondsExcluded: stats(raw.filter(x => finite(x.setupMs)).map(x => x.setupMs/1000)),
    tools: { native: { ...tools(native), ...actionSummary(native.flatMap(x => x.calls)) }, axwise: tools(axwise) }, telemetry: telemetry(raw),
    approvals: { ...permissionDecisions(raw.flatMap(row => Array.isArray(row.decisions) ? row.decisions : [])), rowsWithDenials: normalized.filter(row => row.approvals.denied > 0).length, rowsWithDenialsAndValidOutcome: valid.filter(row => row.approvals.denied > 0).length },
    failures: normalized.filter(x => !x.validOutcome).map(x => ({ key:x.key, status:x.status, error:x.error, exclusions:x.exclusions, oracleFailures:x.oracleFailures })),
  };
}
function matchedEffects(rows, repetitions) {
  const lookup = new Map(rows.map(row => [row.key,row]));
  return Object.fromEntries(Object.entries(FLAGS).map(([factor,field]) => {
    const pairs = [], excluded = [];
    for (const difficulty of DIFFICULTIES) for(let repeat=1;repeat<=repetitions;repeat++) for(let mask=0;mask<8;mask++) {
      const offFlags=flagsFor(mask);if(offFlags[field])continue;
      const onFlags={...offFlags,[field]:true};
      const offKey=rowKey({difficulty,repeat,flags:offFlags}),onKey=rowKey({difficulty,repeat,flags:onFlags});
      const off=lookup.get(offKey),on=lookup.get(onKey);
      const others=Object.fromEntries(Object.entries(FLAGS).filter(([,key])=>key!==field).map(([name,key])=>[name,offFlags[key]]));
      const base={difficulty,repeat,otherFlags:others,offKey,onKey};
      if(!off?.validOutcome||!on?.validOutcome){excluded.push({...base,reason:!off||!on?'missing_row':'nonvalid_outcome',offStatus:off?.status??'missing',onStatus:on?.status??'missing'});continue;}
      pairs.push({...base,offSeconds:off.elapsedMs/1000,onSeconds:on.elapsedMs/1000,deltaSeconds:(on.elapsedMs-off.elapsedMs)/1000,percentChange:off.elapsedMs>0?(on.elapsedMs-off.elapsedMs)/off.elapsedMs*100:null});
    }
    const aggregate=values=>({pairs:values.length,deltaSeconds:stats(values.map(x=>x.deltaSeconds)),percentChange:stats(values.filter(x=>x.percentChange!==null).map(x=>x.percentChange)),onFaster:values.filter(x=>x.deltaSeconds<0).length,onSlower:values.filter(x=>x.deltaSeconds>0).length,ties:values.filter(x=>x.deltaSeconds===0).length});
    const strata=unique(pairs.map(x=>`${x.difficulty}:${JSON.stringify(x.otherFlags)}`)).map(key=>{const values=pairs.filter(x=>`${x.difficulty}:${JSON.stringify(x.otherFlags)}`===key);return {difficulty:values[0].difficulty,otherFlags:values[0].otherFlags,...aggregate(values)};});
    return [factor,{...aggregate(pairs),expectedPairs:DIFFICULTIES.length*repetitions*4,excludedPairs:excluded.length,exclusionCounts:counts(excluded.map(x=>x.reason)),byDifficulty:Object.fromEntries(DIFFICULTIES.map(d=>[d,aggregate(pairs.filter(x=>x.difficulty===d))])),strata,pairedObservations:pairs,excludedObservations:excluded}];
  }));
}

export function analyzeReport(report) {
  if(report?.schema!=='orqanix.actual-desktop-matrix.v1'||!Array.isArray(report.rows))throw Error('INVALID_REPORT_SCHEMA');
  const repetitions=report.fingerprint?.repetitions;
  if(![1,2,3].includes(repetitions))throw Error('INVALID_REPETITIONS');
  const seen=new Set();
  const rows=report.rows.map(row=>{
    if(!DIFFICULTIES.includes(row.difficulty)||!Number.isInteger(row.repeat)||row.repeat<1||row.repeat>repetitions||!row.flags||!Object.values(FLAGS).every(k=>typeof row.flags[k]==='boolean')||row.key!==rowKey(row))throw Error('INVALID_ROW_IDENTITY');
    if(seen.has(row.key))throw Error('DUPLICATE_ROW_KEY');seen.add(row.key);
    const actualInventory=inventory(row),exclusions=[];
    if(row.status!=='completed')exclusions.push('not_completed');
    if(row.passed!==true)exclusions.push('row_not_passed');
    if(row.oracle?.passed!==true||!['integrity','code','documents'].every(k=>row.oracle?.[k]?.passed===true))exclusions.push('oracle_not_passed');
    if(!actualInventory.verified)exclusions.push('inventory_not_verified');
    if(!finite(row.elapsedMs))exclusions.push('missing_valid_elapsed');
    if(row.telemetry?.pending>0)exclusions.push('unsettled_telemetry');
    const oracleFailures=Object.fromEntries(['integrity','code','documents'].map(k=>[k,(row.oracle?.[k]?.checks||[]).filter(x=>x.passed!==true).map(x=>x.name)]));
    const terminalTaskSuccess=row.response?.result?.stopReason==='end_turn'&&!row.response?.error&&row.oracle?.passed===true&&['integrity','code','documents'].every(k=>row.oracle?.[k]?.passed===true)&&actualInventory.verified;
    return {key:row.key,difficulty:row.difficulty,repeat:row.repeat,flags:row.flags,status:row.status||'unreported',error:row.error||null,elapsedMs:finite(row.elapsedMs)?row.elapsedMs:null,firstOutputMs:finite(row.firstOutputMs)?row.firstOutputMs:null,validOutcome:exclusions.length===0,terminalTaskSuccess,exclusions,actualInventory,oracleFailures,tools:toolSummary(Array.isArray(row.tools)?row.tools:[]),approvals:permissionDecisions(Array.isArray(row.decisions)?row.decisions:[])};
  });
  const cells=Array.from({length:8},(_,mask)=>flagsFor(mask)).flatMap(flags=>DIFFICULTIES.map(difficulty=>{
    const match=row=>combo(row.flags)===combo(flags)&&row.difficulty===difficulty;
    return {combination:combo(flags),flags,difficulty,...summarizeRows(report.rows.filter(match),rows.filter(match),repetitions)};
  }));
  const byFlags=Array.from({length:8},(_,mask)=>flagsFor(mask)).map(flags=>{const match=row=>combo(row.flags)===combo(flags);return {combination:combo(flags),flags,...summarizeRows(report.rows.filter(match),rows.filter(match),DIFFICULTIES.length*repetitions)};});
  const totals=summarizeRows(report.rows,rows,24*repetitions);
  const visibility=totals.telemetry.provenance.jevProviderVisibilityRows;
  const jevVisibility=[visibility.direct ? `Direct Jev provider HTTP is visible in ${visibility.direct} recorded rows; provider transport/body latency, status, model and reported usage are separate from service evaluation outcomes.` : '', visibility.not_visible ? `Jev provider HTTP and usage are not visible in ${visibility.not_visible} forwarded-service rows.` : '', visibility.unreported || !report.rows.length ? 'Jev provider visibility is unreported for rows without explicit provenance.' : ''].filter(Boolean).join(' ');
  return {
    schema:'orqanix.actual-desktop-matrix-analysis.v1',sourceReportSha256:createHash('sha256').update(JSON.stringify(report)).digest('hex'),startedAt:report.startedAt??null,repetitions,preflight:report.fingerprint?.preflight===true,
    method:report.method||'Unreported',
    interpretation:{timing:'Send-to-terminal elapsed; setup excluded. Only completed, row-passed, oracle-passed and independently inventory-verified outcomes enter timing summaries or matched effects.',quality:'Code checks cover fixed synthetic cases. Document checks cover schema, exact supplied evidence links and specified examples; semantic quality is not evaluated.',experimentalScope:`Actual physical Electron app Settings and Send with fresh profiles/workspaces; authentication uses the normal packaged OAuth/session endpoint, with Gemini routed through the local current gateway. Jev routing observed: ${countText(totals.telemetry.provenance.jevMethods)}. The current_local_production_services mode runs current Jev production service code through the local gateway; forwarded_authenticated_packaged_endpoint uses the authenticated packaged endpoint. Debug Goose build, direct core tools; Code Mode is excluded. Consult source fingerprint for build identity.`,statistics:`${repetitions} planned repeats are exploratory observations, not statistical significance, general product reliability or proof across all tasks. Matched effects include only pairs where both outcomes passed; this selects survivors and must be read with exclusions and heterogeneity.`,usage:'Sum only each HTTP request’s final reported usage, never streaming cumulative snapshots. Primary totals include UI-associated calls such as background title generation. Missing usage is unknown, not zero. Provider total tokens may differ from input plus output; do not reconstruct totals. Jev provider usage fields are reported separately and are not added to Gemini totals.',jev:`${jevVisibility} Service completion does not imply evaluation or successful advice. A returned decision is not proof that the renderer applied it. Neither service nor provider HTTP latency is isolated model inference time.`,approvals:'Approval counts are recorded permission-policy decisions, not independent proof that each UI click was delivered. Denials can limit task completion and are reported separately; they do not automatically fail an otherwise verified outcome. Raw tool arguments are omitted.',availability:'Enabled flags and verified tool availability are separate from actual tool calls. Zero calls means an available capability was not used.',effort:'Null requested effort is unspecified desktop default; do not label it high.'},
    totals,cells,byFlags,factorialEffects:matchedEffects(rows,repetitions),rows,
  };
}

const fmt=value=>value===null?'—':Number(value).toFixed(2);
const span=value=>value.count?`${fmt(value.mean)} [${fmt(value.min)}–${fmt(value.max)}]`:'—';
const countText=value=>Object.entries(value).map(([key,n])=>`${key}:${n}`).join(', ')||'none';
const tokenText=value=>value.reportedSum===null?'unknown':`${value.reportedSum}${value.requestsMissing?` (+${value.requestsMissing} requests unknown)`:''}`;
const escape=value=>String(value).replaceAll('|','\\|').replaceAll('\n',' ');
export function renderMarkdown(analysis) {
  const a=analysis,t=a.totals;
  const lines=[`# Orqanix desktop matrix`, '', `${t.recorded}/${t.expected} rows recorded; ${t.completed} completed; ${t.validOutcomes} completed and verified; ${t.timeouts} timeouts; ${t.invalidOutcomes} recorded rows excluded from valid timing. ${t.missing} rows are missing. Oracle passed: ${t.oraclePassed}; code checks passed: ${t.codePassed}; document structure checks passed: ${t.documentStructurePassed}.`, '',
    `${t.terminalTaskSuccesses} rows have a recorded end_turn response, passing original checks and verified tool inventory. ${t.measurementExclusionsAfterTaskSuccess.length} of those successful tasks are still excluded from strict timing because their measurement record did not meet the frozen acceptance rules. A measurement exclusion is not necessarily a task failure.`, '',
    'J = Jev, N = native engineering, A = AxWise. Each cell shows **verified/completed/recorded (planned); mean [min–max] seconds** for valid outcomes only, followed by invalid outcomes (F), timeouts (T, included in F), and first-output mean seconds (FO) for those valid outcomes. Missing rows have no invented measurements.', '',
    '| Flags | Simple | Medium | Complex |','|---|---|---|---|'];
  for(const flags of a.byFlags){const values=DIFFICULTIES.map(d=>{const c=a.cells.find(c=>c.combination===flags.combination&&c.difficulty===d);return `${c.validOutcomes}/${c.completed}/${c.recorded} (${c.expected}); ${span(c.validElapsedSeconds)} s; F${c.invalidOutcomes} T${c.timeouts}; FO ${fmt(c.validFirstOutputSeconds.mean)} s`;});lines.push(`| ${flags.combination.toUpperCase()} | ${values.join(' | ')} |`);}
  lines.push('', `Setup is excluded. Failed or unfinished runs are never ranked as fast successes. ${a.repetitions} planned repetitions provide exploratory evidence only; ranges are observed min–max, not confidence intervals.`, '',
    '| Flags | Native calls / completed / errors | Native actions (attempts) | AxWise calls / completed / errors | Jev service outcomes; completed; timeout/cancel | Jev service mean [range] s | Reported Gemini total tokens |',
    '|---|---|---|---|---|---|---|');
  for(const f of a.byFlags){const j=f.telemetry.jev;lines.push(`| ${f.combination.toUpperCase()} | ${f.tools.native.called} / ${f.tools.native.completed} / ${f.tools.native.errors} | ${countText(f.tools.native.actions)} | ${f.tools.axwise.called} / ${f.tools.axwise.completed} / ${f.tools.axwise.errors} | ${j.requests}; ${j.statusCounts.completed||0}; ${j.timeoutsOrCancellations} | ${span(j.elapsedSeconds)} | ${tokenText(f.telemetry.model.usage.totalTokens)} |`);}
  lines.push('', 'Tool counts describe observed calls and successful ACP tool completion, not enabled flags alone. Totals include unsuccessful trials. Jev service completion is distinct from evaluation, provider HTTP completion and useful advice.', '',
    `Native tools called: ${countText(t.tools.native.names)}. AxWise tools called: ${countText(t.tools.axwise.names)}.`,
    `Native actions (attempts): ${countText(t.tools.native.actions)}. Action outcomes (called/completed/errors/unfinished): ${Object.entries(t.tools.native.actionOutcomes).map(([action, counts])=>`${action} ${counts.called}/${counts.completed}/${counts.errors}/${counts.unfinished}`).join('; ')||'none'}.`,
    'The hashline_edit tool supports read and edit actions; a hashline_edit call is not automatically an edit. guarded_edit_and_test identifies a safe_edit_and_test attempt from its tool semantics. These labels describe requested operations, not proof that a file change was committed or retained after rollback. Missing, invalid or conflicting action evidence stays unreported; other native tools have no action label in this summary. Raw arguments are omitted.',
    'Native-off still includes the existing Goose analyze tool, which uses Tree-sitter. The native flag adds ast_search, lsp_query, hashline_edit and safe_edit_and_test; it does not prohibit ordinary shell/write/edit calls. Creating a new document legitimately uses ordinary write because the native edit APIs operate on existing files.',
    `Jev service status: ${countText(t.telemetry.jev.statusCounts)}. Evaluation: ${countText(t.telemetry.jev.evaluationCounts)}. Returned advice: ${countText(t.telemetry.jev.returnedAdvice)}. Reasons: ${countText(t.telemetry.jev.reasons)}.`,
    a.interpretation.jev);
  if(t.telemetry.jevProvider.requests || t.telemetry.provenance.jevProviderVisibilityRows.direct){
    lines.push('', '| Flags | Jev provider visibility (rows) | Observed HTTP attempts / completed / timeout-cancel | Provider HTTP mean [range] s | HTTP statuses |', '|---|---|---|---|---|');
    for(const f of a.byFlags){const p=f.telemetry.jevProvider,v=f.telemetry.provenance.jevProviderVisibilityRows;lines.push(`| ${f.combination.toUpperCase()} | ${countText(v)} | ${v.direct||p.requests?`${p.requests} / ${p.statusCounts.completed||0} / ${p.timeoutsOrCancellations}`:'unknown'} | ${span(p.elapsedSeconds)} | ${countText(p.httpStatusCounts)} |`);}
    const p=t.telemetry.jevProvider;
    lines.push('', `Jev provider requested models: ${p.requestedModels.join(', ')||'unreported'}; returned: ${p.returnedModels.join(', ')||'unreported'}; requests without returned model: ${p.requestsWithoutReturnedModel}. Provider statuses: ${countText(p.statusCounts)}; errors: ${countText(p.errorCodes)}.`, `Final reported Jev provider usage fields (kept separate from Gemini totals): ${Object.entries(p.reportedUsageFields).map(([name,value])=>`${name} ${tokenText(value)}`).join('; ')||'unreported'}. Service/provider record IDs are retained for correlation; their overlapping elapsed times must not be added.`);
  }
  lines.push('',
    `Models requested: ${t.telemetry.model.requestedModels.join(', ')||'unreported'}; returned: ${t.telemetry.model.returnedModels.join(', ')||'unreported'}; requests without returned model: ${t.telemetry.model.requestsWithoutReturnedModel}. Requested effort: ${countText(t.telemetry.model.requestedEfforts)}. Model request statuses: ${countText(t.telemetry.model.statusCounts)}; errors: ${countText(t.telemetry.model.errorCodes)}.`,
    `Gemini HTTP attempts: ${t.telemetry.model.requests} (${t.telemetry.model.bySource.primary.requests} primary/UI, ${t.telemetry.model.bySource.axwise.requests} AxWise). Final reported cumulative tokens: input ${tokenText(t.telemetry.model.usage.inputTokens)}, output ${tokenText(t.telemetry.model.usage.outputTokens)}, total ${tokenText(t.telemetry.model.usage.totalTokens)}. Stream snapshots are not summed. UI title generation is included; unknown usage remains unknown.`, '',
    `Recorded permission decisions: ${t.approvals.recorded}; allowed ${t.approvals.allowed}, denied ${t.approvals.denied}, unreported ${t.approvals.unreported}. ${t.approvals.rowsWithDenials} rows have policy denials, of which ${t.approvals.rowsWithDenialsAndValidOutcome} still completed and passed. Denial reasons: ${countText(t.approvals.deniedReasons)}. ${a.interpretation.approvals}`);
  if(t.approvals.denied){lines.push('', '| Row with policy denial | Denials | Tool / readable reason |', '|---|---|---|');for(const row of a.rows.filter(r=>r.approvals.denied))lines.push(`| ${row.key} | ${row.approvals.denied} | ${row.approvals.observations.filter(d=>d.allow===false).map(d=>escape(`${d.name}: ${d.readableReason}`)).join('; ')} |`);}
  lines.push('',
    '| Matched factor enabled vs disabled | Valid pairs / planned | Mean delta [range] s | Faster / slower / tied | Excluded pairs |', '|---|---|---|---|---|');
  for(const [name,f]of Object.entries(a.factorialEffects))lines.push(`| ${name} | ${f.pairs} / ${f.expectedPairs} | ${span(f.deltaSeconds)} | ${f.onFaster} / ${f.onSlower} / ${f.ties} | ${f.excludedPairs} (${countText(f.exclusionCounts)}) |`);
  lines.push('', 'Positive delta means enabling the factor took longer. Pairs match difficulty, repeat and the other two flags; both outcomes must be valid. These are conditional effects among successful pairs, not unbiased population speedups.');
  for(const [name,f]of Object.entries(a.factorialEffects))lines.push(`- ${name} by difficulty: ${DIFFICULTIES.map(d=>`${d} ${span(f.byDifficulty[d].deltaSeconds)} s (n=${f.byDifficulty[d].pairs})`).join('; ')}. Other-flag strata and every paired observation are retained in analysis.json.`);
  if(t.failures.length){lines.push('', '| Nonvalid row | Status / error | Exclusions |', '|---|---|---|');for(const row of t.failures)lines.push(`| ${row.key} | ${escape(`${row.status}${row.error?`: ${row.error}`:''}`)} | ${escape(row.exclusions.join(', '))} |`);}
  lines.push('', `${a.interpretation.quality}`, '', `Recorded run protocol: ${a.method}`, '', `${a.interpretation.experimentalScope}`, '', 'The JSON analysis retains per-cell status counts, tool names, distinct Jev service/provider observations, provenance, permission-policy decisions, usage coverage, failed oracle checks, missing pairs and effect heterogeneity. No broad product-quality or statistical-significance claim follows from this matrix.', '');
  return lines.join('\n');
}
export async function main(argv) {
  if(argv.length!==2)throw Error('USAGE: node scripts/summarize-orqanix-matrix.mjs report.json output-directory');
  const input=resolve(argv[0]),output=resolve(argv[1]);
  if(input===join(output,'analysis.json')||input===join(output,'summary.md'))throw Error('OUTPUT_WOULD_OVERWRITE_INPUT');
  const analysis=analyzeReport(JSON.parse(await readFile(input,'utf8')));
  await mkdir(output,{recursive:true});
  await writeFile(join(output,'analysis.json'),`${JSON.stringify(analysis,null,2)}\n`,{mode:0o600});
  await writeFile(join(output,'summary.md'),renderMarkdown(analysis),{mode:0o600});
  return analysis;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).then(a=>console.log(JSON.stringify({recorded:a.totals.recorded,validOutcomes:a.totals.validOutcomes,missing:a.totals.missing}))).catch(error=>{console.error(error.message);process.exitCode=1;});
