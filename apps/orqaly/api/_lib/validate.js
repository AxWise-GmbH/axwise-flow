/** Zod validation schemas for API request bodies */
import { z } from 'zod';

export const transcribeBodySchema = z.object({
  audioBase64: z.string().min(1, 'Missing audioBase64').max(6_000_000, 'Audio too large'),
  mimeType: z.string().optional().default('audio/webm'),
});

// Advanced loop-control settings (see lib/goal-handlers/loop-continuation.js).
// All fields optional so callers can patch a single control at a time.
export const loopSettingsSchema = z
  .object({
    convergence_min_gain: z.number().min(0).max(100).optional(),
    chain_budget_cap_usd: z.number().positive().max(1_000_000).nullable().optional(),
    hitl_every: z.number().int().min(0).max(1000).optional(),
    refine_max_versions: z.number().int().min(0).max(10).optional(),
  })
  .strict();

export const updateLoopSettingsBodySchema = z
  .object({
    id: z.string().min(1).optional(),
    loop_advanced: z.boolean().optional(),
    loop_settings: loopSettingsSchema.optional(),
  })
  .refine((v) => v.loop_advanced !== undefined || v.loop_settings !== undefined, {
    message: 'Provide loop_advanced and/or loop_settings',
  });

const emailSchema = z.string().email().max(254);
export const sendEmailBodySchema = z.object({
  to: z.union([emailSchema, z.array(emailSchema).min(1, 'At least one valid email required')]),
  subject: z.string().min(1, 'Missing subject').max(500),
  text: z.string().max(50000).optional(),
  html: z.string().max(50000).optional(),
});

export const sendNotificationBodySchema = z
  .object({
    action: z
      .string()
      .min(1, 'Missing action')
      .max(120, 'Action key too long')
      .regex(/^[a-z0-9_]+$/i, 'Action must be alphanumeric/underscore'),
    data: z.record(z.string(), z.any()).optional().default({}),
    subject: z.string().max(500).optional(),
    text: z.string().max(50000).optional(),
    html: z.string().max(50000).optional(),
    idempotencyKey: z.string().min(1).max(256).optional(),
  })
  .refine((payload) => !!payload.action, { message: 'Missing action' });

// ── Knowledge Base source connections ────────────────────────────
export const KB_SOURCE_TYPES = [
  'notion',
  'obsidian',
  'google-drive',
  'dropbox',
  'onedrive',
  'mega',
];
export const kbConnectionBodySchema = z.object({
  source_type: z.enum(KB_SOURCE_TYPES),
  slot: z.string().trim().max(64).optional(),
  mode: z.enum(['sync', 'live']).optional(),
  label: z.string().max(200).nullish(),
  enabled: z.boolean().optional(),
  scope: z.record(z.string(), z.any()).optional(),
  credential_ref: z.record(z.string(), z.any()).optional(),
  sync_interval_secs: z.number().int().positive().max(2_592_000).nullish(),
  action: z.string().max(32).optional(),
});

export const assistantChatSyncSchema = z.object({
  space: z.string().trim().min(1).max(120).optional().default('Assistant Chats'),
  conversation_id: z.string().uuid().optional(),
  kb_connection_id: z.string().uuid().optional(),
});

// Import chat history exported from external AI apps (ChatGPT/Claude/Gemini/…).
// The client parses each app's export file and posts normalized conversations.
export const AI_CHAT_IMPORT_PROVIDERS = [
  'chatgpt',
  'claude',
  'gemini',
  'perplexity',
  'deepseek',
  'qwen',
  'kimi',
  'generic',
];
export const aiChatImportSchema = z.object({
  provider: z.enum(AI_CHAT_IMPORT_PROVIDERS),
  space: z.string().trim().min(1).max(120).optional().default('Imported Chats'),
  kb_connection_id: z.string().uuid().optional(),
  conversations: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(200),
        title: z.string().trim().max(300).optional().default(''),
        messages: z
          .array(
            z.object({
              role: z.enum(['user', 'assistant']),
              content: z.string().max(20000),
            })
          )
          .max(500),
      })
    )
    .min(1, 'At least one conversation is required')
    .max(60),
});

export const inviteUserBodySchema = z.object({
  email: emailSchema,
  name: z.string().trim().max(120).nullish(),
  roleId: z.string().trim().max(120).nullish(),
  linkedPartnerId: z.string().trim().max(120).nullish(),
  password: z.string().min(8).max(200).nullish(),
});

const templateItemSchema = z.object({
  actionKey: z
    .string()
    .min(1, 'Missing actionKey')
    .max(120, 'actionKey too long')
    .regex(/^[a-z0-9_]+$/i, 'actionKey must be alphanumeric/underscore'),
  subject: z.string().min(1, 'Missing subject').max(500),
  html: z.string().min(1, 'Missing html').max(50000),
  text: z.string().max(50000).optional(),
  version: z.number().int().positive().optional(),
  variables: z.array(z.string().min(1).max(120)).optional(),
});

export const stitchTemplateSyncSchema = z.object({
  provider: z.string().trim().min(1).max(64).optional().default('stitch_google'),
  templates: z.array(templateItemSchema).min(1, 'At least one template required'),
});

// ── Usage analytics query schema ─────────────────────────────────

export const usageAnalyticsQuerySchema = z
  .object({
    entity: z
      .enum(['all', 'organization', 'consilium', 'goal', 'team', 'agent'])
      .optional()
      .default('all'),
    entityId: z.string().trim().max(256).optional(),
    from: z.string().trim().max(40).optional(),
    to: z.string().trim().max(40).optional(),
    provider: z.string().trim().max(64).optional(),
    model: z.string().trim().max(128).optional(),
    source: z.string().trim().max(64).optional(),
  })
  .refine((q) => q.entity === 'all' || !!q.entityId, {
    message: 'entityId is required unless entity=all',
  });

// ── Usage directory query schema ─────────────────────────────────
// Lists every entity of a type (goal/agent/team/consilium/organization)
// with its usage rollup + metadata, for the directory cards/tables view.
export const usageDirectoryQuerySchema = z.object({
  entity: z.enum(['goal', 'agent', 'team', 'consilium', 'organization']),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  search: z.string().trim().max(200).optional(),
  status: z.string().trim().max(40).optional(),
  provider: z.string().trim().max(64).optional(),
  model: z.string().trim().max(128).optional(),
  source: z.string().trim().max(64).optional(),
});

// ── Concilium rate limit schemas ─────────────────────────────────

export const conciliumRateLimitConfigSchema = z.object({
  entityType: z.enum(['user', 'agent', 'board', 'team'], { message: 'Invalid entity type' }),
  entityId: z.string().min(1, 'Missing entityId').max(256),
  maxRequestsPerHour: z.number().int().positive().max(100000).optional(),
  maxRequestsPerDay: z.number().int().positive().max(1000000).optional(),
  maxTokensPerDay: z.number().int().positive().max(50000000).optional(),
  maxCostPerDayUsd: z.number().positive().max(10000).optional(),
  maxCostPerMonthUsd: z.number().positive().max(100000).optional(),
});

export const conciliumEvaluateBodySchema = z.object({
  conciliumId: z.string().min(1, 'Missing conciliumId').max(256),
  jobId: z.string().max(256).optional(),
  jobDescription: z.string().max(10000).optional(),
  agentOutput: z.union([z.string().min(1, 'Missing agentOutput'), z.record(z.any())]),
  criteria: z.array(z.string().min(1).max(100)).max(20).optional(),
  provider: z.string().max(64).optional(),
  model: z.string().max(128).optional(),
});

// ── Concilium v2 schemas ────────────────────────────────────────

export const conciliumBoardSchema = z.object({
  name: z.string().trim().min(1, 'Name required').max(200),
  purpose: z.string().max(2000).optional(),
  description: z.string().max(5000).optional(),
  security_level: z.enum(['minimal', 'standard', 'strict', 'paranoid']).optional(),
  approval_threshold: z.number().min(0).max(1).optional(),
  confidence_threshold: z.number().min(0).max(1).optional(),
  auto_quarantine_on_violation: z.boolean().optional(),
});

export const conciliumMemberSchema = z.object({
  conciliumId: z.string().min(1, 'conciliumId required').max(256),
  name: z.string().trim().min(1, 'Name required').max(200),
  role: z.enum(['chairman', 'evaluator', 'auditor', 'specialist', 'observer']).optional(),
  provider: z.enum(['groq', 'openai', 'anthropic', 'deepseek', 'glm', 'gemini']).optional(),
  model: z.string().max(128).optional(),
  resume: z.string().max(5000).optional(),
  skills: z.array(z.string().max(100)).max(50).optional(),
  comments: z
    .array(
      z.object({
        from: z.string().max(200),
        text: z.string().max(2000),
        at: z.string().max(50).optional(),
      })
    )
    .max(100)
    .optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().max(128000).optional(),
});

export const conciliumCriterionSchema = z.object({
  conciliumId: z.string().min(1, 'conciliumId required').max(256),
  name: z.string().trim().min(1, 'Name required').max(200),
  weight: z.number().min(0).max(1).optional(),
  rubric: z.string().max(10000).optional(),
  examples: z.array(z.string().max(5000)).max(20).optional(),
  sort_order: z.number().int().min(0).max(1000).optional(),
});

export const conciliumConsensusRulesSchema = z.object({
  consensus_type: z.enum(['unanimous', 'majority', 'weighted', 'custom']).optional(),
  quorum: z.number().int().min(1).max(100).optional(),
  approval_threshold: z.number().min(0).max(1).optional(),
  split_decision_strategy: z
    .enum(['chairman_decides', 'reject', 'escalate_to_human', 're_evaluate'])
    .optional(),
  custom_rules: z.record(z.any()).optional(),
});

const blockIdArray = z.array(z.string().trim().min(1).max(64)).max(64);
export const dashboardTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Name required').max(80),
  surface: z.string().trim().min(1).max(40).optional().default('home'),
  hidden: blockIdArray.optional().default([]),
  block_order: blockIdArray.optional().default([]),
  widths: blockIdArray.optional().default([]),
});

export const dashboardTemplateUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name required').max(80).optional(),
  hidden: blockIdArray.optional(),
  block_order: blockIdArray.optional(),
  widths: blockIdArray.optional(),
});

// ── Marketplace imported libraries ───────────────────────────────
// One imported library (curated pick or user-defined) for a Marketplace tab.
// `items` is arbitrary jsonb so each tab's authored item shape passes through.
export const marketplaceImportSchema = z.object({
  category: z.enum(['orgs', 'teams', 'agents', 'models', 'tools', 'skills']),
  sourceId: z.string().trim().min(1, 'sourceId required').max(120),
  name: z.string().trim().min(1, 'name required').max(200),
  description: z.string().max(2000).nullish(),
  author: z.string().max(200).nullish(),
  url: z.string().max(2048).nullish(),
  custom: z.boolean().optional().default(false),
  items: z.array(z.record(z.string(), z.any())).max(500, 'Too many items').optional().default([]),
});

// Live library items lookup (GET query params) - fetch a single curated
// library's real items from its public source, one page at a time, so the
// Import dialog can show dozens/hundreds of items with Load More + search.
export const marketplaceLibraryItemsQuerySchema = z.object({
  category: z.enum(['orgs', 'teams', 'agents', 'models', 'tools', 'skills']),
  sourceId: z.string().trim().min(1, 'sourceId required').max(120),
  q: z.string().trim().max(120).optional().default(''),
  offset: z.coerce.number().int().min(0).max(10000).optional().default(0),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

// Import agents published in a public GitHub repo (GET query params). Paginated
// because a single repo may hold hundreds of agents (e.g. agency-agents ~300).
export const githubAgentsImportQuerySchema = z.object({
  url: z.string().trim().min(1, 'url required').max(2048),
  branch: z.string().trim().max(120).optional(),
  // NOTE: intentionally no `path` field. `/api/app?path=<handler>` uses `path`
  // as the router key, so it is never a caller-supplied repo folder. Sub-path
  // scoping is derived from the repo URL (ref.path) inside the handler instead.
  q: z.string().trim().max(200).optional().default(''),
  offset: z.coerce.number().int().min(0).max(100000).optional().default(0),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

// Live provider catalog lookup (GET query params) - fetch a provider's real
// catalog to browse and import into a Marketplace tab.
export const providerCatalogQuerySchema = z.object({
  provider: z.enum(['composio', 'openrouter', 'huggingface']),
  category: z.enum(['orgs', 'teams', 'agents', 'models', 'tools', 'skills']),
  q: z.string().trim().max(120).optional().default(''),
});

// Live Hugging Face model search (GET query params) - browse HF models to show
// detailed cards in the Marketplace "Download" sub-tab. `q` empty is allowed so
// the tab can seed a default view; the handler bounds the result count.
export const huggingfaceModelSearchSchema = z.object({
  q: z.string().trim().max(160).optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional().default(24),
  // Optional task/domain grouping - keys must mirror CATEGORY_QUERIES in
  // lib/api-handlers/huggingface-models.js and MODEL_CATEGORIES in
  // src/config/modelCategories.js.
  category: z
    .enum([
      'text',
      'coding',
      'image',
      'video',
      'audio',
      'multimodal',
      'embeddings',
      '3d',
      'research',
    ])
    .optional(),
});

// ── Partners ready-business (partner_entities / types / activation) ──────────
const typeKeySchema = z
  .string()
  .trim()
  .min(1, 'type_key required')
  .max(48)
  .regex(/^[a-z0-9_-]+$/i, 'type_key must be alphanumeric/underscore/hyphen');

// A single field / filter / metric def is arbitrary jsonb (shape enforced in
// the UI config editor); we only bound sizes to keep payloads sane.
const configArray = z.array(z.record(z.string(), z.any())).max(100);

export const partnerEntityTypeSchema = z.object({
  type_key: typeKeySchema,
  label: z.string().trim().max(120).nullish(),
  icon: z.string().trim().max(120).nullish(),
  color: z.string().trim().max(32).nullish(),
  description: z.string().max(2000).nullish(),
  sort_order: z.number().int().min(0).max(1000).optional(),
  fields: configArray.optional(),
  filters: configArray.optional(),
  metrics: configArray.optional(),
});

export const partnerEntitySchema = z.object({
  entity_type_key: typeKeySchema,
  name: z.string().trim().min(1, 'name is required').max(300),
  status: z.string().trim().max(40).optional(),
  tags: z.array(z.string().trim().max(80)).max(50).optional(),
  data: z.record(z.string(), z.any()).optional().default({}),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const businessModuleToggleSchema = z.object({
  module_id: z
    .string()
    .trim()
    .min(1, 'module_id required')
    .max(64)
    .regex(/^[a-z0-9_-]+$/i, 'module_id must be alphanumeric/underscore/hyphen'),
});

export const agentToolScoutSchema = z.object({
  // Ownership is enforced by the handler's .eq('user_id', ...); this only bounds shape.
  agent_ids: z.array(z.string().uuid()).max(100).optional(),
  all_untooled: z.boolean().optional().default(false),
  dry_run: z.boolean().optional().default(false),
  // One LLM call per agent, so cap the batch well under the serverless timeout.
  limit: z.coerce.number().int().min(1).max(25).optional().default(25),
});

// ── Organization conditioning (Vault) ────────────────────────────────────────
// The briefing is deliberately unstructured: palette/font fields would fit a
// marketing org and fail a fintech or a manufacturer. Only length is bounded.

export const orgProfileUpdateSchema = z.object({
  org_id: z.string().uuid(),
  briefing: z.string().max(50_000).optional(),
  summary: z.string().max(20_000).optional(),
  // Present when the user edited generated text, so the handler can stamp
  // `merged` and stop treating the row as safe to overwrite.
  edited: z.boolean().optional().default(false),
});

export const orgEnhancementUpsertSchema = z.object({
  org_id: z.string().uuid(),
  // Normalized role identity. Empty string = the organization-wide default.
  role_key: z.string().trim().max(200).optional().default(''),
  agent_id: z.string().trim().max(64).nullish(),
  content: z.string().max(20_000).optional(),
  is_active: z.boolean().optional(),
  // Required to replace content the user wrote or edited. Without it the
  // handler refuses to overwrite a `user` or `merged` row.
  confirm_overwrite: z.boolean().optional().default(false),
});

export const orgEnhancementGenerateSchema = z.object({
  org_id: z.string().uuid(),
  role_key: z.string().trim().max(200).optional().default(''),
  agent_id: z.string().trim().max(64).nullish(),
  confirm_overwrite: z.boolean().optional().default(false),
});

// ── Arena — people vs agents on the same daily job ────────────────
export const ARENA_SIDES = ['people', 'agents'];
export const ARENA_OUTCOMES = ['accepted', 'rework', 'rejected'];
export const ARENA_WINNERS = ['people', 'agents', 'tie'];
export const ARENA_RUN_MODES = ['mirror', 'roadmap'];
export const ARENA_RATE_SCOPES = ['person', 'role', 'department'];
export const ARENA_STAKES = ['low', 'medium', 'high'];

const arenaTaskId = z.string().min(1, 'task_id is required').max(200);

export const arenaAssetSchema = z.object({
  name: z.string().min(1).max(300),
  storage_path: z.string().max(1000).optional(),
  mime: z.string().max(200).optional(),
  size: z.number().int().min(0).max(26_214_400).optional(), // 25 MB
  kind: z.enum(['file', 'link']).default('file'),
  url: z.string().url().max(2000).optional(),
});

export const arenaRegisterSchema = z.object({
  task_id: arenaTaskId,
  actor_name: z.string().min(1, 'Who delivered it?').max(200),
  actor_role: z.string().max(200).optional(),
  title: z.string().max(300).optional(),
  note: z.string().max(5000).optional(),
  assets: z.array(arenaAssetSchema).max(20).optional().default([]),
  minutes_spent: z.number().int().min(0).max(100_000).nullable().optional(),
});

export const arenaUploadUrlSchema = z.object({
  task_id: arenaTaskId,
  filename: z.string().min(1).max(300),
  mime: z.string().max(200).optional(),
  size: z.number().int().min(1).max(26_214_400, 'Files are capped at 25 MB'),
});

export const arenaRateBodySchema = z.object({
  task_id: arenaTaskId,
  side: z.enum(ARENA_SIDES),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

export const arenaOutcomeSchema = z.object({
  task_id: arenaTaskId,
  side: z.enum(ARENA_SIDES),
  outcome: z.enum(ARENA_OUTCOMES),
});

export const arenaVerdictSchema = z.object({
  task_id: arenaTaskId,
  winner: z.enum(ARENA_WINNERS),
  reason: z.string().max(2000).optional(),
});

export const arenaRunAgentSchema = z.object({
  task_id: arenaTaskId,
  mode: z.enum(ARENA_RUN_MODES).default('mirror'),
});

export const arenaDepartmentsSchema = z.object({
  departments: z
    .array(
      z.object({
        department: z.string().min(1).max(80),
        enabled: z.boolean().default(true),
        stakes: z.enum(ARENA_STAKES).default('medium'),
        monthly_volume: z.number().int().min(0).max(1_000_000).nullable().optional(),
        // custom departments only
        label: z.string().max(120).nullable().optional(),
        description: z.string().max(500).nullable().optional(),
      })
    )
    .min(1, 'Pick at least one department')
    .max(50),
});

export const arenaRatesSchema = z.object({
  rates: z
    .array(
      z
        .object({
          scope: z.enum(ARENA_RATE_SCOPES),
          key: z.string().min(1).max(200),
          currency: z.string().min(1).max(8).default('EUR'),
          hourly_rate: z.number().min(0).max(100_000).nullable().optional(),
          per_job_cost: z.number().min(0).max(1_000_000).nullable().optional(),
        })
        .refine((r) => r.hourly_rate != null || r.per_job_cost != null, {
          message: 'Give an hourly rate or a per-job cost',
        })
    )
    .max(200),
});

export const arenaWindowQuerySchema = z.object({
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  department: z.string().max(60).optional(),
  status: z.string().max(40).optional(),
  q: z.string().max(200).optional(),
  weeks: z.coerce.number().int().min(1).max(52).optional(),
});

// ── Arena Setup Guide ─────────────────────────────────────────────
export const arenaPeopleSchema = z.object({
  people: z
    .array(
      z.object({
        name: z.string().min(1, 'Every person needs a name').max(200),
        role: z.string().max(200).default(''),
        description: z.string().max(1000).nullable().optional(),
        email: z.string().email().max(254).nullable().optional(),
        is_active: z.boolean().default(true),
      })
    )
    .max(200),
});

export const arenaStackRowSchema = z.object({
  key: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  source: z.enum(['catalog', 'custom']).default('catalog'),
  department: z.string().max(60).nullable().optional(),
});

export const arenaStackSchema = z.object({
  rows: z.array(arenaStackRowSchema).max(200),
});

export const arenaEnsureAgentsSchema = z.object({
  roles: z.array(z.string().min(1).max(200)).min(1, 'Pick at least one role').max(40),
});

export const arenaLinkBriefGoalSchema = z.object({
  stack_id: z.string().uuid(),
  goal_id: z.string().uuid(),
});

export const arenaBriefTaskSchema = z.object({
  stack_id: z.string().uuid(),
});
