import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkPermission, CASES, hasSpecialistInvocation, inspectOutcome, parseOptions, specialistPrompt, summarize, SpecialistRecorder } from './benchmark-local-axwise.mjs';
import { loadTypescriptParser, validateCodeModeScript } from './benchmark-goose-reset.mjs';

test('live calls are opt-in and options have bounded repetitions/time', () => {
  assert.equal(parseOptions([]).live, false);
  assert.equal(parseOptions([]).specialistMode, 'natural');
  assert.equal(parseOptions(['--specialist-mode', 'explicit']).specialistMode, 'explicit');
  assert.throws(() => parseOptions(['--specialist-mode', 'forced']));
  assert.throws(() => parseOptions(['--repeats', '0']));
  assert.throws(() => parseOptions(['--repeats', '4']));
  assert.throws(() => parseOptions(['--timeout-seconds', '900']));
  assert.throws(() => parseOptions(['--arms', 'whatever']));
  assert.throws(() => parseOptions(['--only-case', 'unknown']));
  assert.throws(() => parseOptions(['--python', 'python3']));
  assert.equal(parseOptions(['--live', '--only-case', 'prd,simulation']).onlyCase, 'prd,simulation');
});

test('specialist permission does not permit unrelated tools or arbitrary shell', () => {
  assert.equal(benchmarkPermission({ _meta: { toolName: 'axwise-local__create_prd' }, rawInput: { brief: 'synthetic' } }, '/tmp/fixture'), true);
  assert.equal(benchmarkPermission({ _meta: { toolName: 'axwise-local__delete_all' }, rawInput: {} }, '/tmp/fixture'), false);
  assert.equal(benchmarkPermission({ _meta: { toolName: 'developer__shell' }, rawInput: { command: 'curl https://example.com --max-time 5' } }, '/tmp/fixture'), false);
  assert.equal(benchmarkPermission({ _meta: { toolName: 'developer__text_editor' }, rawInput: { command: 'view', path: '/etc/passwd' } }, '/tmp/fixture'), false);
});

test('Code Mode allows literal specialist callbacks but not dynamic code', () => {
  const parser = loadTypescriptParser();
  const check = (code) => benchmarkPermission({ _meta: { toolName: 'code_execution__execute_typescript' }, rawInput: { code } }, '/tmp/fixture', parser);
  const code = 'async function run() { const result = await AxwiseLocal.createPrd({ brief: "synthetic" }); console.log(result); }';
  assert.equal(check(code), true);
  assert.equal(validateCodeModeScript(code, '/tmp/fixture', parser).allowed, false, 'original harness remains restrictive');
  assert.equal(check('async function run() { const AxwiseLocal = "fake"; const result = await AxwiseLocal.createPrd({brief:"x"}); console.log(result); }'), false);
  assert.equal(check('async function run() { await AxwiseLocal.createPrd({ brief: await fetch("https://example.com") }); }'), false);
  assert.equal(check('async function run() { await Developer.shell({command:"rm -rf /tmp/fixture"}); }'), false);
});

test('observed Todo, tree and analysis wrapper accepts immutable structured literals and exact const assertions', () => {
  const parser = loadTypescriptParser();
  const code = `async function run() {
    await Todo.todoWrite({content: JSON.stringify([
      {id:"1",task:"Analyze selected synthetic interviews",status:"in_progress"},
      {id:"2",task:"Return the saved artifact",status:"pending"}
    ], null, 2)});
    const treeResult = await Developer.tree({path:"."});
    const transcripts = [{id:"interview-a",title:"Synthetic dispatcher",
      origin:"synthetic_transcript" as const,
      turns:[{speaker:"mara",role:"participant" as const,questionId:"q1",text:"I copy requests manually."}]}];
    const analysis = await AxwiseLocal.analyzeInterviews({decisionQuestion:"What delays work?",
      questions:["What makes work difficult?"],transcripts:transcripts});
    return {tree:treeResult,analysis:analysis};
  }`;
  assert.equal(benchmarkPermission({ name: 'execute_typescript', rawInput: { code } }, '/tmp/fixture', parser), true);
  assert.equal(hasSpecialistInvocation({ name: 'execute_typescript', input: { code } }, parser), true);
  assert.equal(confirmedExecutionForTest(code), false, 'permission/proposal still does not prove execution');
  const directData = 'async function run(){const items=[{task:"Read fixture",status:"pending" as const}]; await Todo.todoWrite({content:JSON.stringify(items,null,2)});}';
  assert.equal(benchmarkPermission({ name: 'execute_typescript', rawInput: { code: directData } }, '/tmp/fixture', parser), true);
  assert.equal(validateCodeModeScript(directData, '/tmp/fixture', parser).allowed, false, 'default reset grammar remains unchanged');
});

function confirmedExecutionForTest(code) {
  return inspectOutcome(CASES[0], { status: 'completed', markdown: 'Done.', tools: [
    { name: 'execute_typescript', status: 'completed', input: { code } },
  ] }).structuralChecks.axwiseUsed;
}

test('literal-data grammar rejects dynamic calls, casts, serializers, mutation and expansion aliases', () => {
  const parser = loadTypescriptParser();
  const check = (body) => benchmarkPermission({ name: 'execute_typescript', rawInput: { code: `async function run(){${body}}` } }, '/tmp/fixture', parser);
  for (const body of [
    'const rows=[{text:process.env.SECRET}]; await AxwiseLocal.analyzeInterviews({transcripts:rows});',
    'const rows=[{text:await fetch("https://example.org")}]; await AxwiseLocal.analyzeInterviews({transcripts:rows});',
    'const rows=[{get text(){return "secret";}}]; await AxwiseLocal.analyzeInterviews({transcripts:rows});',
    'const rows=[{text:"one"}]; rows.push({text:"two"}); await AxwiseLocal.analyzeInterviews({transcripts:rows});',
    'const rows=[{text:"one"}]; rows[0].text="changed"; await AxwiseLocal.analyzeInterviews({transcripts:rows});',
    'const rows=[{text:"one"}]; const alias=rows; await AxwiseLocal.analyzeInterviews({transcripts:alias});',
    'const rows=[{text:"one"}]; const more=[rows,rows]; await AxwiseLocal.analyzeInterviews({transcripts:more});',
    'const rows=[{text:"one"}]; await AxwiseLocal.analyzeInterviews({transcripts:[...rows]});',
    'await AxwiseLocal.createPrd({brief:"fixture" as any});',
    'await AxwiseLocal.createPrd({brief:"fixture" as string});',
    'await AxwiseLocal.createPrd({brief:("fixture" as const).constructor});',
    'await Todo.todoWrite({content:JSON.stringify([{toJSON(){return "unsafe";}}])});',
    'await Todo.todoWrite({content:JSON.stringify([{__proto__:{x:1}}])});',
    'await Todo.todoWrite({content:JSON.stringify([{task:"safe"}],()=>process.env)});',
    'await Todo.todoWrite({content:JSON.stringify([{task:"safe"}],null,20)});',
    'await Todo.todoWrite({content:JSON.stringify(JSON.stringify([{task:"safe"}]))});',
    'const result=await Developer.shell({command:"cat README.md"}); await Todo.todoWrite({content:JSON.stringify(result)});',
    'const JSON={stringify:"shadow"}; await Todo.todoWrite({content:JSON.stringify([])});',
    'await Todo.todoWrite({content:JSON["stringify"]([])});',
    'await Todo.todoWrite({content:JSON.stringify?.([])});',
    'const deep=[[[[[[["too deep"]]]]]]]; await AxwiseLocal.createPrd({brief:deep});',
  ]) assert.equal(check(body), false, body);
});

test('labelled console output permits a static label and safe result only', () => {
  const parser = loadTypescriptParser();
  const read = 'const result=await Developer.shell({command:"cat README.md"});';
  const check = (output) => benchmarkPermission({ name: 'execute_typescript', rawInput: { code: `async function run(){${read}${output}}` } }, '/tmp/fixture', parser);
  const output = 'console.log("README output:",JSON.stringify(result)); return {result};';
  assert.equal(check(output), true);
  assert.equal(validateCodeModeScript(`async function run(){${read}${output}}`, '/tmp/fixture', parser).allowed, false);
  for (const output of [
    'console.log(process.env.SECRET,JSON.stringify(result));',
    'console.log("label",JSON.stringify(result),process.env);',
    'console.log("label",JSON.stringify(result,()=>process.env));',
    'console.log("label",JSON.stringify(result,null,99));',
    'console.log("label",eval(result.stdout));',
    'console.log("label",result.constructor);',
    'console.log("label",fetch("https://example.org"));',
    `console.log("${'a'.repeat(201)}",result);`,
  ]) assert.equal(check(output), false, output);
});

test('common-case interference includes Code Mode nested calls and never passes a failed turn', () => {
  const item = CASES[0];
  assert.equal(inspectOutcome(item, { status: 'completed', markdown: '42', tools: [] }).structuralChecks.noSpecialistInterference, true);
  assert.equal(inspectOutcome(item, { status: 'failed', markdown: '', tools: [] }).structuralChecks.noSpecialistInterference, false);
  const row = { status: 'completed', markdown: '42', tools: [{ name: 'code_execution__execute_typescript', status: 'completed', input: { code: 'await AxwiseLocal.createPrd({brief:"x"})' } }] };
  assert.equal(inspectOutcome(item, row).structuralChecks.noSpecialistInterference, false);
});

test('discovery inventories and response prose never count as specialist invocation', () => {
  const row = { status: 'completed', markdown: '42', tools: [
    { name: 'code_execution__list_functions', result: { functions: ['AxwiseLocal.createPrd', 'axwise-local__analyze_interviews'] } },
    { name: 'code_execution__get_function_details', input: { names: ['AxwiseLocal.createPrd'] }, result: 'axwise-local specialist' },
    { name: 'desktop-utilities__search_web', result: 'AxwiseLocal.createPrd({brief:"x"})' },
    { name: 'execute_typescript', input: { code: 'async function run(){ // AxwiseLocal.createPrd({brief:"x"});\n console.log("AxwiseLocal.createPrd({brief:x})"); }' } },
  ] };
  assert.equal(inspectOutcome(CASES[0], row).structuralChecks.axwiseUsed, false);
  assert.equal(inspectOutcome(CASES[0], row).structuralChecks.noSpecialistInterference, true);
  assert.equal(hasSpecialistInvocation({ name: 'axwise-local__create_prd' }), true);
  assert.equal(hasSpecialistInvocation({ title: 'axwise-local: analyze interviews · sources' }), true);
  assert.equal(hasSpecialistInvocation({ name: 'execute_typescript', input: { code: 'async function run(){return await AxwiseLocal.simulateInterviews({scenario:"x"});}' } }), true);
});

test('fixture analyzer reads only two exact files with no extra behavior arguments', () => {
  const check = (rawInput) => benchmarkPermission({ name: 'developer__analyze', rawInput }, '/tmp/fixture');
  for (const path of ['README.md', 'src/pricing.js', '/tmp/fixture/README.md', '/tmp/fixture/src/pricing.js']) assert.equal(check({ path }), true, path);
  for (const path of ['.', 'src', '../secret', '/etc/passwd', 'src/other.js', 'README.md\u0000', 'src/../README.md']) assert.equal(check({ path }), false, path);
  assert.equal(check({ path: 'src/pricing.js', execute: true }), false);
  assert.equal(check({ path: 'src/pricing.js', command: 'write' }), false);
});

test('observed analyzer namespace and shorthand returns permit only bound fixture results', () => {
  const parser = loadTypescriptParser();
  const check = (code) => benchmarkPermission({ name: 'execute_typescript', rawInput: { code } }, '/tmp/fixture', parser);
  const valid = 'async function run(){const readme=await Analyze.analyze({path:"README.md"});const pricing=await Analyze.analyze({path:"src/pricing.js"});return {readme,pricing};}';
  assert.equal(check(valid), true);
  assert.equal(validateCodeModeScript(valid, '/tmp/fixture', parser).allowed, false);
  assert.equal(check(valid.replace('README.md', '/etc/passwd')), false);
  assert.equal(check(valid.replace('{readme,pricing}', '{readme,pricing,secret}')), false);
  assert.equal(check(valid.replace('{readme,pricing}', '{readme,readme}')), false);
  assert.equal(check(valid.replace('{readme,pricing}', '{readme = fetch("https://example.com"),pricing}')), false);
  assert.equal(check('async function run(){const treeRes=await Developer.tree({path:"."});const searchRes=await DesktopUtilities.searchWeb({query:"Bremen news",location:"Bremen"});return {treeRes,searchRes};}'), true);
  assert.equal(check('async function run(){const treeRes=await Developer.tree({path:"../"});return {treeRes};}'), false);
});

test('tree resolves dot relative to the isolated workspace and bounds traversal', () => {
  const check = (rawInput) => benchmarkPermission({ name: 'developer__tree', rawInput }, '/tmp/fixture');
  assert.equal(check({ path: '.', depth: 2 }), true);
  assert.equal(check({ path: '/tmp/fixture' }), true);
  for (const args of [{ path: '..' }, { path: 'src' }, { path: '/etc' }, { path: '.', depth: 4 }, { path: '.', depth: -1 }, { path: '.', depth: 1.5 }, { path: '.', recursive: true }]) assert.equal(check(args), false);
});

test('shell permits only exact fixture commands, including observed harmless separator', () => {
  const check = (rawInput) => benchmarkPermission({ name: 'developer__shell', rawInput }, '/tmp/fixture');
  assert.equal(check({ command: "cat README.md; echo '===SPLIT==='; cat src/pricing.js" }), true);
  for (const command of ["cat README.md; env; cat src/pricing.js", "cat README.md; echo $(env); cat src/pricing.js", 'cat README.md; cat /etc/passwd', 'cat README.md > copy', 'curl https://example.com', 'cat README.md\ncat /etc/passwd']) assert.equal(check({ command }), false);
  assert.equal(check({ command: 'cat README.md', cwd: '/etc' }), false);
});

test('safe response stdout projections are opt-in, immutable and output-only', () => {
  const parser = loadTypescriptParser();
  const check = (body) => benchmarkPermission({ name: 'execute_typescript', rawInput: { code: `async function run(){${body}}` } }, '/tmp/fixture', parser);
  const read = 'const readme = await Developer.shell({command:"cat README.md"}); const pricing = await Developer.shell({command:"cat src/pricing.js"});';
  for (const output of ['return {readme:readme.stdout,pricing:pricing.stdout};', 'return readme.stdout;', 'console.log(readme.stdout);', 'const text=readme.stdout; return text;']) assert.equal(check(read + output), true, output);
  assert.equal(check('return await Developer.analyze({path:"src/pricing.js"});'), true);
  assert.equal(validateCodeModeScript(`async function run(){${read}return readme.stdout;}`, '/tmp/fixture', parser).allowed, false, 'original reset harness remains restrictive by default');
  for (const attack of [
    'return readme.constructor;', 'return readme.__proto__;', 'return readme.prototype;',
    'return readme["stdout"];', 'return readme.stdout.length;', 'return readme.stdout.trim();',
    'return readme?.stdout;', 'readme.stdout="evil"; return readme;',
    'return {get text(){return readme.stdout;}};', 'return {...readme};', 'return {["text"]:readme.stdout};',
    'const text=readme.stdout; await Developer.shell({command:text});',
    'await Developer.shell({command:readme.stdout});', 'const text=readme.stdout; return text.constructor;',
    'return JSON.parse(readme.stdout);', 'return eval(readme.stdout);', 'await fetch(readme.stdout);',
  ]) assert.equal(check(read + attack), false, attack);
  assert.equal(check('const weather=await DesktopUtilities.getWeather({location:"Riga"}); return weather.stdout;'), false, 'projection only applies to allowed shell result');
});

test('explicit specialist mode changes only specialist prompts and uses the same request for either arm', () => {
  for (const item of CASES) {
    assert.equal(specialistPrompt(item, 'natural'), item.prompt);
    if (item.kind === 'common') assert.equal(specialistPrompt(item, 'explicit'), item.prompt);
    else {
      const prompt = specialistPrompt(item, 'explicit');
      assert.ok(prompt.startsWith(item.prompt));
      assert.match(prompt, /Use the local Axwise specialist extension if available/);
      assert.match(prompt, /If the extension is unavailable, answer directly/);
    }
  }
  assert.throws(() => specialistPrompt(CASES[0], 'unknown'));
  const rows = ['natural', 'explicit'].map((specialistMode, index) => ({ kind: 'specialist', arm: 'on', status: 'completed', endToEndMs: 1000 + index * 4000, specialistMode, structuralChecks: { axwiseUsed: index === 1 } }));
  const summary = summarize(rows).filter((row) => row.kind === 'specialist' && row.arm === 'on');
  assert.deepEqual(summary.map(({ specialistMode, medianCompletedMs }) => ({ specialistMode, medianCompletedMs })), [
    { specialistMode: 'natural', medianCompletedMs: 1000 }, { specialistMode: 'explicit', medianCompletedMs: 5000 },
  ]);
});

test('outer try/catch is allowed only for validated callbacks and a static caught-error string return', () => {
  const parser = loadTypescriptParser();
  const check = (body) => benchmarkPermission({ name: 'execute_typescript', rawInput: { code: `async function run(){${body}}` } }, '/tmp/fixture', parser);
  const body = 'try { const result=await AxwiseLocal.analyzeInterviews({decisionQuestion:"synthetic",questions:["q"],transcripts:[]}); return result; } catch(err) { return {error:String(err)}; }';
  assert.equal(check(body), true);
  assert.equal(validateCodeModeScript(`async function run(){${body}}`, '/tmp/fixture', parser).allowed, false);
  for (const catchBody of [
    'return {error:eval(err)};', 'return {error:String(other)};', 'return {error:String(err), secret:process.env};',
    'return {error:err.message};', 'return {error:String(err.constructor("evil"))};',
    'return {error:String?.(err)};', 'return {error:String<any>(err)};',
    'await Developer.shell({command:"git push"}); return {error:String(err)};',
    'return {["error"]:String(err)};', 'return {get error(){return String(err)}};',
  ]) assert.equal(check(`try { await Developer.shell({command:"cat README.md"}); } catch(err) {${catchBody}}`), false, catchBody);
  assert.equal(check('try {await Developer.shell({command:"cat README.md"});} catch(err){return {error:String(err)};} finally {await fetch("https://evil.example");}'), false);
  assert.equal(check('try {await Developer.shell({command:"git push"});} catch(err){return {error:String(err)};}'), false);
  assert.equal(check('const x="prefix"; try {await Developer.shell({command:"cat README.md"});} catch(err){return {error:String(err)};}'), false);
  assert.equal(check('try {await Developer.shell({command:"cat README.md"});} catch(Developer){return {error:String(Developer)};}'), false);
});

test('denied specialist proposals are distinguished from executed calls and unconfirmed calls', () => {
  const input = { code: 'async function run(){return await AxwiseLocal.createPrd({brief:"synthetic"});}' };
  const tool = { name: 'execute_typescript', status: 'failed', input };
  const row = { status: 'needs_operator_review', markdown: '', tools: [tool], permissionDenials: [{ input, reason: 'harness grammar' }] };
  let checks = inspectOutcome(CASES[0], row).structuralChecks;
  assert.equal(checks.axwiseProposed, true);
  assert.equal(checks.axwiseDenied, true);
  assert.equal(checks.axwiseUsed, false);
  assert.equal(checks.noSpecialistInterference, false);
  checks = inspectOutcome(CASES[0], { ...row, permissionDenials: [], tools: [{ ...tool, status: 'completed' }] }).structuralChecks;
  assert.equal(checks.axwiseUsed, false, 'completed Code Mode transport does not prove nested execution');
  assert.equal(checks.axwiseExecutionUnconfirmed, true);
  assert.equal(checks.axwiseDenied, false);
  checks = inspectOutcome(CASES[0], { ...row, permissionDenials: [], tools: [{ ...tool, status: 'in_progress' }] }).structuralChecks;
  assert.equal(checks.axwiseUsed, false);
  assert.equal(checks.axwiseExecutionUnconfirmed, true);
});

test('TS2322 compile failure in a completed wrapper is proposed but never counted as Axwise execution', () => {
  // Regression from local-axwise-benchmark-REnXir: ACP completed the wrapper,
  // but the generated union-array type prevented analyzeInterviews from running.
  const row = { status: 'needs_operator_review', markdown: '', permissionDenials: [], tools: [{
    title: 'execute typescript', status: 'completed',
    input: { code: 'async function run(){return await AxwiseLocal.analyzeInterviews({decisionQuestion:"Fixture",questions:["q"],outputs:["jobs_pains"],transcripts:[]});}' },
    result: [{ type: 'content', content: { type: 'text', text: 'Code Executed Successfully: false\n\n# Return Value\n```json\nnull\n```\n\n# STDOUT\n\n\n# STDERR\nLine 10, Column 7, TS2322: Type \'"jobs_pains"\' is not assignable to type \'"personas"\'.\n' } }],
  }] };
  const checks = inspectOutcome(CASES.find((item) => item.id === 'interview_analysis'), row).structuralChecks;
  assert.equal(checks.axwiseProposed, true);
  assert.equal(checks.axwiseDenied, false);
  assert.equal(checks.axwiseUsed, false);
  assert.equal(checks.axwiseExecutionUnconfirmed, true);
});

test('completed Code Mode needs both successful execution and an Axwise output marker', () => {
  const input = { code: 'async function run(){return await AxwiseLocal.createPrd({brief:"Fixture"});}' };
  const saved = 'Saved local Axwise JSON artifact: "/private/fixture/11111111-1111-4111-8111-111111111111.json".';
  const failure = 'The artifact did not pass its final quality review. No artifact was saved.';
  const checksFor = (text, overrides = {}) => inspectOutcome(CASES[0], { status: 'completed', markdown: '42', tools: [{
    name: 'execute_typescript', status: 'completed', input,
    result: [{ type: 'content', content: { type: 'text', text } }], ...overrides,
  }] });
  for (const text of ['Code Executed Successfully: true\n\n# Return Value\nnull',
    `Code Executed Successfully: false\n\n${saved}`,
    `Execution did not finish. ${saved}`,
    'Code Executed Successfully: true\n\n# STDERR\nUnknown tool AxwiseLocal.createPrd']) {
    const result = checksFor(text);
    assert.equal(result.structuralChecks.axwiseUsed, false, text);
    assert.equal(result.structuralChecks.axwiseExecutionUnconfirmed, true, text);
  }
  for (const marker of [saved, failure]) {
    const result = checksFor(`Code Executed Successfully: true\n\n# Return Value\n${marker}`);
    assert.equal(result.structuralChecks.axwiseUsed, true);
    assert.equal(result.structuralChecks.axwiseExecutionUnconfirmed, false);
    assert.equal(result.qualityAssessment, 'requires_human_review', 'execution evidence is not an artifact-quality verdict');
  }
  assert.equal(checksFor(`Code Executed Successfully: true\n${saved}`, { status: 'failed' }).structuralChecks.axwiseUsed, false);
  assert.equal(checksFor('', { result: { input: { code: `Code Executed Successfully: true\n${saved}` } } }).structuralChecks.axwiseUsed, false);
  assert.equal(checksFor('', { result: undefined, rawOutput: `Code Executed Successfully: true\n${saved}` }).structuralChecks.axwiseUsed, true);
});

test('direct named MCP terminal results count execution without implying a saved artifact', () => {
  for (const status of ['completed', 'failed']) {
    const checks = inspectOutcome(CASES[0], { status: 'completed', markdown: '42', tools: [{ name: 'axwise-local__create_prd', status }] }).structuralChecks;
    assert.equal(checks.axwiseUsed, true);
    assert.equal(checks.axwiseExecutionUnconfirmed, false);
  }
  const checks = inspectOutcome(CASES[0], { status: 'completed', markdown: '42', tools: [{ name: 'axwise-local__create_prd', status: 'in_progress' }] }).structuralChecks;
  assert.equal(checks.axwiseUsed, false);
  assert.equal(checks.axwiseExecutionUnconfirmed, true);
});

test('quality checks do not claim semantic accuracy', () => {
  const result = inspectOutcome(CASES.find((item) => item.id === 'prd'), { status: 'completed', markdown: 'Unknown: interview-a interview-b interview-c', tools: [] });
  assert.equal(result.structuralChecks.sourceIdsPresent, true);
  assert.equal(result.qualityAssessment, 'requires_human_review');
});

test('end_turn containing a Goose provider error is not a successful answer', () => {
  const row = { status: 'completed', markdown: 'Ran into this error: Server error (502 Bad Gateway)', tools: [] };
  assert.equal(inspectOutcome(CASES[0], row).structuralChecks.completed, false);
  assert.equal(inspectOutcome(CASES[0], row).structuralChecks.noSpecialistInterference, false);
});

test('summary separates failures and never counts fast failures as successful latency', () => {
  const rows = [
    { kind: 'common', arm: 'on', status: 'completed', endToEndMs: 1000, structuralChecks: { axwiseUsed: false } },
    { kind: 'common', arm: 'on', status: 'failed', endToEndMs: 1, structuralChecks: { axwiseUsed: true } },
  ];
  const row = summarize(rows).find((item) => item.kind === 'common' && item.arm === 'on');
  assert.equal(row.medianCompletedMs, 1000);
  assert.equal(row.failed, 1);
  assert.equal(row.unintendedAxwiseTurns, 1);
});

test('recorder retains tool results for inference timing and artifact review', () => {
  const recorder = new SpecialistRecorder(() => 10);
  recorder.update({ params: { update: { sessionUpdate: 'tool_call', toolCallId: 't1', _meta: { toolName: 'axwise-local__create_prd' }, status: 'in_progress' } } });
  recorder.update({ params: { update: { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed', rawOutput: { metrics: { inferenceMs: 50 } } } } });
  assert.equal(recorder.tools.get('t1').result.metrics.inferenceMs, 50);
});
