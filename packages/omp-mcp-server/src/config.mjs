import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';

const SAFE_COMMAND = /^[A-Za-z0-9._-]{1,128}$/;
const ACCOUNT_HASH = /^[a-f0-9]{64}$/;
const OPTIONS = new Set([
  '--workspace',
  '--omp',
  '--node',
  '--connector',
  '--connector-config',
  '--account-hash',
  '--conversation-id',
  '--state-dir',
  '--jev-enabled',
]);

function integer(value, fallback, minimum, maximum, name) {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw new Error(`${name} must be an integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function boolean(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  throw new Error(`${name} must be true, false, 1, or 0.`);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!OPTIONS.has(key) || !value || Object.hasOwn(options, key)) {
      throw new Error(
        'Use one value each for --workspace, --omp, --node, --connector, ' +
          '--connector-config, --account-hash, --conversation-id, --state-dir and --jev-enabled.'
      );
    }
    options[key] = value;
  }
  return options;
}

async function directoryRealpath(value, name, { create = false } = {}) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${name} must be an absolute directory.`);
  }
  if (create) await mkdir(value, { recursive: true, mode: 0o700 });
  const canonical = await realpath(resolve(value));
  if (!(await stat(canonical)).isDirectory()) throw new Error(`${name} must be a directory.`);
  if (canonical === parse(canonical).root) throw new Error(`${name} cannot be a filesystem root.`);
  return canonical;
}

async function executable(value, name) {
  if (typeof value !== 'string' || value.includes('\0')) throw new Error(`${name} is invalid.`);
  if (!isAbsolute(value)) {
    if (!SAFE_COMMAND.test(value)) throw new Error(`${name} must be an absolute path or command name.`);
    return value;
  }
  const canonical = await realpath(value);
  if (!(await stat(canonical)).isFile()) throw new Error(`${name} must be a regular file.`);
  if (process.platform !== 'win32') await access(canonical, constants.X_OK);
  return canonical;
}

async function regularFile(value, name) {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${name} must be an absolute file path.`);
  }
  const canonical = await realpath(value);
  const metadata = await lstat(canonical);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${name} must be a regular file.`);
  return canonical;
}

async function publicGateway(configPath) {
  const bytes = await readFile(configPath);
  if (bytes.length > 16_384) throw new Error('Connector config is too large.');
  const parsed = JSON.parse(bytes.toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || typeof parsed.apiUrl !== 'string') {
    throw new Error('Connector config has no API URL.');
  }
  const url = new URL(parsed.apiUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error('Connector API must be an HTTPS origin.');
  }
  return new URL('/desktop/v1', url).toString().replace(/\/$/, '');
}

function modelsYaml({ apiBaseUrl, accountHash }) {
  return [
    'providers:',
    '  orqanix:',
    `    baseUrl: ${JSON.stringify(apiBaseUrl)}`,
    '    api: openai-completions',
    '    apiKey: ORQANIX_OMP_TOKEN',
    '    authHeader: true',
    '    headers:',
    `      X-Orqaly-Account-Hash: ${JSON.stringify(accountHash)}`,
    '    models:',
    '      - id: orqaly-gemini',
    '        name: Orqanix Gemini',
    '        reasoning: true',
    '        input: [text]',
    '        contextWindow: 1048576',
    '        maxTokens: 65536',
    '        cost:',
    '          input: 0',
    '          output: 0',
    '          cacheRead: 0',
    '          cacheWrite: 0',
    '',
  ].join('\n');
}

async function writeModelsFile(stateDir, content) {
  const target = join(stateDir, 'models.yml');
  const temporary = join(stateDir, `.models-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return target;
}

export async function loadConfig({ argv = [], env = process.env, cwd = process.cwd() } = {}) {
  const options = parseArgs(argv);
  const workspace = await directoryRealpath(options['--workspace'] || cwd, 'Workspace');
  const binary = await executable(options['--omp'] || env.ORQANIX_OMP_BINARY || 'omp', 'OMP binary');
  const node = await executable(options['--node'] || process.execPath, 'Node binary');
  const connector = await regularFile(options['--connector'], 'Connector');
  const connectorConfig = await regularFile(options['--connector-config'], 'Connector config');
  const accountHash = options['--account-hash'];
  if (!ACCOUNT_HASH.test(accountHash || '')) throw new Error('Account hash is invalid.');
  const conversationId = options['--conversation-id'];
  if (conversationId !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(conversationId)) {
    throw new Error('Conversation ID is invalid.');
  }
  const stateDir = await directoryRealpath(options['--state-dir'], 'OMP state directory', {
    create: true,
  });
  const apiBaseUrl = await publicGateway(connectorConfig);
  const modelsFile = await writeModelsFile(
    stateDir,
    modelsYaml({ apiBaseUrl, accountHash })
  );
  return {
    workspace,
    binary,
    node,
    connector,
    connectorConfig,
    connectorCwd: dirname(connector),
    accountHash,
    conversationId,
    apiBaseUrl,
    stateDir,
    modelsFile,
    model: 'orqanix/orqaly-gemini',
    thinking: 'high',
    jevEnabled: boolean(
      options['--jev-enabled'] ?? env.ORQANIX_JEV_ENABLED,
      true,
      'Jev capability'
    ),
    timeoutMs: integer(env.ORQANIX_OMP_TIMEOUT_MS, 600_000, 10_000, 1_800_000, 'OMP timeout'),
    startupTimeoutMs: integer(
      env.ORQANIX_OMP_STARTUP_TIMEOUT_MS,
      30_000,
      1_000,
      120_000,
      'OMP startup timeout'
    ),
    maxOutputBytes: integer(
      env.ORQANIX_OMP_MAX_OUTPUT_BYTES,
      131_072,
      4_096,
      1_048_576,
      'OMP output limit'
    ),
  };
}
