/** Permission policy for disposable, synthetic Orqanix benchmark workspaces.
 * This checks requested operations; approved Node tests are not OS sandboxed.
 * Keep the fixture's public tests immutable and run hidden oracles outside it.
 */
import { createRequire } from 'node:module';
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const require = createRequire(new URL('../../apps/orqaly/package.json', import.meta.url));
const { parse: parseShell } = require('shell-quote');
const { parse: parseJavaScript } = require('acorn');
const SPECIALISTS = new Set(['create_prd', 'analyze_interviews', 'simulate_interviews',
  'prepare_discovery', 'generate_personas', 'chat_with_persona', 'research_market', 'create_delivery_brief']);
const NATIVE = new Set(['ast_search', 'lsp_query', 'hashline_edit', 'safe_edit_and_test']);
const DEVELOPERS = new Set(['shell', 'text_editor', 'read', 'read_file', 'write', 'edit', 'tree', 'read_image']);
const TODOS = new Set(['todo_write']);
const ANALYZE = new Set(['analyze']);
const LOAD = new Set(['load']);
const DISCOVERY = new Set(['list_resources', 'search_available_extensions']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const boundedInteger = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const inside = (root, path) => path === root || path.startsWith(root + sep);
const deniedPart = part => part === '.git' || /^\.env(?:\.|$)/i.test(part) || ['.ssh', '.aws', '.npmrc', '.netrc'].includes(part);

function toolName(call) {
  const raw = call?._meta?.goose?.toolCall?.toolName || call?._meta?.toolName || call?.name || '';
  if (typeof raw !== 'string') return '';
  if (NATIVE.has(raw) || DEVELOPERS.has(raw) || TODOS.has(raw) || ANALYZE.has(raw) || LOAD.has(raw)) return raw;
  for (const [prefix, names] of [['native_engineering__', NATIVE], ['developer__', DEVELOPERS], ['axwise-local__', SPECIALISTS], ['todo__', TODOS], ['analyze__', ANALYZE], ['summon__', LOAD], ['extensionmanager__',DISCOVERY]]) {
    if (raw.startsWith(prefix) && names.has(raw.slice(prefix.length))) return raw;
  }
  return '';
}

function scope(options) {
  if (!isAbsolute(options?.workspace || '') || !Array.isArray(options.permittedFiles)) throw Error('invalid_fixture');
  const root = realpathSync(options.workspace);
  const requestedRoot = resolve(options.workspace);
  if (root === sep || !lstatSync(root).isDirectory()) throw Error('invalid_fixture');
  const path = (value, cwd = root, write = false) => {
    if (typeof value !== 'string' || !value || value.length > 4096 || /[\0\r\n]/.test(value)) return null;
    let absolute = resolve(cwd, value);
    // macOS exposes /tmp and /var as trusted aliases of /private paths. Map
    // only the host-selected root alias, never arbitrary model path symlinks.
    if (inside(requestedRoot, absolute)) absolute = resolve(root, relative(requestedRoot, absolute));
    if (!inside(root, absolute) || relative(root, absolute).split(sep).some(deniedPart)) return null;
    for (let at = absolute; inside(root, at); at = dirname(at)) {
      try { const info = lstatSync(at); if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory()) || (info.isFile() && info.nlink > 1)) return null; }
      catch (error) { if (!write || error.code !== 'ENOENT') return null; }
      if (at === root) break;
    }
    return absolute;
  };
  const editable = new Set(options.permittedFiles.map(file => path(file, root, true)));
  if (editable.has(null)) throw Error('invalid_fixture');
  const tests = options.publicTests;
  if (tests !== undefined && (!Array.isArray(tests) || tests.some(file => !path(file)))) throw Error('invalid_fixture');
  const publicTest = file => {
    const absolute = path(file);
    return !!absolute && lstatSync(absolute).isFile() && !editable.has(absolute) &&
      (tests ? tests.some(test => path(test) === absolute) : /(?:^|\/)public(?:[.-][\w-]+)?\.test\.[cm]?[jt]s$/.test(relative(root, absolute)));
  };
  const write = file => { const absolute = path(file, root, true); return !!absolute && editable.has(absolute); };
  // Recursive commands may not traverse a symlink or an outside hardlink.
  const cleanTree = (directory = root, allowGitMetadata = true) => {
    let count = 0;
    const visit = dir => readdirSync(dir, { withFileTypes: true }).every(entry => {
      if (++count > 10000) return false;
      if (deniedPart(entry.name)) return entry.name === '.git' && allowGitMetadata;
      const target = path(resolve(dir, entry.name));
      return !!target && (!entry.isDirectory() || visit(target));
    });
    return visit(directory);
  };
  const node = command => command === 'node' || (typeof options.nodePath === 'string' && command === options.nodePath);
  const testArgv = (argv, cwd = root) => Array.isArray(argv) && argv.length >= 3 && argv.length <= 10 &&
    argv.every(value => typeof value === 'string') && node(argv[0]) && argv[1] === '--test' &&
    argv.slice(2).every(file => !file.startsWith('-') && publicTest(resolve(cwd, file)));
  return { root, path, write, publicTest, cleanTree, node, testArgv };
}

// shell-quote does not reject all unmatched quotes/backticks itself. Reject
// expansions and unsupported lexical constructs before parsing the argv graph.
function literalShell(source) {
  if (typeof source !== 'string' || !source.trim() || source.length > 16000 || /[\0\r]/.test(source) || source.includes('\\\n')) return false;
  let quote = null, escaped = false;
  for (const char of source) {
    if (escaped) { escaped = false; continue; }
    if (quote === "'") { if (char === "'") quote = null; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '$' || char === '`') return false;
    if (quote === '"') { if (char === '"') quote = null; continue; }
    if (char === "'" || char === '"') quote = char;
    else if ('{}~'.includes(char)) return false;
  }
  return !quote && !escaped;
}

// shell-quote treats newlines as spaces; real shells treat unquoted newlines
// as command separators. Preserve that distinction before validating every command.
function normalizeNewlines(source) {
  let quote=null,escaped=false,result='';
  for(const char of source){
    if(escaped){result+=char;escaped=false;continue;}
    if(char==='\\'&&quote!=="'"){result+=char;escaped=true;continue;}
    if(quote){result+=char;if(char===quote)quote=null;continue;}
    if(char==='"'||char==="'"){quote=char;result+=char;continue;}
    if(char==='\n'){if(!/[;|&]\s*$/.test(result)&&result.trim())result+=';';continue;}
    result+=char;
  }
  return result.trim().replace(/;\s*$/,'');
}

function readArgs(args, context, cwd, { flags = /^$/, values = new Set(), minimum = 0 } = {}) {
  let paths = [], options = true;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (options && arg === '--') { options = false; continue; }
    if (options && values.has(arg)) {
      if (!/^\d{1,6}$/.test(args[++index] || '') || Number(args[index]) > 100000) return false;
    } else if (options && arg.startsWith('-')) { if (!flags.test(arg)) return false; }
    else paths.push(arg);
  }
  return paths.length >= minimum && paths.every(file => context.path(file, cwd));
}

function searchArgs(command, args, context, cwd) {
  let pattern = false, options = true, filesMode = false;
  const paths = [];
  const flags = command === 'rg'
    ? /^(?:-[nHiIlLcvwFxSoUa]+|--(?:line-number|no-heading|ignore-case|fixed-strings|files-with-matches|count|files|glob-case-insensitive|color=never))$/
    : /^-[nHiIlcvwFxEs]+$/;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (options && arg === '--') { options = false; continue; }
    if (options && ['-e', '--regexp'].includes(arg)) { if (typeof args[++index] !== 'string') return false; pattern = true; }
    else if (options && ['-g', '--glob', '--type', '-t'].includes(arg) && command === 'rg') {
      if (typeof args[++index] !== 'string' || args[index].length > 500) return false;
    } else if (options && ['-A', '-B', '-C', '-m', '--max-count', '--max-depth'].includes(arg)) {
      if (!/^\d{1,5}$/.test(args[++index] || '')) return false;
    } else if (options && arg.startsWith('-')) {
      if (!flags.test(arg) && !/^-[ABCm]\d{1,5}$/.test(arg)) return false;
      if (arg === '--files') filesMode = true;
    } else if (!pattern && !filesMode) pattern = true;
    else paths.push(arg);
  }
  return (pattern || filesMode) && paths.every(file => context.path(file, cwd)) && context.cleanTree();
}

function findArgs(args, context, cwd) {
  let index = 0;
  while (index < args.length && !args[index].startsWith('-') && args[index] !== '!') {
    if (!context.path(args[index++], cwd)) return false;
  }
  if (!index) return false;
  for (; index < args.length; index++) {
    const arg = args[index];
    if (['-print', '-print0', '-empty', '-not', '-a', '-o', '!'].includes(arg)) continue;
    if (['-name', '-iname', '-path'].includes(arg)) { if (!args[++index] || args[index].length > 500) return false; }
    else if (arg === '-type') { if (!['f', 'd'].includes(args[++index])) return false; }
    else if (['-maxdepth', '-mindepth'].includes(arg)) { if (!/^\d{1,2}$/.test(args[++index] || '')) return false; }
    else return false;
  }
  return context.cleanTree();
}

function gitArgs(args, context, cwd) {
  if (args[0] === '--no-pager') args = args.slice(1);
  const [action, ...rest] = args;
  if (!['status', 'diff', 'log'].includes(action)) return false;
  let paths = false;
  const status = /^(?:--(?:short|branch|porcelain(?:=[12])?|untracked-files=(?:all|normal|no)|ignored|no-renames)|-[sbu]+)$/;
  const diff = /^(?:--(?:no-ext-diff|no-textconv|stat|numstat|name-only|name-status|check|cached|staged|no-color|color=never|no-renames|summary|compact-summary|word-diff(?:=plain|=color|=porcelain)?)|-[puwb]|-U\d{1,4})$/;
  const log = /^(?:--(?:oneline|stat|no-color|no-ext-diff|no-textconv|max-count=\d{1,2})|-p|-[1-9]\d?)$/;
  return rest.every(arg => {
    if (arg === '--') { paths = true; return true; }
    if (paths) return !!context.path(arg, cwd);
    if (arg.startsWith('-')) return (action === 'status' ? status : action === 'diff' ? diff : log).test(arg);
    return ['diff','log'].includes(action) && (arg === 'HEAD'||!!context.path(arg,cwd));
  });
}

const PURE_MATH = new Set(['abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atanh', 'atan2', 'cbrt',
  'ceil', 'clz32', 'cos', 'cosh', 'exp', 'expm1', 'floor', 'fround', 'hypot', 'imul', 'log', 'log1p',
  'log2', 'log10', 'max', 'min', 'pow', 'round', 'sign', 'sin', 'sinh', 'sqrt', 'tan', 'tanh', 'trunc']);
const PURE_NUMBER = new Set(['isFinite', 'isInteger', 'isNaN', 'isSafeInteger', 'parseFloat', 'parseInt']);
const PURE_CONVERSIONS = new Set(['Number', 'String', 'Boolean', 'parseInt', 'parseFloat', 'isFinite', 'isNaN']);
const PURE_CONSTANTS = {
  Math: new Set(['E', 'LN10', 'LN2', 'LOG10E', 'LOG2E', 'PI', 'SQRT1_2', 'SQRT2']),
  Number: new Set(['EPSILON', 'MAX_SAFE_INTEGER', 'MIN_SAFE_INTEGER', 'MAX_VALUE', 'MIN_VALUE', 'NaN', 'POSITIVE_INFINITY', 'NEGATIVE_INFINITY']),
};
const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function pureJavaScript(source) {
  if (typeof source !== 'string' || !source.trim() || Buffer.byteLength(source) > 16000) return false;
  const program = parseJavaScript(source, { ecmaVersion: 2022, sourceType: 'script' });
  let nodes = 0;
  const member = node => node?.type === 'MemberExpression' && !node.computed && !node.optional &&
    node.object.type === 'Identifier' && node.property.type === 'Identifier'
    ? [node.object.name, node.property.name] : null;
  const expression = (node, depth = 0) => {
    if (!node || ++nodes > 512 || depth > 32) return false;
    const child = value => expression(value, depth + 1);
    switch (node.type) {
      case 'Literal': return !node.regex && !node.bigint &&
        (node.value === null || ['string', 'boolean', 'number'].includes(typeof node.value));
      case 'Identifier': return ['undefined', 'NaN', 'Infinity'].includes(node.name);
      case 'ArrayExpression': return node.elements.length <= 256 && node.elements.every(child);
      case 'ObjectExpression': return node.properties.length <= 128 && node.properties.every(property => {
        if (property.type !== 'Property' || property.kind !== 'init' || property.method || property.computed || property.shorthand) return false;
        const key = property.key.type === 'Identifier' ? property.key.name : property.key.type === 'Literal' ? String(property.key.value) : null;
        return key !== null && !PROTOTYPE_KEYS.has(key) && child(property.value);
      });
      case 'UnaryExpression': return ['+', '-', '!', '~', 'typeof', 'void'].includes(node.operator) && child(node.argument);
      case 'BinaryExpression': return ['+', '-', '*', '/', '%', '**', '==', '!=', '===', '!==', '<', '<=', '>', '>=', '|', '&', '^', '<<', '>>', '>>>'].includes(node.operator) && child(node.left) && child(node.right);
      case 'LogicalExpression': return ['&&', '||', '??'].includes(node.operator) && child(node.left) && child(node.right);
      case 'ConditionalExpression': return child(node.test) && child(node.consequent) && child(node.alternate);
      case 'MemberExpression': {
        const pair = member(node);
        return !!pair && PURE_CONSTANTS[pair[0]]?.has(pair[1]) === true;
      }
      case 'CallExpression': {
        if (node.optional || node.arguments.length > 32 || !node.arguments.every(child)) return false;
        if (node.callee.type === 'Identifier') return PURE_CONVERSIONS.has(node.callee.name) && node.arguments.length >= 1 && node.arguments.length <= 2;
        const pair = member(node.callee);
        if (!pair) return false;
        const [owner, method] = pair;
        if (owner === 'Math') return PURE_MATH.has(method);
        if (owner === 'Number') return PURE_NUMBER.has(method) && node.arguments.length >= 1 && node.arguments.length <= 2;
        if (owner === 'Object') return method === 'is' && node.arguments.length === 2;
        if (owner === 'JSON') return method === 'parse' && node.arguments.length === 1 || method === 'stringify' && node.arguments.length >= 1 && node.arguments.length <= 3;
        return owner === 'console' && method === 'log';
      }
      default: return false;
    }
  };
  return program.body.length >= 1 && program.body.length <= 16 &&
    program.body.every(statement => statement.type === 'ExpressionStatement' && expression(statement.expression));
}

function shellAllowed(input, context) {
  if (!literalShell(input.command) || (input.timeout_secs !== undefined && !boundedInteger(input.timeout_secs, 1, 120))) return false;
  let cwd = context.root;
  for (const field of ['cwd', 'working_dir', 'workdir']) if (input[field] !== undefined) {
    const chosen = context.path(input[field]);
    if (!chosen || !lstatSync(chosen).isDirectory()) return false;
    cwd = chosen;
  }
  const parsed = parseShell(normalizeNewlines(input.command), () => { throw Error('shell_expansion'); });
  const groups = [[]]; const separators = [];
  for (const token of parsed) {
    if (typeof token === 'string') groups.at(-1).push(token);
    else if (['&&', '|', ';'].includes(token?.op)) { separators.push(token.op); groups.push([]); }
    else return false;
  }
  if (groups.length > 20 || groups.some(group => !group.length)) return false;
  return groups.every((argv, index) => {
    let [command, ...args] = argv;
    if (context.node(command)) return context.testArgv(argv, cwd) ||
      args.length === 2 && ['-e', '--eval', '-p', '--print'].includes(args[0]) && pureJavaScript(args[1]);
    if (command.includes('/')) {
      if (!['/bin', '/usr/bin', '/usr/local/bin', '/opt/homebrew/bin'].includes(dirname(command))) return false;
      command = basename(command);
    }
    if (command === 'cd') {
      if (index > 0 && separators[index - 1] === '|' || separators[index] === '|' || args.length !== 1) return false;
      const target = context.path(args[0], cwd);
      if (!target || !lstatSync(target).isDirectory()) return false;
      cwd = target; return true;
    }
    if (command === 'pwd') return args.length === 0 || args.length === 1 && ['-L', '-P'].includes(args[0]);
    if (command === 'echo') return args.length <= 50 && args.every(a=>a.length<=4096);
    if (command === 'printf') return args.length>0 && args.length<=50 && !args[0].startsWith('-') && args.every(a=>a.length<=4096) && !/%\d{6,}/.test(args[0]);
    if (command === 'cat') return readArgs(args, context, cwd, { flags: /^-[benstvETAu]+$/, minimum: 1 });
    if (command === 'ls') return readArgs(args, context, cwd, { flags: /^(?:-[aAlhF1RtdSr]+|--color=never)$/ }) && context.cleanTree();
    if (['head', 'tail'].includes(command)) return readArgs(args, context, cwd, { flags: /^(?:-[qv]|-\d{1,5})$/, values: new Set(['-n', '-c']), minimum: index && separators[index - 1] === '|' ? 0 : 1 });
    if (command === 'wc') return readArgs(args, context, cwd, { flags: /^-[clmwL]+$/, minimum: index && separators[index - 1] === '|' ? 0 : 1 });
    if (['rg', 'grep'].includes(command)) return searchArgs(command, args, context, cwd);
    if (command === 'find') return findArgs(args, context, cwd);
    if (command === 'git') return gitArgs(args, context, cwd);
    if (command === 'sed') {
      if (args[0] === '-n') args = args.slice(1);
      if (args[0] === '-e') args = args.slice(1);
      const [program, ...files] = args;
      return typeof program === 'string' && /^(?:(?:\d+|\$)(?:,(?:\d+|\$))?)?[pn](?:;\s*(?:(?:\d+|\$)(?:,(?:\d+|\$))?)?[pn])*$/.test(program) &&
        (files.length > 0 || index > 0 && separators[index - 1] === '|') && files.every(file => !file.startsWith('-') && context.path(file, cwd));
    }
    return false;
  });
}

function guardedEdits(input) {
  return /^[a-f0-9]{64}$/.test(input.expected_sha256 || '') && Array.isArray(input.edits) &&
    input.edits.length > 0 && input.edits.length <= 100 && input.edits.every(edit => object(edit) &&
      boundedInteger(edit.start_line, 1, 100000) && boundedInteger(edit.end_line, edit.start_line, 100000) &&
      /^\d+:[a-f0-9]{64}$/.test(edit.start_anchor || '') && /^\d+:[a-f0-9]{64}$/.test(edit.end_anchor || '') &&
      typeof edit.replacement === 'string' && Buffer.byteLength(edit.replacement) <= 128000);
}

/** publicTests optionally pins exact immutable test paths (recommended).
 * Without it, only existing public*.test.{js,mjs,cjs,ts,mts,cts} files qualify.
 */
export function decidePermission(toolCall, options) {
  const name = toolName(toolCall);
  const input = toolCall?.rawInput ?? toolCall?._meta?.goose?.toolCall?.arguments ?? {};
  const result = (allow, reason) => ({ allow, reason, name, input });
  try {
    if (!name || !object(input) || Buffer.byteLength(JSON.stringify(input)) > 256000) return result(false, 'unknown_tool_or_invalid_input');
    const context = scope(options);
    const short = name.includes('__') ? name.split('__').at(-1) : name;
    // Current Goose load is a summon recipe/agent/task loader, NOT a file reader.
    // Even no-argument discovery scans global sources outside this fixture.
    if (short === 'load') return result(false, 'load_reads_global_sources_not_fixture_files');
    if(name.startsWith('extensionmanager__')&&DISCOVERY.has(short))return result(true,'read_only_registered_tool_discovery');
    let allow = false;
    if (short === 'todo_write' && (name === 'todo_write' || name === 'todo__todo_write')) {
      allow = true; // Session-local plan state; no model-selected path or executable.
    } else if (name.startsWith('axwise-local__')) {
      // These exact tools accept selected text/immutable artifact references,
      // perform bounded inference, and write only host-selected account storage.
      allow = SPECIALISTS.has(short);
    } else if (short === 'shell') allow = shellAllowed(input, context);
    else if (short === 'tree') allow = !!context.path(input.path) && context.cleanTree() &&
      (input.depth === undefined || boundedInteger(input.depth, 0, 16));
    else if (short === 'analyze') allow = !!context.path(input.path) && context.cleanTree() &&
      (input.focus === undefined || typeof input.focus === 'string' && input.focus.length <= 1000) &&
      (input.max_depth === undefined || boundedInteger(input.max_depth, 0, 16)) &&
      (input.follow_depth === undefined || boundedInteger(input.follow_depth, 0, 16)) &&
      (input.force === undefined || typeof input.force === 'boolean');
    else if (short === 'read_image') {
      const image = context.path(input.source);
      allow = !!image && lstatSync(image).isFile() && lstatSync(image).size <= 20 * 1024 * 1024 &&
        /\.(?:png|jpe?g|gif|webp)$/i.test(image) &&
        (input.crop === undefined || input.crop === null || object(input.crop) &&
          ['x', 'y', 'width', 'height'].every(key => boundedInteger(input.crop[key], key === 'x' || key === 'y' ? 0 : 1, 100000)));
    }
    else if (short === 'ast_search') allow = !!context.path(input.path) && context.cleanTree() && typeof input.query === 'string' && input.query.length <= 16384;
    else if (short === 'lsp_query') allow = !!context.path(input.path) && ['symbols', 'definition', 'references', 'hover', 'diagnostics'].includes(input.action);
    else if (short === 'hashline_edit') allow = input.action === 'read' ? !!context.path(input.path) : input.action === 'edit' && context.write(input.path) && guardedEdits(input);
    else if (short === 'safe_edit_and_test') allow = context.write(input.path) && guardedEdits(input) && context.testArgv(input.test_command) &&
      (input.timeout_secs === undefined || boundedInteger(input.timeout_secs, 1, 120));
    else if (['read', 'read_file'].includes(short)) allow = !!context.path(input.path ?? input.file_path);
    else if (['write', 'edit'].includes(short)) allow = context.write(input.path);
    else if (short === 'text_editor') allow = input.command === 'view' ? !!context.path(input.path) :
      ['str_replace', 'create', 'insert', 'undo_edit'].includes(input.command) && context.write(input.path);
    return result(Boolean(allow), allow ? 'allowed_synthetic_fixture_operation' : 'outside_benchmark_policy');
  } catch { return result(false, 'invalid_or_unverifiable_operation'); }
}
