import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, linkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { decidePermission } from './orqanix-benchmark-permissions.mjs';

function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), 'orqanix-permission-test-'));
  const workspace = join(parent, 'workspace'); mkdirSync(workspace); mkdirSync(join(workspace, 'src'));
  for (const file of ['README.md', 'src/math.ts', 'public.test.mjs']) writeFileSync(join(workspace, file), 'synthetic\n');
  writeFileSync(join(parent, 'outside.txt'), 'outside');
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const options = { workspace, permittedFiles: ['src/math.ts', 'PRD.md'], nodePath: process.execPath, publicTests: ['public.test.mjs'] };
  const call = (name, rawInput) => decidePermission({ _meta: { goose: { toolCall: { toolName: name } } }, rawInput }, options);
  return { parent, workspace, options, call, shell: command => call('developer__shell', { command }) };
}

test('common literal read commands and scoped chains do not cause artificial baseline denials', t => {
  const f = fixture(t);
  for (const command of ['pwd', 'ls', 'ls -la', 'cat -e README.md', 'cat README.md src/math.ts',
    'git status', 'git status --short', 'git --no-pager diff', 'git diff --stat', 'git diff -- src/math.ts', 'git diff src/math.ts', 'git diff --color=never src/math.ts', 'git log -p', 'git log --oneline -5',
    'cat README.md; echo "---"; cat src/math.ts; printf "%s\\n" done', 'cat README.md\ncat src/math.ts\n', 'cat README.md &&\ncat src/math.ts',
    "sed -n '1,240p' src/math.ts", "sed -n '$p' README.md", "cat README.md | head -n 20",
    "rg -n 'sum|average' src", 'rg --files', "rg --files -g '*.ts'", 'grep -n synthetic README.md',
    "find . -maxdepth 3 -type f -name '*.ts' -print", 'head -n 20 README.md', 'tail -n 5 README.md', 'wc -l README.md',
    'cd src && cat math.ts && cd .. && node --test public.test.mjs', `cd '${f.workspace}' && git status --short && node --test public.test.mjs`,
    `"${process.execPath}" --test public.test.mjs`]) assert.equal(f.shell(command).allow, true, command);
});

test('shell escapes, write-capable flags and command substitutions are rejected', t => {
  const f = fixture(t);
  for (const command of ['cat ../outside.txt', 'cat /etc/passwd', 'cd .. && pwd', 'cat .env',
    'env', 'printenv', 'echo $HOME', 'cat "$HOME/.ssh/id_rsa"', 'cat `pwd`', 'cat $(pwd)',
    'cat <(pwd)', 'cat README.md > PRD.md', 'cat README.md >> PRD.md', 'cat <<EOF',
    'cat README.md; rm README.md', 'cat README.md\nrm README.md', 'cat README.md || curl example.com',
    'cat README.md &', 'node -e "process.exit(0)"', 'node --import outside --test public.test.mjs',
    'node --test ../outside.txt', 'node --test src/math.ts', 'node --test', 'node --test *.mjs',
    'npm test', 'npm install', 'sh -c "cat README.md"', 'python -c "print(1)"',
    'find . -exec cat /etc/passwd \\;', 'find . -delete', 'find -L . -type f',
    "sed -i '' 's/x/y/' README.md", "sed -n '1e touch x' README.md", "sed -n '1w x' README.md",
    "rg --pre 'sh' x .", 'rg -f /etc/passwd .', 'grep -f /etc/passwd README.md',
    'rg --hidden --no-ignore x .',
    'git -c core.fsmonitor=x status', 'git --git-dir=/tmp/other status', 'git diff --ext-diff',
    'git diff --output=PRD.md', 'git status --porcelain -- /etc/passwd', 'git config --list',
    'cat "README.md', 'cat README.md\\', 'cat {README.md,/etc/passwd}', '/tmp/cat README.md',
    'cd src | cat math.ts', 'cat README.md &&']) assert.equal(f.shell(command).allow, false, command);
});

test('native/editor paths are confined and only declared deliverables are writable', t => {
  const f = fixture(t);
  const hash = 'a'.repeat(64);
  const edit = { path: 'src/math.ts', expected_sha256: hash, edits: [{ start_line: 1, end_line: 1,
    start_anchor: `1:${hash}`, end_anchor: `1:${hash}`, replacement: 'fixed\n' }] };
  const safe = { ...edit, test_command: ['node', '--test', 'public.test.mjs'], timeout_secs: 60 };
  for (const [name, input] of [['ast_search', { path: '.', language: 'typescript', query: '(identifier) @name' }],
    ['lsp_query', { path: 'src/math.ts', action: 'symbols' }], ['hashline_edit', { path: 'src/math.ts', action: 'read' }],
    ['hashline_edit', { ...edit, action: 'edit' }], ['safe_edit_and_test', safe],
    ['native_engineering__safe_edit_and_test', safe], ['developer__read', { path: 'README.md' }],
    ['developer__write', { path: 'PRD.md', content: '# Scope' }],
    ['developer__text_editor', { path: 'src/math.ts', command: 'str_replace', old_str: 'x', new_str: 'y' }]]) {
    assert.equal(f.call(name, input).allow, true, name);
  }
  for (const [name, input] of [['developer__write', { path: 'public.test.mjs', content: '' }],
    ['developer__write', { path: '../outside.txt', content: '' }], ['developer__write', { path: '.git/config', content: '' }],
    ['developer__text_editor', { path: 'README.md', command: 'str_replace' }],
    ['safe_edit_and_test', { ...safe, test_command: ['sh', '-c', 'anything'] }],
    ['safe_edit_and_test', { ...safe, timeout_secs: 121 }], ['safe_edit_and_test', { ...safe, expected_sha256: '' }],
    ['hashline_edit', { ...edit, path: 'public.test.mjs', action: 'edit' }],
    ['lsp_query', { path: '../outside.txt', action: 'symbols' }], ['ast_search', { path: '../', query: '(identifier) @name' }]]) {
    assert.equal(f.call(name, input).allow, false, name);
  }
});

test('symlinks and outside hardlinks cannot grant fixture access', t => {
  const f = fixture(t);
  symlinkSync(join(f.parent, 'outside.txt'), join(f.workspace, 'escape'));
  assert.equal(f.shell('cat escape').allow, false);
  assert.equal(f.shell('rg x .').allow, false);
  assert.equal(f.call('developer__read', { path: 'escape' }).allow, false);
  rmSync(join(f.workspace, 'escape'));
  linkSync(join(f.parent, 'outside.txt'), join(f.workspace, 'hardlink'));
  assert.equal(f.shell('cat hardlink').allow, false);
  assert.equal(f.call('ast_search', { path: '.', query: '(identifier) @x' }).allow, false);
});

test('permission metadata uses actual tool identity, never decorative title', t => {
  const f = fixture(t);
  assert.equal(decidePermission({ title: 'developer: shell', rawInput: { command: 'pwd' } }, f.options).allow, false);
  const result = f.call('developer__shell', { command: 'pwd' });
  assert.equal(result.name, 'developer__shell'); assert.deepEqual(result.input, { command: 'pwd' });
  assert.equal(decidePermission({ name: 'shell', rawInput: { command: 'pwd' } }, f.options).allow, true);
  assert.equal(f.call('evil__shell', { command: 'pwd' }).allow, false);
  assert.equal(f.call('axwise-local__create_prd', { brief: 'Synthetic booking product.' }).allow, true);
  assert.equal(f.call('axwise-local__simulate_interviews', { brief: 'Synthetic study', count: 2 }).allow, true);
  assert.equal(f.call('orqaly__ask_axwise', { question: 'Something' }).allow, false);
  assert.equal(f.call('desktop-utilities__search', { query: 'Something' }).allow, false);
  assert.equal(f.call('axwise-local__shell', { command: 'pwd' }).allow, false);
  assert.equal(f.call('todo_write', { content: '- [ ] Inspect synthetic fixture' }).allow, true);
  assert.equal(f.call('todo__todo_write', { content: '- [x] Inspect synthetic fixture' }).allow, true);
});

test('public test selection and tool cwd are exact and immutable', t => {
  const f = fixture(t);
  writeFileSync(join(f.workspace, 'other.test.mjs'), '');
  assert.equal(f.shell('node --test other.test.mjs').allow, false);
  assert.equal(f.call('developer__shell', { command: 'pwd', cwd: f.parent }).allow, false);
  assert.equal(f.call('developer__shell', { command: 'cat math.ts', cwd: join(f.workspace, 'src') }).allow, true);
  assert.equal(decidePermission({ name: 'shell', rawInput: { command: 'node --test public.test.mjs' } }, { ...f.options, publicTests: undefined }).allow, true);
  assert.equal(decidePermission({ name: 'shell', rawInput: { command: 'node --test public.test.mjs' } }, { ...f.options, permittedFiles: ['public.test.mjs'] }).allow, false);
});

test('current Goose tree/analyze/image schemas allow bounded fixture reads', t => {
  const f = fixture(t);
  writeFileSync(join(f.workspace, 'fixture.png'), 'synthetic image bytes');
  for (const [name, input] of [['tree', { path: '.', depth: 3 }], ['developer__tree', { path: 'src' }],
    ['analyze', { path: 'src/math.ts' }], ['analyze__analyze', { path: 'src', focus: 'sum', max_depth: 3, follow_depth: 2, force: false }],
    ['read_image', { source: 'fixture.png' }],
    ['developer__read_image', { source: join(f.workspace, 'fixture.png'), crop: { x: 0, y: 0, width: 50, height: 50 } }]]) {
    assert.equal(f.call(name, input).allow, true, name);
  }
  for (const [name, input] of [['tree', { path: '..' }], ['analyze', { path: '/etc' }],
    ['analyze', { path: '.', max_depth: -1 }], ['tree', { path: '.', depth: 100000 }],
    ['read_image', { source: 'https://example.com/image.png' }], ['read_image', { source: '../outside.txt' }],
    ['read_image', { source: 'README.md' }], ['read_image', { source: 'fixture.png', crop: { x: 0, y: 0, width: -1, height: 10 } }],
    ['load', { source: 'README.md' }], ['load', {}], ['summon__load', { source: '20260929_1', cancel: true }],
    ['delegate', { instructions: 'Do work' }], ['apps__create_app', { name: 'test' }],
    ['extensionmanager__manage_extensions', { action: 'enable' }]]) {
    assert.equal(f.call(name, input).allow, false, name);
  }
  assert.equal(f.call('load', {}).reason, 'load_reads_global_sources_not_fixture_files');
});

test('bounded AST-validated Node arithmetic checks do not require full script execution permission', t => {
  const f = fixture(t);
  const quote = source => `'${source.replaceAll("'", "'\\''")}'`;
  for (const source of ['console.log(Object.is(Math.floor(0 * 10000 / 10000), 0))',
    'console.log(Number.isSafeInteger(10), Number.isFinite(0 / 0), Number.isNaN(NaN))',
    'console.log(Math.round(1.25 * 100), Object.is(-0, 0), Math.PI)',
    'console.log(JSON.stringify({ value: [1, 2, null], ok: true }))',
    'console.log(JSON.parse("[1,2,3]"))',
    'console.log(1 < 2 ? "yes" : "no"); console.log(Number("42"), parseInt("ff", 16))',
    'Object.is(Math.floor(0), 0)', 'Number.MAX_SAFE_INTEGER + 1']) {
    assert.equal(f.shell(`node -e ${quote(source)}`).allow, true, source);
    assert.equal(f.shell(`node -p ${quote(source)}`).allow, true, source);
  }
  for (const source of ['process.env', 'console.log(process.env.HOME)', 'require("fs").readFileSync("/etc/passwd")',
    'import("node:fs")', 'fetch("https://example.com")', 'eval("1+1")', 'Function("return process")()',
    'console.log.constructor("return process")()', 'Math["floor"](1)', '({}).constructor.constructor("return process")()',
    'console.log(Object.getPrototypeOf({}))', 'console.log({__proto__: {}})',
    'console.log({ get x() { return process.env; } })', 'console.log({ toJSON() { return process.env; } })',
    'console.log(JSON.parse("{}", () => process.env))', 'console.log(...[1,2,3])',
    'const x = 1; console.log(x)', 'while(true){}', 'for(;;){}', 'Math.floor = eval',
    'console.log(Math.random())', 'console.log(/a+/)', 'console.log(9n ** 999999999n)',
    'console.log("x".repeat(1e9))', 'new Array(1e9)', 'console.log(globalThis)',
    'console.log((() => 1)())', 'console.log(1); throw 1', 'console.log(']) {
    assert.equal(f.shell(`node -e ${quote(source)}`).allow, false, source);
  }
  assert.equal(f.shell('node --require other -e "console.log(1)"').allow, false);
  assert.equal(f.shell('node -e "console.log(1)" extra').allow, false);
});
