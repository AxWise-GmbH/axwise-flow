import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, parse, resolve } from 'node:path';
import type { ContentBlock } from '@agentclientprotocol/sdk';
import type { GooseExtension } from '@aaif/goose-acp-client';
import type { EngineeringCapabilities } from '../utils/settings';
import type { OrqalySessionCapabilities, OrqalyWorkspaceState } from './workspaceTypes';
import { engineeringInstruction } from './replyQuestionPrompt';

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_STATE_BYTES = 2_097_152;
type StoredWorkspace = Omit<OrqalyWorkspaceState, 'busy'>;

interface WorkspaceOptions {
  getProfileRoot(): string | null;
  runtimeRoot: string;
  utilitiesApiUrl?: string;
  getCapabilities(): EngineeringCapabilities;
  getAxwiseEnabled?(): boolean;
  writeTemporaryFile?(path: string, bytes: string): Promise<void>;
}

const DEFAULT_CAPABILITIES: OrqalySessionCapabilities = {
  ompEnabled: false,
  jevReviewEnabled: true,
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function validCapabilities(value: unknown): value is OrqalySessionCapabilities {
  const data = record(value);
  return typeof data.ompEnabled === 'boolean' && typeof data.jevReviewEnabled === 'boolean';
}

export function workspacePromptResource(
  state: OrqalyWorkspaceState,
  capabilities: OrqalySessionCapabilities = DEFAULT_CAPABILITIES
): ContentBlock {
  const engineeringGuidance = engineeringInstruction(capabilities);
  return {
    type: 'resource',
    annotations: { audience: ['assistant'] },
    resource: {
      uri: `orqaly://conversation/${encodeURIComponent(state.sessionId)}/desktop-routing`,
      mimeType: 'application/json',
      text: JSON.stringify({
        kind: 'orqaly.desktop-routing.v1',
        guidance:
          'Desktop capabilities are tools, not a mandatory workflow or action permission. ' +
          'Choose available tools to serve the current user request and respect local approvals. ' +
          'Read tool results before deciding whether to answer or continue; a tool cannot finish the conversation for you. ' +
          'Follow-ups such as "go deeper" or "more detail" refer to the latest unambiguous conversational subject. ' +
          'A previous specialist task does not override a later topic change. ' +
          'Depth words, an attached project or the word "research" alone do not justify specialist delegation. ' +
          'If several subjects plausibly fit, ask which one the user means before choosing tools. ' +
          'If no conversational subject is available, ask what topic they mean; do not inspect a project to invent a subject. ' +
          'When the user explicitly returns to earlier work, reuse its exact saved artifact reference only if available in the conversation; never guess missing references. ' +
          'For follow-ups, reuse the latest unambiguous user-supplied location, dates and other constraints. ' +
          'Do not carry stale filters into unrelated requests. Ask only for missing or ambiguous details. ' +
          'Preserve source links and distinguish verified findings from incomplete or failed retrieval. ' +
          'If retrieval fails, you may try another relevant permitted query or tool within a modest time and call budget; ' +
          'report any remaining uncertainty instead of inventing results.' +
          (engineeringGuidance ? `\n\n${engineeringGuidance}` : ''),
        conversationId: state.sessionId,
      }),
    },
  };
}

export function createOrqalyWorkspaceManager(options: WorkspaceOptions) {
  const leases = new Map<string, { owner: number; key: string }>();
  const closedOwners = new Set<number>();
  const queues = new Map<string, Promise<unknown>>();
  const activeCapabilitySnapshots = new Map<
    string,
    { capabilities: OrqalySessionCapabilities; axwiseEnabled: boolean; leaseIds: Set<string> }
  >();

  function configuredCapabilities(): OrqalySessionCapabilities {
    const configured = options.getCapabilities();
    return {
      ompEnabled: configured.ompEnabled === true,
      jevReviewEnabled: configured.jevReviewEnabled === true,
    };
  }

  function location(sessionId: string) {
    if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId))
      throw new Error('Select an existing conversation first.');
    const root = options.getProfileRoot();
    if (!root) throw new Error('Sign in to Orqanix to access this workspace.');
    const directory = join(root, 'orqaly-workspaces');
    const key = join(directory, `${createHash('sha256').update(sessionId).digest('hex')}.json`);
    return { root, directory, key };
  }

  function assertAccount(root: string) {
    if (options.getProfileRoot() !== root)
      throw new Error('Your Orqanix connection changed. Try again.');
  }

  const busy = (key: string) => [...leases.values()].some((lease) => lease.key === key);

  async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const pending = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
    queues.set(key, pending);
    try {
      return await pending;
    } finally {
      if (queues.get(key) === pending) queues.delete(key);
    }
  }

  async function read(sessionId: string, root: string, key: string): Promise<OrqalyWorkspaceState> {
    let data: StoredWorkspace;
    try {
      const bytes = await readFile(key);
      if (bytes.length > MAX_STATE_BYTES) throw new Error('Workspace is too large.');
      const stored = record(JSON.parse(bytes.toString('utf8')));
      if (stored.sessionId !== sessionId) throw new Error('Invalid workspace.');
      const capabilities = stored.capabilities ?? DEFAULT_CAPABILITIES;
      if (!validCapabilities(capabilities)) throw new Error('Invalid workspace capabilities.');
      data = {
        sessionId,
        capabilities: {
          ompEnabled: capabilities.ompEnabled,
          jevReviewEnabled: capabilities.jevReviewEnabled,
        },
      };
    } catch (error) {
      if ((error as Error & { code?: string }).code !== 'ENOENT')
        // Keep private profile paths and malformed saved content out of renderer errors.
        // eslint-disable-next-line preserve-caught-error
        throw new Error('Orqanix could not read this conversation’s saved workspace.');
      data = {
        sessionId,
        capabilities: configuredCapabilities(),
      };
    }
    assertAccount(root);
    return { ...data, busy: busy(key) };
  }

  async function save(state: OrqalyWorkspaceState, root: string, directory: string, key: string) {
    assertAccount(root);
    const { busy: _busy, ...stored } = state;
    const bytes = JSON.stringify(stored);
    if (Buffer.byteLength(bytes) > MAX_STATE_BYTES)
      throw new Error('This conversation workspace is too large to save.');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.workspace-${randomUUID()}.tmp`);
    try {
      if (options.writeTemporaryFile) await options.writeTemporaryFile(temporary, bytes);
      else await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
      assertAccount(root);
      await rename(temporary, key);
    } finally {
      await unlink(temporary).catch(() => {});
    }
  }

  async function get(sessionId: string) {
    const { root, key } = location(sessionId);
    return serialized(key, () => read(sessionId, root, key));
  }

  async function beginTurn(owner: number, sessionId: string) {
    if (closedOwners.has(owner)) throw new Error('This conversation window closed.');
    const { root, directory, key } = location(sessionId);
    return serialized(key, async () => {
      const state = await read(sessionId, root, key);
      let activeSnapshot = activeCapabilitySnapshots.get(key);
      let activateSnapshot = false;
      if (!activeSnapshot) {
        const capabilities = configuredCapabilities();
        const refreshedState = { ...state, capabilities };
        // Every inactive-to-active transition adopts the latest desktop settings and rewrites
        // the minimal schema, which also removes legacy Goal fields from older workspace files.
        await save(refreshedState, root, directory, key);
        activeSnapshot = {
          capabilities,
          axwiseEnabled: options.getAxwiseEnabled?.() === true,
          leaseIds: new Set(),
        };
        activateSnapshot = true;
      }
      assertAccount(root);
      if (closedOwners.has(owner)) throw new Error('This conversation window closed.');
      if (activateSnapshot) activeCapabilitySnapshots.set(key, activeSnapshot);
      const leaseId = randomUUID();
      leases.set(leaseId, { owner, key });
      activeSnapshot.leaseIds.add(leaseId);
      return {
        leaseId,
        resource: workspacePromptResource(state, activeSnapshot.capabilities),
        capabilities: activeSnapshot.capabilities,
      };
    });
  }

  function endTurn(owner: number, leaseId: string) {
    const lease = leases.get(leaseId);
    if (lease?.owner !== owner) return;
    leases.delete(leaseId);
    const snapshot = activeCapabilitySnapshots.get(lease.key);
    snapshot?.leaseIds.delete(leaseId);
    if (snapshot?.leaseIds.size === 0) activeCapabilitySnapshots.delete(lease.key);
  }

  function extensions(owner: number, sessionId: string, cwd: string): GooseExtension[] {
    const { root, key } = location(sessionId);
    const snapshot = activeCapabilitySnapshots.get(key);
    const ownerHasLease =
      snapshot && [...snapshot.leaseIds].some((leaseId) => leases.get(leaseId)?.owner === owner);
    if (!snapshot || !ownerHasLease)
      throw new Error('Start the conversation before loading its capabilities.');
    const capabilities = snapshot.capabilities;
    const engineeringWorkspaceAvailable = !(
      typeof cwd !== 'string' ||
      !isAbsolute(cwd) ||
      cwd.includes('\0') ||
      resolve(cwd) === parse(resolve(cwd)).root
    );
    const node = join(
      options.runtimeRoot,
      'node',
      ...(process.platform === 'win32' ? ['node.exe'] : ['bin', 'node'])
    );
    const connector = join(options.runtimeRoot, 'connector', 'src', 'cli.mjs');
    const connectorConfig = join(
      options.runtimeRoot,
      'connector',
      'production.config.example.json'
    );
    const utilities: GooseExtension = {
      type: 'mcp',
      server: {
        name: 'desktop-utilities',
        command: node,
        args: [
          join(options.runtimeRoot, 'connector', 'src', 'utilities-mcp.mjs'),
          '--config',
          connectorConfig,
          '--conversation-id',
          sessionId,
          '--account-hash',
          basename(root),
          ...(options.utilitiesApiUrl ? ['--api-url', options.utilitiesApiUrl] : []),
        ],
        env: [],
      },
      description:
        'Independent weather, currency and grounded search tools. Results are evidence for the conversation; choose other available tools when useful.',
      timeout: 180,
      bundled: true,
    };
    const available: GooseExtension[] = [utilities];
    if (snapshot.axwiseEnabled) {
      const axwiseRoot = join(dirname(options.runtimeRoot), 'axwise-runtime');
      available.push({
        type: 'mcp',
        server: {
          name: 'axwise-local',
          command: node,
          args: [
            join(axwiseRoot, 'adapter', 'src', 'mcp.mjs'),
            '--python',
            join(axwiseRoot, 'python', 'bin', 'python3'),
            '--kernel-root',
            join(axwiseRoot, 'kernel'),
            '--connector-root',
            join(options.runtimeRoot, 'connector'),
            '--state-dir',
            join(root, 'axwise-local'),
            '--config',
            connectorConfig,
            '--account-hash',
            basename(root),
            '--conversation-id',
            sessionId,
            ...(options.utilitiesApiUrl ? ['--api-url', options.utilitiesApiUrl] : []),
          ],
          env: [],
        },
        description:
          'Optional local Axwise specialist: discovery planning, selected market evidence synthesis, saved synthetic personas, synthetic interviews, persona follow-up chats, evidence-linked interview analysis, product/software PRDs and delivery briefs. Standard/deep applies only to the selected step. Goose chooses the tools; this is not a general chat, weather, news, search or coding router.',
        timeout: 240,
        bundled: true,
      });
    }
    if (!capabilities.ompEnabled) return available;

    const defaultWorkspace = join(root, 'workspace');
    if (!engineeringWorkspaceAvailable) {
      try {
        mkdirSync(defaultWorkspace, { recursive: true });
      } catch {
        // The extension reports the inaccessible fallback path when it starts.
      }
    }
    const workspacePath = engineeringWorkspaceAvailable ? cwd : defaultWorkspace;
    const engineering: GooseExtension = {
      type: 'mcp',
      server: {
        name: 'orqanix-engineering',
        command: node,
        args: [
          join(options.runtimeRoot, 'engineering', 'src', 'mcp.mjs'),
          '--workspace',
          workspacePath,
          '--conversation-id',
          sessionId,
          '--omp',
          join(options.runtimeRoot, 'omp', 'bin', process.platform === 'win32' ? 'omp.exe' : 'omp'),
          '--node',
          node,
          '--connector',
          connector,
          '--connector-config',
          connectorConfig,
          '--account-hash',
          basename(root),
          '--state-dir',
          join(root, 'omp'),
          '--jev-enabled',
          capabilities.jevReviewEnabled ? 'true' : 'false',
        ],
        env: [],
      },
      description:
        'Optional delegated repository inspection, edits and terminal engineering. Use when delegation benefits the requested task; ordinary local tools remain available.',
      timeout: 1800,
      bundled: true,
    };
    return [...available, engineering];
  }

  return {
    get,
    beginTurn,
    endTurn,
    extensions,
    releaseOwner(owner: number) {
      closedOwners.add(owner);
      for (const [id, lease] of leases) {
        if (lease.owner !== owner) continue;
        leases.delete(id);
        const snapshot = activeCapabilitySnapshots.get(lease.key);
        snapshot?.leaseIds.delete(id);
        if (snapshot?.leaseIds.size === 0) activeCapabilitySnapshots.delete(lease.key);
      }
    },
  };
}
