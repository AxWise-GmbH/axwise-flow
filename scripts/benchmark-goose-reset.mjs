#!/usr/bin/env node
/** Opt-in local ACP comparison. Provider credentials are supplied only through child env. */
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TYPESCRIPT = '/private/tmp/orqaly-goose-ux-233/ui/node_modules/typescript/lib/typescript.js';
const require = createRequire(import.meta.url);
let typescriptParser;
export function loadTypescriptParser(path = DEFAULT_TYPESCRIPT) {
  if (!isAbsolute(path)) throw new Error('TypeScript parser path must be absolute');
  const parser = require(path);
  if (typeof parser.createSourceFile !== 'function' || typeof parser.isCallExpression !== 'function') throw new Error('TypeScript parser dependency is unavailable');
  typescriptParser = parser;
  return parser;
}
export const BUILTINS = ['developer', 'todo', 'code_execution'];
export const CASES = [
  { id: 'weather', prompt: 'What is the weather in Kaunas today? Celsius, concise, with a source link.' },
  { id: 'news_followup', prompt: 'What are the latest local headlines there? Give me three short bullets with dates and source links.' },
  { id: 'events_followup', prompt: 'What raves and techno parties are happening this week there and within 150 km? Rank up to three by fit for techno fans, explain your ranking briefly, and include dates, venues and source links. Say clearly if current dates or distance cannot be verified.' },
  { id: 'fixture_inspection', prompt: 'Inspect only the local fixture README.md and src/pricing.js. Explain the rounding behavior of totalWithTax and identify its zero-quantity result. Do not edit or run the code.' },
];
const SAFETY = 'This is a read-only benchmark. Use current public web information for current facts. Read local files only inside this temporary fixture workspace. Do not install software, modify files, access accounts, commit, push, deploy, disable TLS verification, or launch background tasks. If a capability is unavailable, report that limitation rather than working around it.';

export function parseOptions(argv, env = process.env) {
  const options = {
    relayUrl: env.ORQALY_LOCAL_RELAY_URL || 'http://127.0.0.1:47831',
    tokenEnv: 'ORQALY_LOCAL_TEST_TOKEN', userId: env.ORQALY_LOCAL_TEST_USER_ID || 'local-benchmark',
    vanilla: '/Applications/Goose.app/Contents/Resources/bin/goose',
    reset: '/private/tmp/orqaly-goose-ux-233/ui/desktop/src/bin/goose',
    utilities: join(REPOSITORY, 'packages/orqaly-goose-connector/src/utilities-mcp.mjs'),
    utilitiesConfig: join(REPOSITORY, 'packages/orqaly-goose-connector/preview.config.example.json'),
    node: process.execPath, repeats: 2, timeoutSeconds: 90, caseCount: CASES.length,
    searchCache: '/private/tmp/orqanix-reset-search-cache', typescript: DEFAULT_TYPESCRIPT, outputRoot: null, live: false, interactiveReview: false, help: false,
  };
  const flags = { '--relay-url': 'relayUrl', '--token-env': 'tokenEnv', '--user-id': 'userId',
    '--vanilla': 'vanilla', '--reset': 'reset', '--utilities': 'utilities', '--utilities-config': 'utilitiesConfig',
    '--node': 'node', '--typescript': 'typescript', '--search-cache': 'searchCache', '--repeats': 'repeats', '--timeout-seconds': 'timeoutSeconds', '--cases': 'caseCount', '--output-root': 'outputRoot' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--live') options.live = true;
    else if (arg === '--interactive-review') options.interactiveReview = true;
    else if (arg === '--help') options.help = true;
    else if (flags[arg] && argv[i + 1] && !argv[i + 1].startsWith('--')) options[flags[arg]] = argv[++i];
    else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  for (const key of ['repeats', 'timeoutSeconds', 'caseCount']) options[key] = Number(options[key]);
  if (![2, 3].includes(options.repeats)) throw new Error('--repeats must be 2 or 3');
  if (!Number.isInteger(options.timeoutSeconds) || options.timeoutSeconds < 10 || options.timeoutSeconds > 180) throw new Error('--timeout-seconds must be 10–180');
  if (!Number.isInteger(options.caseCount) || options.caseCount < 1 || options.caseCount > CASES.length) throw new Error('--cases must be 1–4');
  const relay = new URL(options.relayUrl);
  if (relay.protocol !== 'http:' || relay.hostname !== '127.0.0.1' || relay.username || relay.password || relay.search || relay.hash || relay.pathname !== '/') throw new Error('Relay must be an http://127.0.0.1:PORT origin');
  options.relayUrl = relay.origin;
  if (!/^[A-Z][A-Z0-9_]*$/.test(options.tokenEnv)) throw new Error('Token env name must be uppercase');
  for (const key of ['vanilla', 'reset', 'utilities', 'utilitiesConfig', 'node', 'searchCache', 'typescript']) {
    if (!isAbsolute(options[key])) throw new Error(`${key} must be an absolute path`);
  }
  return options;
}

export function redact(value, secrets = []) {
  if (typeof value === 'string') {
    let clean = value;
    for (const secret of secrets) if (secret) clean = clean.split(secret).join('[REDACTED]');
    return clean.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[REDACTED]');
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/thought|signature|authorization|api.?key|access.?token|refresh.?token/i.test(key))
    .map(([key, item]) => [key, redact(item, secrets)]));
  return value;
}

function inWorkspace(path, workspace) {
  if (typeof path !== 'string' || path.includes('\0')) return false;
  const rel = relative(workspace, resolve(workspace, path));
  return rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel);
}

/** Fail closed: this is an approval policy, not an OS sandbox or generic shell parser. */
export function permissionAllowed(toolCall, workspace) {
  const name = String(toolCall?._meta?.toolName || toolCall?.title || '').split(' · ')[0].toLowerCase().replaceAll(' ', '_').replace(':_', '__');
  const args = toolCall?.rawInput || {};
  if (name === 'code_execution__execute_typescript' || name === 'execute_typescript') return validateCodeModeScript(args.code, workspace).allowed;
  // Native Todo only updates the current isolated session's plan metadata.
  if (name === 'todo__todo_write') return Object.keys(args).length === 1 && typeof args.content === 'string' && args.content.length <= 8_000;
  if (/^desktop[-_]utilities__(?:search_web|get_weather|convert_currency)$/.test(name)) return true;
  if (/(?:^|__|: )(?:shell|execute_bash)$/.test(name)) {
    const command = args.command || args.script || '';
    return typeof command === 'string' && (/^(?:pwd|ls(?: -(?:l|a|la|al))?(?: (?:\.|src))?|cat (?:README\.md|src\/pricing\.js)|rg(?: -n)? [A-Za-z0-9_]+ (?:README\.md|src\/pricing\.js|src|\.))$/.test(command.trim()) || safeSearchCommand(command));
  }
  if (/(?:^|__|: )(?:read_file|read_text_file|text_editor)$/.test(name)) {
    if (args.command && args.command !== 'view') return false;
    return inWorkspace(args.path || args.file || args.file_path, workspace);
  }
  if (/(?:^|__|: )(?:load_skill|read_skill)$/.test(name)) return args.name === 'web-search';
  if (/(?:^|__|: )(?:list_functions|get_function_details|search_functions)$/.test(name)) return true;
  return false;
}

const CALLBACKS = new Map([
  ['Developer.shell', 'developer__shell'], ['Developer.textEditor', 'developer__text_editor'],
  ['Developer.readFile', 'developer__read_file'], ['Developer.readTextFile', 'developer__read_text_file'],
  ['Skills.loadSkill', 'load_skill'],
  ['Todo.todoWrite', 'todo__todo_write'],
  ['DesktopUtilities.getWeather', 'desktop-utilities__get_weather'],
  ['DesktopUtilities.convertCurrency', 'desktop-utilities__convert_currency'],
  ['DesktopUtilities.searchWeb', 'desktop-utilities__search_web'],
]);

/** This accepts a tiny grammar, not arbitrary TypeScript. Every nested tool call is approved here. */
export function validateCodeModeScript(code, workspace, parser = typescriptParser, policy = {}) {
  if (!parser) return { allowed: false, reason: 'TypeScript parser was not loaded' };
  if (typeof code !== 'string' || code.length > 12_000) return { allowed: false, reason: 'Code must be a bounded string' };
  const ts = parser;
  const callbacks = new Map([...CALLBACKS, ...(policy.additionalCallbacks || [])]);
  const permitted = policy.permissionAllowed || permissionAllowed;
  const calls = [];
  const bindings = new Set();
  const resultTools = new Map();
  const dataBindings = new Map();
  const reserved = new Set(['run', 'console', 'JSON', 'String', 'Promise', 'Developer', 'Skills', 'Todo', 'DesktopUtilities', '__proto__', 'constructor', 'prototype']);
  for (const name of callbacks.keys()) reserved.add(name.split('.')[0]);
  let nodes = 0;
  const reject = (reason) => { throw new Error(reason); };
  function count() { if (++nodes > 256) reject('AST exceeds benchmark bound'); }
  function copiedData(value, depth) {
    count();
    if (depth > 6) reject('Literal argument is too deep');
    if (Array.isArray(value)) return value.map((item) => copiedData(item, depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, copiedData(item, depth + 1)]));
    return value;
  }
  function isConstAssertion(node) {
    return ts.isAsExpression(node) && ts.isTypeReferenceNode(node.type)
      && ts.isIdentifier(node.type.typeName) && node.type.typeName.text === 'const'
      && !node.type.typeArguments?.length;
  }
  function stringifyArguments(node) {
    if (staticCall(node) !== 'JSON.stringify' || node.arguments.length < 1 || node.arguments.length > 3)
      reject('Only bounded JSON.stringify is allowed');
    if (node.arguments.length >= 2 && node.arguments[1].kind !== ts.SyntaxKind.NullKeyword) reject('JSON.stringify replacer is forbidden');
    if (node.arguments.length === 3 && (!ts.isNumericLiteral(node.arguments[2]) || ![0, 1, 2, 3, 4].includes(Number(node.arguments[2].text)))) reject('JSON.stringify indent must be a bounded literal');
    return node.arguments.length === 3 ? Number(node.arguments[2].text) : undefined;
  }
  function literal(node, depth = 0, allowBindings = true, allowSerialization = true) {
    count();
    if (!node || depth > 6) reject('Literal argument is too deep');
    if (policy.allowStaticLiteralData === true && isConstAssertion(node))
      return literal(node.expression, depth, allowBindings, allowSerialization);
    if (policy.allowStaticLiteralData === true && allowSerialization && ts.isCallExpression(node)) {
      const indent = stringifyArguments(node);
      const value = literal(node.arguments[0], depth + 1, allowBindings, false);
      const text = JSON.stringify(value, null, indent);
      if (text.length > 40_000) reject('Serialized literal exceeds benchmark bound');
      return text;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (allowBindings && ts.isIdentifier(node) && dataBindings.has(node.text)) return copiedData(dataBindings.get(node.text), depth);
    if (ts.isNumericLiteral(node)) { const value = Number(node.text); if (!Number.isFinite(value)) reject('Non-finite literal'); return value; }
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) return -literal(node.operand, depth + 1, allowBindings, allowSerialization);
    if (ts.isArrayLiteralExpression(node)) return node.elements.map((element) => literal(element, depth + 1, allowBindings, allowSerialization));
    if (ts.isObjectLiteralExpression(node)) {
      const result = Object.create(null);
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) reject('Only static object properties are allowed');
        const key = property.name.text;
        if (['__proto__', 'constructor', 'prototype'].includes(key) || Object.hasOwn(result, key)) reject('Unsafe or duplicate object property');
        result[key] = literal(property.initializer, depth + 1, allowBindings, allowSerialization);
      }
      return result;
    }
    reject('Arguments must be literal data or primitive const references; no calls, dynamic templates, spreads or operators');
  }
  function staticCall(node) {
    count();
    if (!ts.isCallExpression(node) || node.questionDotToken || node.typeArguments?.length
      || !ts.isPropertyAccessExpression(node.expression) || node.expression.questionDotToken
      || !ts.isIdentifier(node.expression.expression) || !ts.isIdentifier(node.expression.name)) reject('Only direct registered Namespace.function calls are allowed');
    return `${node.expression.expression.text}.${node.expression.name.text}`;
  }
  function callback(node) {
    const name = staticCall(node);
    const tool = callbacks.get(name);
    if (!tool || node.arguments.length !== 1 || !ts.isObjectLiteralExpression(node.arguments[0])) reject('Unknown callback or nonliteral argument object');
    const args = literal(node.arguments[0]);
    if (!permitted({ _meta: { toolName: tool }, rawInput: args }, workspace)) reject(`Nested callback needs operator review: ${name}`);
    if (calls.length >= 6) reject('At most six tool calls per wrapper');
    calls.push({ name, tool, args });
    return tool;
  }
  function projection(node) {
    if (!ts.isPropertyAccessExpression(node) || node.questionDotToken
      || !ts.isIdentifier(node.expression) || !ts.isIdentifier(node.name)) return false;
    const property = node.name.text;
    if (['__proto__', 'constructor', 'prototype'].includes(property)) return false;
    // Opt-in per originating callback. Only a direct immutable response field
    // may be projected; never methods, computed keys, nested paths or arguments.
    return Boolean(policy.responseProperties?.get(resultTools.get(node.expression.text))?.has(property));
  }
  function output(node) {
    count();
    if (ts.isIdentifier(node) && bindings.has(node.text)) return;
    if (projection(node)) return;
    if (ts.isObjectLiteralExpression(node)) {
      const keys = new Set();
      for (const property of node.properties) {
        if (policy.allowShorthandOutput && ts.isShorthandPropertyAssignment(property)
          && !property.objectAssignmentInitializer && bindings.has(property.name.text)
          && !reserved.has(property.name.text) && !keys.has(property.name.text)) {
          keys.add(property.name.text);
          count();
          continue;
        }
        if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) reject('Output objects require static property assignments');
        const key = property.name.text;
        if (['__proto__', 'constructor', 'prototype'].includes(key) || keys.has(key)) reject('Unsafe or duplicate output property');
        keys.add(key);
        if ((ts.isIdentifier(property.initializer) && bindings.has(property.initializer.text)) || projection(property.initializer)) count();
        else literal(property.initializer);
      }
      return;
    }
    if (ts.isAwaitExpression(node)) { callback(node.expression); return; }
    if (ts.isCallExpression(node)) {
      stringifyArguments(node);
      const first = node.arguments[0];
      if (!ts.isIdentifier(first) || !bindings.has(first.text)) reject('JSON.stringify requires one previously bound result');
      return;
    }
    literal(node);
  }
  function statement(node, isLast) {
    count();
    if (ts.isVariableStatement(node)) {
      if (node.modifiers?.length || !(node.declarationList.flags & ts.NodeFlags.Const) || node.declarationList.declarations.length !== 1) reject('Only one const binding per declaration is allowed');
      const declaration = node.declarationList.declarations[0];
      if (ts.isArrayBindingPattern(declaration.name)) {
        if (policy.allowStaticParallelCalls !== true || declaration.type || declaration.exclamationToken
          || !declaration.initializer || !ts.isAwaitExpression(declaration.initializer))
          reject('Parallel results require an explicitly enabled const await binding');
        const elements = declaration.name.elements;
        if (elements.length < 1 || elements.length > 3) reject('Parallel batches require one to three results');
        const names = elements.map((element) => {
          count();
          if (!ts.isBindingElement(element) || element.dotDotDotToken || element.initializer
            || element.propertyName || !ts.isIdentifier(element.name)
            || reserved.has(element.name.text) || bindings.has(element.name.text) || dataBindings.has(element.name.text))
            reject('Parallel results require unique plain output-only identifiers');
          return element.name.text;
        });
        if (new Set(names).size !== names.length) reject('Parallel result names must be unique');
        const awaited = declaration.initializer.expression;
        if (staticCall(awaited) !== 'Promise.all' || awaited.arguments.length !== 1
          || !ts.isArrayLiteralExpression(awaited.arguments[0])
          || awaited.arguments[0].elements.length !== names.length)
          reject('Promise.all requires one static array with an exact result count');
        // Validate every callback before admitting any result. Never accept a
        // promise variable, mapper, arbitrary computation, or result as input.
        for (const call of awaited.arguments[0].elements) callback(call);
        for (const name of names) bindings.add(name);
        return;
      }
      if (!ts.isIdentifier(declaration.name) || reserved.has(declaration.name.text) || bindings.has(declaration.name.text) || dataBindings.has(declaration.name.text)
        || declaration.type || declaration.exclamationToken || !declaration.initializer) reject('Only unique immutable const bindings are allowed');
      if (ts.isAwaitExpression(declaration.initializer)) {
        const tool = callback(declaration.initializer.expression);
        bindings.add(declaration.name.text);
        resultTools.set(declaration.name.text, tool);
      } else if (projection(declaration.initializer)) {
        // This output-only binding is intentionally NOT literal argument data.
        // It cannot feed tool callbacks or become a new response-field root.
        bindings.add(declaration.name.text);
      } else {
        const value = declaration.initializer;
        if (!(ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value) || ts.isNumericLiteral(value)
          || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(value.kind)
          || (ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(value.operand))
          || (policy.allowStaticLiteralData === true && (ts.isArrayLiteralExpression(value) || ts.isObjectLiteralExpression(value) || isConstAssertion(value))))) reject('Data bindings must contain direct permitted literals');
        // No aliases inside data declarations: prevent reference expansion and
        // mutation graphs. Callback arguments may read these frozen literals.
        dataBindings.set(declaration.name.text, literal(value, 0, false, false));
      }
      return;
    }
    if (ts.isExpressionStatement(node)) {
      const expression = node.expression;
      if (ts.isAwaitExpression(expression)) { callback(expression.expression); return; }
      if (!ts.isCallExpression(expression) || staticCall(expression) !== 'console.log') reject('Only direct await or console.log of a safe result is allowed');
      if (expression.arguments.length === 2 && policy.allowLabelledConsoleOutput === true) {
        const label = expression.arguments[0];
        if (!(ts.isStringLiteral(label) || ts.isNoSubstitutionTemplateLiteral(label)) || label.text.length > 200)
          reject('Console labels must be bounded string literals');
        output(expression.arguments[1]);
      } else {
        if (expression.arguments.length !== 1) reject('Only one safe console result is allowed');
        output(expression.arguments[0]);
      }
      return;
    }
    if (ts.isReturnStatement(node) && isLast) { if (node.expression) output(node.expression); return; }
    reject('Loops, assignments, nested functions, imports and other statements are forbidden');
  }
  function outerTry(node) {
    count();
    const clause = node.catchClause;
    if (policy.allowToolTryCatch !== true || node.finallyBlock || !clause || !clause.variableDeclaration
      || !ts.isIdentifier(clause.variableDeclaration.name) || clause.variableDeclaration.type
      || reserved.has(clause.variableDeclaration.name.text) || clause.block.statements.length !== 1)
      reject('Only an approved outer tool try/catch with one static error return is allowed');
    const returned = clause.block.statements[0];
    if (!ts.isReturnStatement(returned) || !returned.expression || !ts.isObjectLiteralExpression(returned.expression)
      || returned.expression.properties.length !== 1) reject('Catch may only return {error:String(caughtError)}');
    const property = returned.expression.properties[0];
    if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
      || property.name.text !== 'error') reject('Catch may only return the error property');
    const value = property.initializer;
    if (!ts.isCallExpression(value) || value.questionDotToken || value.typeArguments?.length
      || !ts.isIdentifier(value.expression) || value.expression.text !== 'String' || value.arguments.length !== 1
      || !ts.isIdentifier(value.arguments[0]) || value.arguments[0].text !== clause.variableDeclaration.name.text)
      reject('Catch may only convert its own error to a string');
    for (let index = 0; index < node.tryBlock.statements.length; index++)
      statement(node.tryBlock.statements[index], index === node.tryBlock.statements.length - 1);
  }
  try {
    const source = ts.createSourceFile('benchmark.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    if (source.parseDiagnostics.length || source.statements.length !== 1) reject('Require one well-formed async run wrapper');
    const wrapper = source.statements[0];
    if (!ts.isFunctionDeclaration(wrapper) || wrapper.name?.text !== 'run' || wrapper.parameters.length || wrapper.asteriskToken
      || wrapper.type || wrapper.typeParameters?.length || !wrapper.body || wrapper.modifiers?.length !== 1
      || wrapper.modifiers[0].kind !== ts.SyntaxKind.AsyncKeyword) reject('Require only async function run() with zero arguments');
    if (wrapper.body.statements.length === 1 && ts.isTryStatement(wrapper.body.statements[0])) outerTry(wrapper.body.statements[0]);
    else for (let index = 0; index < wrapper.body.statements.length; index++) statement(wrapper.body.statements[index], index === wrapper.body.statements.length - 1);
    if (!calls.length) reject('Wrapper must contain a permitted callback');
    return { allowed: true, calls };
  } catch (error) { return { allowed: false, reason: error.message }; }
}

// Intentionally narrow grammar; anything outside it needs operator review, not guessed approval.
export function shellWords(command) {
  if (typeof command !== 'string' || /[\n\r`$\\]/.test(command)) return null;
  const words = []; let word = ''; let quote = null; let active = false;
  for (const char of command) {
    if (quote) { if (char === quote) quote = null; else word += char; active = true; }
    else if (char === '"' || char === "'") { quote = char; active = true; }
    else if (/\s/.test(char)) { if (active) { words.push(word); word = ''; active = false; } }
    else if (';&<>'.includes(char)) return null;
    else if (char === '|') { if (active) words.push(word); words.push('|'); word = ''; active = false; }
    else { word += char; active = true; }
  }
  if (quote) return null;
  if (active) words.push(word);
  return words;
}

function publicHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(url.hostname)
      && !/^[\d.]+$/.test(url.hostname) && !/\.(?:local|internal|localhost|invalid)$/i.test(url.hostname);
  } catch { return false; }
}

export function safeSearchCommand(command) {
  const words = shellWords(command);
  if (!words) return false;
  return safeSearchWords(words);
}

function safeSearchWords(words) {
  const pipeline = words.indexOf('|');
  if (pipeline >= 0) {
    const stages = []; let stage = [];
    for (const word of words) { if (word === '|') { stages.push(stage); stage = []; } else stage.push(word); }
    stages.push(stage);
    if (stages[0][0] !== 'curl' || stages.length > 3 || stages.some((part) => !part.length)) return false;
    if (!safeSearchWords(stages[0])) return false;
    return stages.slice(1).every((part) => (part[0] === 'uvx' && part[1] === 'html2text' && part.slice(2).every((flag) => ['--ignore-links', '--ignore-images'].includes(flag)))
      || (part.length === 3 && part[0] === 'head' && part[1] === '-c' && /^\d+$/.test(part[2]) && Number(part[2]) <= 15_000));
  }
  if (words[0] === 'uvx' && words[1] === 'ddgs' && ['text', 'news'].includes(words[2])) {
    let query = false; let count = false;
    for (let i = 3; i < words.length; i += 2) {
      const [flag, value] = words.slice(i, i + 2);
      if (['-q', '--query'].includes(flag) && !query && value && value.length <= 1000) query = true;
      else if (['-m', '--max_results', '--max-results'].includes(flag) && !count && /^[1-5]$/.test(value)) count = true;
      else if (['-r', '--region'].includes(flag) && /^[a-z]{2}-[a-z]{2}$/.test(value)) continue;
      else if (['-t', '--timelimit'].includes(flag) && ['d', 'w', 'm', 'y'].includes(value)) continue;
      else return false;
    }
    return query && count;
  }
  if (words[0] === 'uvx' && words[1] === 'ddgs' && words[2] === 'extract') {
    return words.length === 5 && ['-u', '--url'].includes(words[3]) && publicHttps(words[4]);
  }
  if (words[0] === 'curl') {
    let url = false; let timeout = false;
    for (let i = 1; i < words.length; i++) {
      if (['-s', '-S', '-sS', '-L', '-sL', '-sSL', '--silent', '--show-error', '--location', '--fail', '-f'].includes(words[i])) continue;
      if (words[i] === '--max-time' && /^(?:[1-9]|1\d|20)$/.test(words[i + 1])) { timeout = true; i++; continue; }
      if (['--proto', '--proto-redir'].includes(words[i]) && words[i + 1] === '=https') { i++; continue; }
      if (!url && publicHttps(words[i])) { url = true; continue; }
      return false;
    }
    return url && timeout;
  }
  return false;
}

export function providerConfig(relayUrl) {
  return { name: 'custom_local_benchmark', engine: 'openai', display_name: 'Local benchmark Gemini',
    api_key_env: 'ORQALY_LOCAL_TEST_TOKEN', base_url: relayUrl, base_path: 'desktop/v1/chat/completions',
    requires_auth: true, supports_streaming: true, preserves_thinking: true, dynamic_models: false,
    timeout_seconds: 180, models: [{ name: 'orqaly-gemini', context_limit: 1048576, supports_vision: true }] };
}

export function childEnvironment({ profile, temporary, token, searchCache }, source = process.env) {
  // Do not inherit unrelated cloud, GitHub or provider credentials into the agent.
  const result = {};
  for (const key of ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TZ', 'SYSTEMROOT']) if (source[key]) result[key] = source[key];
  return { ...result, GOOSE_PATH_ROOT: profile, TMPDIR: `${temporary}/`,
    GOOSE_PROVIDER: 'custom_local_benchmark', GOOSE_MODEL: 'orqaly-gemini', GOOSE_MODE: 'approve',
    CODE_MODE_TOOL_DISCLOSURE: 'catalog', ORQALY_LOCAL_TEST_MODE: 'true', ORQALY_LOCAL_TEST_TOKEN: token,
    UV_CACHE_DIR: searchCache, UV_TOOL_DIR: join(profile, 'uv-tools'), UV_PYTHON_INSTALL_DIR: join(profile, 'uv-python'),
    UV_OFFLINE: '1', UV_PYTHON_DOWNLOADS: 'never', GOOSE_MAX_TURNS: '12',
    GOOSE_TELEMETRY_ENABLED: 'false', GOOSE_DISABLE_TELEMETRY: 'true' };
}

export class TurnRecorder {
  constructor(now = () => performance.now()) { this.now = now; this.started = now(); this.firstTextMs = null; this.firstToolResultMs = null; this.firstPostToolTextMs = null; this.text = ''; this.tools = new Map(); this.usage = []; this.denials = []; this.reviews = []; this.reviewMs = 0; this.reviewStarted = null; }
  beginReview() { this.reviewStarted = this.now(); }
  endReview(review) {
    const waitMs = this.reviewStarted === null ? 0 : this.now() - this.reviewStarted;
    this.reviewMs += waitMs; this.reviewStarted = null;
    this.reviews.push({ ...review, waitMs: Math.round(waitMs) });
  }
  update(message) {
    const update = message.params?.update;
    if (!update) return;
    const type = update.sessionUpdate || update.type;
    if (type === 'agent_message_chunk' && update.content?.type === 'text') {
      if (update.content.text?.trim() && this.firstTextMs === null) this.firstTextMs = this.now() - this.started;
      if (update.content.text?.trim() && this.firstPostToolTextMs === null) this.firstPostToolTextMs = this.now() - this.started;
      this.text += update.content.text || '';
    }
    if (type === 'tool_call' || type === 'tool_call_update') {
      const id = String(update.toolCallId);
      const previous = this.tools.get(id) || { id, startedMs: this.now() - this.started };
      const tool = { ...previous, ...(update._meta?.toolName ? { name: update._meta.toolName } : {}), ...(update.title ? { title: update.title } : {}), ...(update.kind ? { kind: update.kind } : {}), ...(update.status ? { status: update.status } : {}), ...(update.rawInput ? { input: update.rawInput } : {}) };
      this.firstPostToolTextMs = null;
      if (['completed', 'failed'].includes(update.status)) {
        tool.finishedMs = this.now() - this.started;
        if (update.status === 'completed' && this.firstToolResultMs === null) this.firstToolResultMs = tool.finishedMs;
      }
      this.tools.set(id, tool);
    }
    if (['usage_update', 'message_usage'].includes(type)) this.usage.push(update);
  }
  finish(response, error) {
    const urls = [...new Set(this.text.match(/https?:\/\/[^\s<>\])]+/g) || [])];
    const wallMs = this.now() - this.started;
    const reviewMs = this.reviewMs + (this.reviewStarted === null ? 0 : this.now() - this.reviewStarted);
    return { endToEndMs: Math.round(wallMs), wallEndToEndMs: Math.round(wallMs), reviewMs: Math.round(reviewMs), activeEndToEndMs: Math.round(Math.max(0, wallMs - reviewMs)),
      firstAssistantTextMs: this.firstTextMs === null ? null : Math.round(this.firstTextMs),
      firstCompletedToolMs: this.firstToolResultMs === null ? null : Math.round(this.firstToolResultMs),
      firstAnswerTextAfterLastToolMs: this.firstPostToolTextMs === null ? null : Math.round(this.firstPostToolTextMs),
      firstUsefulAnswerMs: null, firstUsefulAnswerNote: 'Requires human review; first assistant text may be commentary, not a useful answer.',
      status: error?.message?.startsWith('MANUAL_APPROVAL_REQUIRED') ? 'needs_operator_review' : error ? 'failed' : response?.stopReason === 'end_turn' ? 'completed' : response?.stopReason || 'unknown',
      error: error ? String(error.message || error) : null, stopReason: response?.stopReason || null,
      promptUsage: response?.usage || null, usageUpdates: this.usage, toolCount: this.tools.size,
      tools: [...this.tools.values()], permissionDenials: this.denials, permissionReviews: this.reviews, markdown: this.text, sourceUrls: urls,
      accuracy: 'not_assessed', sourceNote: 'Links are observed output, not evidence that claims or dates are correct.' };
  }
}

/** One pending exact decision; unsolicited lines never become future approvals. */
export class InteractiveReviewer {
  constructor({ input = process.stdin, emit = (value) => console.log(JSON.stringify(value)), secrets = [], timeoutMs = 60_000 } = {}) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error('Review deadline must be 1–60000 ms');
    this.emit = emit; this.secrets = secrets; this.timeoutMs = timeoutMs; this.pending = null; this.closed = false;
    this.lines = createInterface({ input, terminal: false });
    this.lines.on('line', (line) => {
      if (!this.pending) return;
      const decision = line.trim();
      if (decision === 'allow once' || decision === 'deny') this.cancel(decision === 'allow once' ? 'allow_once' : 'deny');
      else this.emit({ event: 'operator_review_input_required', instruction: 'Enter exactly "allow once" or "deny". No tool has been approved.' });
    });
    this.lines.on('close', () => { this.closed = true; this.cancel('input_closed'); });
  }
  review(call) {
    if (this.closed) return Promise.resolve('input_closed');
    if (this.pending) return Promise.resolve('concurrent_review_rejected');
    return new Promise((resolveReview) => {
      this.pending = { resolve: resolveReview, timer: setTimeout(() => this.cancel('timeout'), this.timeoutMs) };
      this.emit(redact({ event: 'operator_review_requested', permission: call, timeoutMs: this.timeoutMs,
        instruction: 'Inspect the exact tool input. Enter "allow once" to approve only this call, or "deny". Timeout denies.' }, this.secrets));
    });
  }
  cancel(outcome = 'cancelled') {
    if (!this.pending) return;
    const pending = this.pending; this.pending = null;
    clearTimeout(pending.timer); pending.resolve(outcome);
  }
  close() { this.closed = true; this.cancel('cancelled'); this.lines.close(); }
}

export class AcpClient {
  constructor(command, args, { env, cwd, secrets = [], spawnImpl = spawn, reviewer = null }) {
    this.nextId = 0; this.pending = new Map(); this.recorder = null; this.stderr = ''; this.workspace = cwd; this.secrets = secrets;
    this.reviewer = reviewer; this.reviewInProgress = false;
    this.child = spawnImpl(command, args, { env, cwd, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', (line) => {
      let message;
      try { message = JSON.parse(line); } catch { this.fail(new Error('Agent emitted non-JSON on ACP stdout')); return; }
      if (message.method && message.id !== undefined) { this.onRequest(message); return; }
      if (message.method) { this.recorder?.update(message); return; }
      const request = this.pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer); this.pending.delete(message.id);
      if (message.error) request.reject(new Error(`ACP ${request.method}: ${message.error.message || message.error.code}`));
      else request.resolve(message.result);
    });
    this.child.stderr.on('data', (chunk) => { this.stderr = `${this.stderr}${redact(chunk.toString(), this.secrets)}`.slice(-12_000); });
    this.child.stdin.on('error', (error) => this.fail(error));
    this.child.on('error', (error) => this.fail(error));
    this.child.on('exit', (code, signal) => this.fail(new Error(`Agent exited (${signal || code})`)));
  }
  send(message) { if (!this.child.stdin.destroyed && !this.child.stdin.writableEnded) this.child.stdin.write(`${JSON.stringify(message)}\n`); }
  fail(error) { this.reviewer?.cancel('agent_failed'); for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); } this.pending.clear(); }
  armTimeout(id, request) {
    request.timerStarted = performance.now();
    request.timer = setTimeout(() => { this.pending.delete(id); request.reject(new Error(`ACP deadline exceeded: ${request.method}`)); }, request.remainingMs);
  }
  pausePromptTimeouts() {
    for (const request of this.pending.values()) if (request.method === 'session/prompt') {
      clearTimeout(request.timer); request.remainingMs = Math.max(0, request.remainingMs - (performance.now() - request.timerStarted)); request.timer = null;
    }
  }
  resumePromptTimeouts() { for (const [id, request] of this.pending) if (request.method === 'session/prompt' && request.timer === null) this.armTimeout(id, request); }
  async onRequest(message) {
    if (message.method === 'session/request_permission') {
      const call = message.params?.toolCall;
      const known = this.recorder?.tools.get(String(call?.toolCallId));
      let allow = permissionAllowed({ ...call, ...(known?.name ? { _meta: { toolName: known.name } } : {}) }, this.workspace);
      if (!allow && this.reviewer && !this.reviewInProgress) {
        this.reviewInProgress = true; this.pausePromptTimeouts();
        const recorder = this.recorder; recorder?.beginReview();
        let outcome;
        try { outcome = await this.reviewer.review({ ...call, ...(known?.name ? { _meta: { toolName: known.name } } : {}) }); }
        catch { outcome = 'review_failed'; }
        finally { this.reviewInProgress = false; recorder?.endReview({ title: call?.title || 'unknown', input: call?.rawInput, outcome: outcome || 'review_failed' }); this.resumePromptTimeouts(); }
        allow = outcome === 'allow_once';
      }
      const kind = allow ? 'allow_once' : 'reject_once';
      const option = message.params?.options?.find((item) => item.kind === kind);
      if (!allow) this.recorder?.denials.push({ title: call?.title || 'unknown', input: call?.rawInput, reason: 'Needs operator review; outside bounded approval grammar' });
      this.send({ jsonrpc: '2.0', id: message.id, result: { outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } } });
      if (!allow) this.fail(new Error(`MANUAL_APPROVAL_REQUIRED: ${call?.title || 'unknown tool'}`));
      return;
    }
    // No client terminal or write-file capability is advertised. Keep unexpected calls closed.
    this.send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Client operation unavailable in read-only benchmark' } });
  }
  request(method, params, timeoutMs) {
    const id = ++this.nextId;
    return new Promise((resolvePromise, reject) => {
      const request = { method, resolve: resolvePromise, reject, remainingMs: timeoutMs, timer: null };
      this.pending.set(id, request);
      if (!(method === 'session/prompt' && this.reviewInProgress)) this.armTimeout(id, request);
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }
  async stop(sessionId) {
    if (this.closed) return;
    this.closed = true;
    this.reviewer?.close();
    if (sessionId) this.send({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } });
    this.child.stdin.end();
    const terminate = (signal) => {
      try { if (process.platform === 'win32') this.child.kill(signal); else process.kill(-this.child.pid, signal); } catch { /* already exited */ }
    };
    terminate('SIGTERM');
    await new Promise((done) => {
      if (this.child.exitCode !== null || this.child.signalCode !== null) { done(); return; }
      const timer = setTimeout(() => { terminate('SIGKILL'); done(); }, 1000);
      this.child.once('exit', () => { clearTimeout(timer); done(); });
    });
    this.lines.close(); this.fail(new Error('ACP client closed'));
  }
}

async function prepareArm(root, arm, options, token) {
  const directory = join(root, arm);
  const profile = join(directory, 'profile');
  const workspace = join(directory, 'workspace');
  const temporary = join(directory, 'tmp');
  for (const path of [join(profile, 'config/custom_providers'), join(workspace, 'src'), temporary]) await mkdir(path, { recursive: true, mode: 0o700 });
  await writeFile(join(profile, 'config/custom_providers/custom_local_benchmark.json'), JSON.stringify(providerConfig(options.relayUrl), null, 2), { flag: 'wx', mode: 0o600 });
  const config = { GOOSE_PROVIDER: 'custom_local_benchmark', GOOSE_MODEL: 'orqaly-gemini', GOOSE_MODE: 'approve', CODE_MODE_TOOL_DISCLOSURE: 'catalog',
    extensions: Object.fromEntries(BUILTINS.map((name) => [name, { enabled: true, type: 'platform', name }])) };
  // JSON is valid YAML. No token is included in this config.
  await writeFile(join(profile, 'config/config.yaml'), JSON.stringify(config, null, 2), { flag: 'wx', mode: 0o600 });
  await writeFile(join(workspace, 'README.md'), '# Pricing fixture\nRead-only inspection benchmark. totalWithTax rounds each complete line total to cents; it does not round each unit.\n', { flag: 'wx', mode: 0o600 });
  await writeFile(join(workspace, 'src/pricing.js'), 'export function totalWithTax(unitPrice, quantity, taxRate) {\n  return Math.round(unitPrice * quantity * (1 + taxRate) * 100) / 100;\n}\n', { flag: 'wx', mode: 0o600 });
  return { directory, profile, workspace, temporary, env: childEnvironment({ profile, temporary, token, searchCache: options.searchCache }) };
}

async function binaryFingerprint(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { path, sha256: hash.digest('hex') };
}

export function sessionInventory(extensionsResponse, toolsResponse) {
  if (!Array.isArray(extensionsResponse?.extensions) || !Array.isArray(toolsResponse?.tools)) throw new Error('ACP inventory response is incomplete');
  const extensions = extensionsResponse.extensions.map((entry) => {
    const extension = entry.extension || {};
    const name = extension.name || extension.server?.name;
    if (typeof name !== 'string' || typeof entry.extensionKey !== 'string') throw new Error('ACP extension inventory is malformed');
    return { key: entry.extensionKey, name, type: extension.type };
  }).sort((a, b) => a.key.localeCompare(b.key));
  const tools = toolsResponse.tools.map((tool) => {
    if (typeof tool.name !== 'string') throw new Error('ACP tool inventory is malformed');
    return { name: tool.name, permission: tool.permission ?? null,
      schemaSha256: createHash('sha256').update(JSON.stringify(tool.inputSchema || {})).digest('hex') };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { extensions, tools, toolCount: tools.length,
    skillToolNames: tools.filter((tool) => /(?:^|__)load_skill$/.test(tool.name)).map((tool) => tool.name) };
}

export function compareInventories(vanilla, reset) {
  const isUtility = (value) => /desktop[-_]utilities/.test(value);
  const names = (inventory, field) => inventory[field].filter((item) => !isUtility(item.name) && !isUtility(item.key || ''))
    .map((item) => field === 'tools' ? item.name : item.key).sort();
  const result = {};
  for (const field of ['extensions', 'tools']) {
    const left = names(vanilla, field); const right = names(reset, field);
    result[field] = { onlyVanilla: left.filter((name) => !right.includes(name)), onlyReset: right.filter((name) => !left.includes(name)) };
  }
  result.sameCommonInventory = Object.values(result).every((item) => !item.onlyVanilla.length && !item.onlyReset.length);
  return result;
}

export async function runBenchmark(options, { emit = (value) => console.log(JSON.stringify(value)) } = {}) {
  if (!options.live) throw new Error('Live calls are opt-in: pass --live after starting the local relay.');
  const token = process.env[options.tokenEnv];
  if (typeof token !== 'string' || token.length < 32 || /\s/.test(token)) throw new Error(`Set ${options.tokenEnv} to the relay test token (at least 32 non-whitespace characters)`);
  loadTypescriptParser(options.typescript);
  for (const path of [options.vanilla, options.reset, options.node, options.utilities, options.utilitiesConfig]) await access(path);
  const parent = options.outputRoot ? await realpath(options.outputRoot) : tmpdir();
  const root = await mkdtemp(join(parent, 'goose-reset-benchmark-'));
  const secrets = [token];
  const arms = {};
  for (const arm of ['vanilla', 'reset']) arms[arm] = await prepareArm(root, arm, options, token);
  const rows = [];
  const report = { schemaVersion: 'goose-reset-benchmark.v1', startedAt: new Date().toISOString(),
    model: 'orqaly-gemini (relay pinned to gemini-3.8-flash)', transport: 'ACP stdio', explicitlyEnabledBuiltins: BUILTINS,
    mode: 'approve', interactiveReview: options.interactiveReview, codeModeDisclosure: 'catalog', typescriptParser: options.typescript, relayOrigin: options.relayUrl, repeats: options.repeats,
    binaries: { vanilla: await binaryFingerprint(options.vanilla), reset: await binaryFingerprint(options.reset) },
    notes: ['Both arms explicitly enable developer/todo/CodeMode. Goose migration may also enable platform defaults; actual session extension/tool inventories are recorded and compared.',
      'Skills is a default-enabled platform extension exposing unprefixed load_skill; runtime inventories, not this label, determine each arm\'s available tools.',
      'Isolated Goose profiles and fixture workspace; HOME is unchanged. User-level skill discovery may still be available in upstream Goose.',
      'Prewarmed uvx cache is offline-only. Bounded ddgs/curl reads are approved; other commands pause the run for operator review.',
      'CodeMode has no nested approval boundary: a bounded TypeScript AST allowlist validates every callback before approving its wrapper.',
      'Interactive review, when enabled, requires an explicit allow-once decision per unknown call. Active timings exclude recorded review waits; wall timings and original event offsets include them.',
      'Cold/warm labels describe fresh versus reused local profile; provider cache temperature is unknown and reported token receipts take precedence.',
      'Failures and denials are included in latency summaries. This is not an accuracy evaluation.'], sessions: [], inventoryComparisons: [], rows };
  const save = async () => writeFile(join(root, 'report.json'), JSON.stringify(redact(report, secrets), null, 2), { mode: 0o600 });
  emit({ event: 'benchmark_started', root, repeats: options.repeats, cases: options.caseCount });
  await save();
  benchmark: for (let repeat = 0; repeat < options.repeats; repeat++) {
    // Alternate order to reduce warm-provider/order bias; each repeat starts a fresh session.
    for (const arm of repeat % 2 ? ['reset', 'vanilla'] : ['vanilla', 'reset']) {
      const paths = arms[arm];
      const conversationId = `bench_${randomUUID().replaceAll('-', '')}`;
      const mcpServers = arm === 'reset' ? [{ name: 'desktop-utilities', command: options.node,
        args: [options.utilities, '--config', options.utilitiesConfig, '--conversation-id', conversationId,
          '--account-hash', createHash('sha256').update(options.userId).digest('hex'), '--api-url', options.relayUrl], env: [] }] : [];
      const reviewer = options.interactiveReview ? new InteractiveReviewer({ secrets, emit: (event) => emit({ ...event, arm, repeat: repeat + 1 }) }) : null;
      const client = new AcpClient(options[arm], ['acp', '--with-builtin', BUILTINS.join(',')], { env: paths.env, cwd: paths.workspace, secrets, reviewer });
      let sessionId;
      let setupError;
      const setupStarted = performance.now();
      try {
        await client.request('initialize', { protocolVersion: 1, clientInfo: { name: 'goose-reset-benchmark', version: '1.0.0' }, clientCapabilities: { _meta: { goose: { customNotifications: true, toolCallLabelEnrichment: false } } } }, 30_000);
        const session = await client.request('session/new', { cwd: paths.workspace, mcpServers, _meta: { title: `Read-only benchmark ${arm} ${repeat + 1}` } }, 45_000);
        if (!session?.sessionId) throw new Error('ACP session/new returned no sessionId');
        sessionId = session.sessionId;
        const [extensions, tools] = await Promise.all([
          client.request('_goose/unstable/session/extensions/list', { sessionId }, 15_000),
          client.request('_goose/unstable/tools/list', { sessionId }, 15_000),
        ]);
        const inventory = sessionInventory(extensions, tools);
        report.sessions.push({ arm, repeat: repeat + 1, sessionId, inventory });
        emit({ event: 'session_inventory', arm, repeat: repeat + 1, extensions: inventory.extensions.map((item) => item.key), toolCount: inventory.toolCount, skillToolNames: inventory.skillToolNames });
        const vanilla = report.sessions.find((item) => item.arm === 'vanilla' && item.repeat === repeat + 1);
        const reset = report.sessions.find((item) => item.arm === 'reset' && item.repeat === repeat + 1);
        if (vanilla && reset) {
          const comparison = { repeat: repeat + 1, ...compareInventories(vanilla.inventory, reset.inventory) };
          report.inventoryComparisons.push(comparison);
          if (!comparison.sameCommonInventory) throw new Error('BENCHMARK_INVENTORY_MISMATCH: common native tools/extensions differ; inspect report before comparing timings');
        }
      } catch (error) { setupError = error; }
      const setupMs = Math.round(performance.now() - setupStarted);
      try {
        for (const [index, item] of CASES.slice(0, options.caseCount).entries()) {
          const recorder = new TurnRecorder(); client.recorder = recorder;
          let response; let failure = setupError;
          if (!failure) {
            try { response = await client.request('session/prompt', { sessionId, prompt: [{ type: 'text', text: `${index === 0 ? `${SAFETY}\n\n` : ''}${item.prompt}` }] }, options.timeoutSeconds * 1000); }
            catch (error) { failure = error; }
          }
          const row = redact({ arm, repeat: repeat + 1, case: item.id, prompt: item.prompt,
            cacheLabel: repeat === 0 && index === 0 ? 'cold_local_profile' : 'warm_local_profile', providerCache: 'unknown',
            sessionId: sessionId || null, setupMs: index === 0 ? setupMs : null, ...recorder.finish(response, failure),
            failurePhase: setupError ? index === 0 ? 'session_setup' : 'not_started' : failure ? 'prompt' : null,
            ...(setupError && index === 0 ? { endToEndMs: setupMs, wallEndToEndMs: setupMs, activeEndToEndMs: setupMs } : {}) }, secrets);
          rows.push(row); emit({ event: 'turn_finished', arm, repeat: repeat + 1, case: item.id, status: row.status, endToEndMs: row.endToEndMs, activeEndToEndMs: row.activeEndToEndMs, reviewMs: row.reviewMs, toolCount: row.toolCount });
          await save();
          if (row.status === 'needs_operator_review') {
            report.interruptedForReview = true;
            emit({ event: 'operator_review_required', arm, case: item.id, permissions: row.permissionDenials, report: join(root, 'report.json') });
            break benchmark;
          }
          if (row.error?.startsWith('BENCHMARK_INVENTORY_MISMATCH')) {
            report.incompatibleInventory = true;
            emit({ event: 'inventory_mismatch', report: join(root, 'report.json') });
            break benchmark;
          }
          if (failure) {
            setupError = new Error('Skipped because this ACP session failed earlier; original failure is retained in report.');
            await client.stop(sessionId); sessionId = undefined;
          }
        }
      } finally {
        client.recorder = null; await client.stop(sessionId);
        await writeFile(join(paths.directory, `stderr-${repeat + 1}.txt`), redact(client.stderr, secrets), { flag: 'wx', mode: 0o600 });
      }
    }
  }
  report.finishedAt = new Date().toISOString();
  report.summary = ['vanilla', 'reset'].map((arm) => {
    const selected = rows.filter((row) => row.arm === arm);
    const timed = selected.filter((row) => row.failurePhase !== 'not_started').map((row) => row.endToEndMs).sort((a, b) => a - b);
    const active = selected.filter((row) => row.failurePhase !== 'not_started').map((row) => row.activeEndToEndMs).sort((a, b) => a - b);
    return { arm, plannedCases: options.repeats * options.caseCount, recordedCases: selected.length,
      completed: selected.filter((row) => row.status === 'completed').length,
      failedOrStopped: selected.filter((row) => row.status !== 'completed').length,
      p50MsIncludingFailures: timed.length ? timed[Math.ceil(timed.length * 0.5) - 1] : null,
      p95MsIncludingFailures: timed.length ? timed[Math.ceil(timed.length * 0.95) - 1] : null,
      p50ActiveMsIncludingFailures: active.length ? active[Math.ceil(active.length * 0.5) - 1] : null,
      p95ActiveMsIncludingFailures: active.length ? active[Math.ceil(active.length * 0.95) - 1] : null };
  });
  await save(); emit({ event: 'benchmark_finished', report: join(root, 'report.json'), summary: report.summary });
  return { root, report };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/benchmark-goose-reset.mjs --live --relay-url http://127.0.0.1:PORT [--interactive-review] [--repeats 2|3] [--timeout-seconds 90] [--cases 1..4] [--output-root EXISTING_DIRECTORY]\nInteractive review prints sanitized unknown tool inputs and requires exactly "allow once" or "deny" on stdin within 60 seconds. It pauses the active prompt deadline and records review wait separately from wall and active completion times; default mode stops on unknown calls. Token is read from ORQALY_LOCAL_TEST_TOKEN; --token-env changes its source. Optional --vanilla, --reset, --utilities, --utilities-config and --node accept absolute paths. --typescript points to an existing TypeScript parser (default: fork ui/node_modules/typescript/lib/typescript.js); no dependencies are installed. No secrets are fetched or written. A new temporary report/profile directory is always created.');
    return;
  }
  const { report } = await runBenchmark(options);
  if (report.interruptedForReview || report.incompatibleInventory) process.exitCode = 3;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
