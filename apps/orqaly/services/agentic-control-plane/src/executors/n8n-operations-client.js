import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { canonicalJson } from '../domain/canonical.js';
import { loadN8nBindingManifest } from './n8n-binding-manifest.js';

const TRUSTED_ALLOWLISTS = new WeakSet();
const JSON_CONTENT_TYPE = /^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const PROVIDER_STATUSES = [
  'canceled',
  'crashed',
  'error',
  'new',
  'running',
  'success',
  'unknown',
  'waiting',
];

const ProviderIdSchema = z
  .union([
    z.string().min(1).max(200).regex(SAFE_REFERENCE),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ])
  .transform(String);
const JsonObjectSchema = z.record(z.string(), z.unknown());
const WorkflowSourceSchema = z
  .object({
    name: z.string().min(1).max(512),
    nodes: z.array(JsonObjectSchema).min(1).max(1_000),
    connections: JsonObjectSchema,
    settings: JsonObjectSchema,
  })
  .passthrough();
const WorkflowSummarySchema = z
  .object({
    id: ProviderIdSchema,
    name: z.string().min(1).max(512),
    active: z.boolean(),
  })
  .passthrough();
const ActiveVersionSchema = z
  .object({
    versionId: z.string().min(1).max(200).optional(),
    workflowId: ProviderIdSchema.optional(),
    nodes: z.array(JsonObjectSchema).max(1_000),
    connections: JsonObjectSchema,
  })
  .passthrough();
const WorkflowDetailSchema = WorkflowSummarySchema.extend({
  nodes: z.array(JsonObjectSchema).max(1_000),
  connections: JsonObjectSchema,
  settings: JsonObjectSchema,
  versionId: z.string().min(1).max(200).optional(),
  activeVersionId: z.string().min(1).max(200).nullable().optional(),
  activeVersion: ActiveVersionSchema.nullable().optional(),
});
const WorkflowListSchema = z
  .object({
    data: z.array(WorkflowSummarySchema).max(250),
    nextCursor: z.string().min(1).max(4_096).nullable().optional(),
  })
  .passthrough();
const ExecutionSchema = z
  .object({
    id: ProviderIdSchema,
    status: z.enum(PROVIDER_STATUSES),
    workflowId: ProviderIdSchema.optional(),
    createdAt: z.string().min(1).max(100).nullable().optional(),
    startedAt: z.string().min(1).max(100).nullable().optional(),
    stoppedAt: z.string().min(1).max(100).nullable().optional(),
    waitTill: z.string().min(1).max(100).nullable().optional(),
  })
  .passthrough();
const WorkflowSelectorSchema = z
  .object({
    bindingKey: z.string().min(1).max(200).regex(SAFE_REFERENCE),
    bindingVersion: z.string().min(1).max(200).regex(SAFE_REFERENCE),
  })
  .strict();

const STATUS_MAP = Object.freeze({
  new: 'queued',
  running: 'running',
  waiting: 'waiting',
  success: 'succeeded',
  error: 'failed',
  crashed: 'failed',
  canceled: 'canceled',
  unknown: 'unknown',
});

export class N8nOperationsError extends Error {
  constructor(code, { cause = undefined, status = undefined, retryable = false } = {}) {
    super(code, { cause });
    this.name = 'N8nOperationsError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function exactApiBaseUrl(value, allowInsecureHttp) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new N8nOperationsError('n8n_api_base_url_invalid');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/api/v1/') {
    throw new N8nOperationsError('n8n_api_base_url_must_be_exact');
  }
  if (url.protocol !== 'https:' && !(allowInsecureHttp && url.protocol === 'http:')) {
    throw new N8nOperationsError('n8n_api_https_required');
  }
  return url;
}

function hasForbiddenApiKeyCharacter(value) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x20 || codeUnit === 0x7f) return true;
  }
  return false;
}

function secretApiKey(value) {
  if (
    typeof value !== 'string' ||
    value.length < 20 ||
    value.length > 8_192 ||
    hasForbiddenApiKeyCharacter(value)
  ) {
    throw new N8nOperationsError(value ? 'n8n_api_key_invalid' : 'n8n_api_key_missing');
  }
  return value;
}

function boundedInteger(value, { name, minimum, maximum }) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new N8nOperationsError(`${name}_invalid`);
  }
  return value;
}

function safeReference(value, code) {
  if (typeof value !== 'string' || !SAFE_REFERENCE.test(value)) {
    throw new N8nOperationsError(code);
  }
  return value;
}

function providerReference(value, code) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new N8nOperationsError(code);
    return String(value);
  }
  return safeReference(value, code);
}

async function boundedResponseText(response, maximumBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new N8nOperationsError('n8n_api_response_too_large', { status: response.status });
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new N8nOperationsError('n8n_api_response_too_large', {
        status: response.status,
      });
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function publicWorkflowPayload(workflow) {
  return deepFreeze({
    name: workflow.name,
    nodes: structuredClone(workflow.nodes),
    connections: structuredClone(workflow.connections),
    settings: structuredClone(workflow.settings),
  });
}

/**
 * Loads the only workflows the management client may mutate. The existing
 * manifest loader enforces node, credential, webhook and retention policy;
 * this loader additionally binds the exact bytes used to build API payloads.
 */
export async function loadN8nWorkflowAllowlist(manifestPath) {
  const absoluteManifestPath = path.resolve(manifestPath);
  const manifest = await loadN8nBindingManifest(absoluteManifestPath);
  const manifestDirectory = path.dirname(absoluteManifestPath);
  const workflows = [];
  const names = new Set();

  for (const binding of manifest.bindings) {
    const workflowPath = path.resolve(manifestDirectory, binding.workflowFile);
    if (!workflowPath.startsWith(`${manifestDirectory}${path.sep}`)) {
      throw new N8nOperationsError('n8n_workflow_path_outside_allowlist');
    }
    const bytes = await readFile(workflowPath);
    if (sha256(bytes) !== binding.workflowContentHash) {
      throw new N8nOperationsError('n8n_workflow_content_hash_mismatch');
    }
    let workflow;
    try {
      workflow = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new N8nOperationsError('n8n_workflow_json_invalid');
    }
    const source = WorkflowSourceSchema.safeParse(workflow);
    if (!source.success) {
      throw new N8nOperationsError('n8n_workflow_contract_invalid');
    }
    const payload = publicWorkflowPayload(source.data);
    if (names.has(payload.name)) {
      throw new N8nOperationsError('n8n_allowlisted_workflow_name_duplicate');
    }
    names.add(payload.name);
    workflows.push(
      deepFreeze({
        bindingKey: binding.bindingKey,
        bindingVersion: binding.bindingVersion,
        bindingContentHash: binding.contentHash,
        workflowContentHash: binding.workflowContentHash,
        authoredVersionId: binding.workflowVersionId,
        payload,
      })
    );
  }

  const allowlist = deepFreeze({
    manifestHash: manifest.manifestHash,
    workflows,
  });
  TRUSTED_ALLOWLISTS.add(allowlist);
  return allowlist;
}

function comparableNodes(nodes) {
  return nodes.map(({ createdAt: _createdAt, updatedAt: _updatedAt, ...node }) => node);
}

function comparableSettings(settings) {
  const comparable = { ...settings };
  // n8n documents these as derived/default response fields rather than
  // authored workflow content. A true MCP flag remains and therefore drifts.
  delete comparable.binaryMode;
  if (comparable.availableInMCP === false) delete comparable.availableInMCP;
  if (comparable.credentialResolverId == null) delete comparable.credentialResolverId;
  return comparable;
}

function workflowMatches(actual, desired) {
  if (actual.name !== desired.name) return false;
  if (canonicalJson(comparableNodes(actual.nodes)) !== canonicalJson(desired.nodes)) return false;
  if (canonicalJson(actual.connections) !== canonicalJson(desired.connections)) return false;
  return canonicalJson(comparableSettings(actual.settings)) === canonicalJson(desired.settings);
}

function publishedVersionMatches(actual, desired) {
  if (!actual.active) return false;
  if (
    !actual.versionId ||
    !actual.activeVersionId ||
    !actual.activeVersion?.versionId ||
    !actual.activeVersion.workflowId
  )
    return false;
  if (actual.activeVersionId !== actual.versionId) return false;
  if (actual.activeVersion.versionId !== actual.activeVersionId) return false;
  if (actual.activeVersion.workflowId !== actual.id) return false;
  return (
    canonicalJson(comparableNodes(actual.activeVersion.nodes)) === canonicalJson(desired.nodes) &&
    canonicalJson(actual.activeVersion.connections) === canonicalJson(desired.connections)
  );
}

function timestampOrNull(value) {
  if (value == null) return null;
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.valueOf())) {
    throw new N8nOperationsError('n8n_execution_timestamp_invalid');
  }
  return timestamp.toISOString();
}

function normalizeExecution(execution) {
  return Object.freeze({
    provider: 'n8n',
    executionId: execution.id,
    workflowId: execution.workflowId ?? null,
    status: STATUS_MAP[execution.status],
    providerStatus: execution.status,
    createdAt: timestampOrNull(execution.createdAt),
    startedAt: timestampOrNull(execution.startedAt),
    finishedAt: timestampOrNull(execution.stoppedAt),
    waitUntil: timestampOrNull(execution.waitTill),
    failureKind: execution.status === 'crashed' ? 'provider_crash' : null,
  });
}

export class N8nOperationsClient {
  #apiBaseUrl;
  #apiKey;
  #allowlist;
  #fetch;
  #timeoutMs;
  #maximumRequestBytes;
  #maximumResponseBytes;
  #maximumListPages;

  constructor({
    apiBaseUrl,
    apiKey,
    workflowAllowlist,
    allowInsecureHttp = false,
    timeoutMs = 10_000,
    maximumRequestBytes = 1_048_576,
    maximumResponseBytes = 524_288,
    maximumListPages = 10,
    fetchImpl = globalThis.fetch,
  }) {
    if (!TRUSTED_ALLOWLISTS.has(workflowAllowlist)) {
      throw new N8nOperationsError('n8n_workflow_allowlist_untrusted');
    }
    if (typeof fetchImpl !== 'function') {
      throw new N8nOperationsError('n8n_fetch_implementation_required');
    }
    this.#apiBaseUrl = exactApiBaseUrl(apiBaseUrl, allowInsecureHttp);
    this.#apiKey = secretApiKey(apiKey);
    this.#allowlist = workflowAllowlist;
    this.#fetch = fetchImpl;
    this.#timeoutMs = boundedInteger(timeoutMs, {
      name: 'n8n_api_timeout',
      minimum: 100,
      maximum: 60_000,
    });
    this.#maximumRequestBytes = boundedInteger(maximumRequestBytes, {
      name: 'n8n_api_maximum_request_bytes',
      minimum: 1_024,
      maximum: 4_194_304,
    });
    this.#maximumResponseBytes = boundedInteger(maximumResponseBytes, {
      name: 'n8n_api_maximum_response_bytes',
      minimum: 1_024,
      maximum: 4_194_304,
    });
    this.#maximumListPages = boundedInteger(maximumListPages, {
      name: 'n8n_api_maximum_list_pages',
      minimum: 1,
      maximum: 100,
    });
  }

  toJSON() {
    return { provider: 'n8n', apiBaseUrl: this.#apiBaseUrl.href };
  }

  #selectWorkflow(rawSelector) {
    const selector = WorkflowSelectorSchema.safeParse(rawSelector);
    if (!selector.success) throw new N8nOperationsError('n8n_workflow_selector_invalid');
    const { bindingKey, bindingVersion } = selector.data;
    const selected = this.#allowlist.workflows.find(
      (candidate) =>
        candidate.bindingKey === bindingKey && candidate.bindingVersion === bindingVersion
    );
    if (!selected) throw new N8nOperationsError('n8n_workflow_not_allowlisted');
    return selected;
  }

  async #request(method, relativePath, { body = undefined, schema } = {}) {
    const url = new URL(relativePath, this.#apiBaseUrl);
    if (
      url.origin !== this.#apiBaseUrl.origin ||
      !url.pathname.startsWith(this.#apiBaseUrl.pathname)
    ) {
      throw new N8nOperationsError('n8n_api_target_outside_base');
    }

    let serializedBody;
    if (body !== undefined) {
      serializedBody = JSON.stringify(body);
      if (Buffer.byteLength(serializedBody) > this.#maximumRequestBytes) {
        throw new N8nOperationsError('n8n_api_request_too_large');
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    let response;
    try {
      response = await this.#fetch(url, {
        method,
        redirect: 'error',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'X-N8N-API-KEY': this.#apiKey,
          ...(serializedBody === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(serializedBody === undefined ? {} : { body: serializedBody }),
      });
      if (
        !response ||
        typeof response.ok !== 'boolean' ||
        !Number.isInteger(response.status) ||
        typeof response.headers?.get !== 'function'
      ) {
        throw new N8nOperationsError('n8n_api_response_invalid');
      }
      const responseText = await boundedResponseText(response, this.#maximumResponseBytes);
      if (!response.ok) {
        throw new N8nOperationsError('n8n_api_http_error', {
          status: response.status,
          retryable: response.status === 429 || response.status >= 500,
        });
      }
      if (!responseText || !JSON_CONTENT_TYPE.test(response.headers.get('content-type') || '')) {
        throw new N8nOperationsError('n8n_api_json_response_required', {
          status: response.status,
        });
      }

      let value;
      try {
        value = JSON.parse(responseText);
      } catch {
        throw new N8nOperationsError('n8n_api_response_json_invalid', {
          status: response.status,
        });
      }
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        throw new N8nOperationsError('n8n_api_response_contract_invalid', {
          status: response.status,
        });
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof N8nOperationsError) throw error;
      throw new N8nOperationsError(
        error?.name === 'AbortError'
          ? 'n8n_api_timeout'
          : response
            ? 'n8n_api_response_read_failed'
            : 'n8n_api_request_failed',
        { status: response?.status, retryable: true }
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async #findWorkflowByName(name) {
    const matches = [];
    let cursor;
    for (let page = 0; page < this.#maximumListPages; page += 1) {
      const query = new URLSearchParams({ limit: '100' });
      if (cursor) query.set('cursor', cursor);
      const result = await this.#request('GET', `workflows?${query}`, {
        schema: WorkflowListSchema,
      });
      matches.push(...result.data.filter((workflow) => workflow.name === name));
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
      if (page === this.#maximumListPages - 1) {
        throw new N8nOperationsError('n8n_workflow_list_page_limit_exceeded');
      }
    }
    if (matches.length > 1) {
      throw new N8nOperationsError('n8n_managed_workflow_duplicate');
    }
    return matches[0] ?? null;
  }

  async #getWorkflow(workflowId) {
    safeReference(workflowId, 'n8n_workflow_id_invalid');
    return this.#request('GET', `workflows/${encodeURIComponent(workflowId)}`, {
      schema: WorkflowDetailSchema,
    });
  }

  async ensureWorkflowPublished(selector) {
    const allowed = this.#selectWorkflow(selector);
    const existing = await this.#findWorkflowByName(allowed.payload.name);
    let workflow;
    let change;

    if (!existing) {
      workflow = await this.#request('POST', 'workflows', {
        body: allowed.payload,
        schema: WorkflowDetailSchema,
      });
      change = 'created';
    } else {
      const detail = await this.#getWorkflow(existing.id);
      if (workflowMatches(detail, allowed.payload)) {
        workflow = detail;
        change = 'unchanged';
      } else {
        workflow = await this.#request('PUT', `workflows/${encodeURIComponent(existing.id)}`, {
          body: allowed.payload,
          schema: WorkflowDetailSchema,
        });
        change = 'updated';
      }
    }

    if (!publishedVersionMatches(workflow, allowed.payload)) {
      workflow = await this.#request(
        'POST',
        `workflows/${encodeURIComponent(workflow.id)}/publish`,
        {
          body: workflow.versionId ? { versionId: workflow.versionId } : {},
          schema: WorkflowDetailSchema,
        }
      );
      if (change === 'unchanged') change = 'published';
    }

    const verified = await this.#getWorkflow(workflow.id);
    if (
      !workflowMatches(verified, allowed.payload) ||
      !publishedVersionMatches(verified, allowed.payload)
    ) {
      throw new N8nOperationsError('n8n_workflow_publish_verification_failed');
    }
    if (change === 'created') {
      const uniquelyNamed = await this.#findWorkflowByName(allowed.payload.name);
      if (!uniquelyNamed || uniquelyNamed.id !== verified.id) {
        throw new N8nOperationsError('n8n_workflow_create_race_detected');
      }
    }
    return Object.freeze({
      provider: 'n8n',
      bindingKey: allowed.bindingKey,
      bindingVersion: allowed.bindingVersion,
      bindingContentHash: allowed.bindingContentHash,
      workflowContentHash: allowed.workflowContentHash,
      workflowId: verified.id,
      providerVersionId: verified.versionId ?? null,
      state: 'published',
      change,
    });
  }

  async ensureAllWorkflowsPublished() {
    const results = [];
    for (const workflow of this.#allowlist.workflows) {
      results.push(
        await this.ensureWorkflowPublished({
          bindingKey: workflow.bindingKey,
          bindingVersion: workflow.bindingVersion,
        })
      );
    }
    return Object.freeze(results);
  }

  async getWorkflowReadiness(selector) {
    const allowed = this.#selectWorkflow(selector);
    const existing = await this.#findWorkflowByName(allowed.payload.name);
    if (!existing) {
      return Object.freeze({
        provider: 'n8n',
        bindingKey: allowed.bindingKey,
        bindingVersion: allowed.bindingVersion,
        workflowContentHash: allowed.workflowContentHash,
        state: 'missing',
        ready: false,
      });
    }
    const detail = await this.#getWorkflow(existing.id);
    const contentMatches = workflowMatches(detail, allowed.payload);
    const publishedMatches = publishedVersionMatches(detail, allowed.payload);
    return Object.freeze({
      provider: 'n8n',
      bindingKey: allowed.bindingKey,
      bindingVersion: allowed.bindingVersion,
      workflowContentHash: allowed.workflowContentHash,
      workflowId: detail.id,
      providerVersionId: detail.versionId ?? null,
      state: !contentMatches
        ? 'drifted'
        : !detail.active
          ? 'inactive'
          : publishedMatches
            ? 'published'
            : 'unverified',
      ready: contentMatches && publishedMatches,
    });
  }

  async getAllWorkflowReadiness() {
    const results = [];
    for (const workflow of this.#allowlist.workflows) {
      results.push(
        await this.getWorkflowReadiness({
          bindingKey: workflow.bindingKey,
          bindingVersion: workflow.bindingVersion,
        })
      );
    }
    return Object.freeze(results);
  }

  async getExecutionStatus(executionId) {
    const normalizedExecutionId = providerReference(executionId, 'n8n_execution_id_invalid');
    const execution = await this.#request(
      'GET',
      `executions/${encodeURIComponent(normalizedExecutionId)}?includeData=false`,
      { schema: ExecutionSchema }
    );
    if (execution.id !== normalizedExecutionId) {
      throw new N8nOperationsError('n8n_execution_identity_mismatch');
    }
    return normalizeExecution(execution);
  }

  async cancelExecution(executionId) {
    const normalizedExecutionId = providerReference(executionId, 'n8n_execution_id_invalid');
    const execution = await this.#request(
      'POST',
      `executions/${encodeURIComponent(normalizedExecutionId)}/stop`,
      { schema: ExecutionSchema }
    );
    if (execution.id !== normalizedExecutionId) {
      throw new N8nOperationsError('n8n_execution_identity_mismatch');
    }
    return normalizeExecution(execution);
  }
}
