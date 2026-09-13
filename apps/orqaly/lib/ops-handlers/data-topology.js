import fs from 'node:fs/promises';
import path from 'node:path';
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { GEMINI_DEFAULT_MODEL } from '../_shared/llm-defaults.js';

function slugify(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// buildSupabaseAdminClient imported from ../../api/_lib/supabase-server.js
// (replaces local version that had unsafe fallback to anon key)

function parseSqlArtifacts(sqlText) {
  const tableDefs = [];
  const viewNames = [];
  const functionNames = [];
  const triggerNames = [];
  const rlsEnabled = new Set();
  const policiesByTable = new Map();
  const indexedColumnsByTable = new Map();

  const tableRegex =
    /create\s+table\s+if\s+not\s+exists\s+public\.([a-z0-9_]+)\s*\(([\s\S]*?)\);/gim;
  let match = tableRegex.exec(sqlText);
  while (match) {
    const [, tableName, body] = match;
    const columns = [];
    const columnDetails = [];
    const foreignKeys = [];
    body
      .split('\n')
      .map((line) => line.trim())
      .forEach((line) => {
        if (!line || line.startsWith('--')) return;
        const clean = line.replace(/,$/, '');
        const colMatch = /^([a-z_][a-z0-9_]*)\s+([\w()]+)/i.exec(clean);
        if (!colMatch) return;
        const col = colMatch[1];
        const colType = colMatch[2];
        if (!['primary', 'unique', 'constraint', 'check', 'foreign'].includes(col.toLowerCase())) {
          columns.push(col);
          const isPrimary = /primary\s+key/i.test(clean);
          const hasDefault = /default\s+/i.test(clean);
          const isNotNull = /not\s+null/i.test(clean);
          const defaultMatch = /default\s+(.+?)$/i.exec(clean.replace(/references.*$/i, '').trim());
          columnDetails.push({
            name: col,
            type: colType.toLowerCase(),
            isPrimary,
            isNotNull: isNotNull || isPrimary,
            default: hasDefault ? defaultMatch?.[1]?.trim() || 'yes' : null,
            isForeignKey: /references\s+/i.test(clean),
          });
        }
        const refMatch = /references\s+public\.([a-z0-9_]+)\s*\(([a-z0-9_]+)\)/i.exec(clean);
        if (refMatch) {
          foreignKeys.push({
            column: col,
            targetTable: refMatch[1],
            targetColumn: refMatch[2],
          });
        }
      });
    tableDefs.push({ tableName, columns, columnDetails, foreignKeys });
    match = tableRegex.exec(sqlText);
  }

  const viewRegex = /create\s+(?:or\s+replace\s+)?view\s+public\.([a-z0-9_]+)/gim;
  while ((match = viewRegex.exec(sqlText))) viewNames.push(match[1]);

  const functionRegex = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)/gim;
  while ((match = functionRegex.exec(sqlText))) functionNames.push(match[1]);

  const triggerRegex = /create\s+trigger\s+([a-z0-9_]+)/gim;
  while ((match = triggerRegex.exec(sqlText))) triggerNames.push(match[1]);

  const rlsRegex = /alter\s+table\s+public\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi;
  while ((match = rlsRegex.exec(sqlText))) rlsEnabled.add(match[1]);

  const policyRegex = /create\s+policy\s+"([^"]+)"\s+on\s+public\.([a-z0-9_]+)/gim;
  while ((match = policyRegex.exec(sqlText))) {
    const [, policyName, tableName] = match;
    if (!policiesByTable.has(tableName)) policiesByTable.set(tableName, []);
    policiesByTable.get(tableName).push(policyName);
  }

  const indexRegex =
    /create\s+index\s+if\s+not\s+exists\s+[a-z0-9_]+\s+on\s+public\.([a-z0-9_]+)\s*\(([^)]+)\)/gim;
  while ((match = indexRegex.exec(sqlText))) {
    const [, tableName, indexedPart] = match;
    const cols = indexedPart
      .split(',')
      .map((x) => x.trim().replace(/"/g, ''))
      .map((x) => x.replace(/\(.+\)$/, '').trim())
      .filter(Boolean);
    if (!indexedColumnsByTable.has(tableName)) indexedColumnsByTable.set(tableName, new Set());
    cols.forEach((c) => indexedColumnsByTable.get(tableName).add(c));
  }

  return {
    tableDefs,
    viewNames: Array.from(new Set(viewNames)),
    functionNames: Array.from(new Set(functionNames)),
    triggerNames: Array.from(new Set(triggerNames)),
    rlsEnabled,
    policiesByTable,
    indexedColumnsByTable,
  };
}

function makeEntity(payload) {
  return {
    id: payload.id,
    label: payload.label,
    type: payload.type,
    category: payload.category,
    health: payload.health || 'healthy',
    description: payload.description || '',
    info: payload.info || '',
    details: payload.details || {},
    usage: payload.usage || {},
    links: payload.links || {},
    tags: payload.tags || [],
    history: payload.history || [],
    rules: payload.rules || [],
    pipelines: payload.pipelines || [],
  };
}

// Detailed, human-readable information for every entity in the system
const ENTITY_INFO = {
  // ── Frontend Pages ──
  'frontend-partners':
    'Central CRM hub for managing partner groups. Each partner has multiple teams with projects that include workflows and campaigns. Campaigns contain geos and unique tracking links. The page also monitors key performance metrics (FTD, ROI, CR) and provides full contact details, meeting history, and uploaded materials.',
  'frontend-partners-detail':
    "Deep-dive into a single partner's profile. Shows real-time performance across all teams, meeting recordings with AI transcription, activity history timeline, financial transactions, task board (Kanban), and campaign analytics. Supports voice recording for meetings with automatic structuring.",
  'frontend-dashboard':
    'Executive overview of the entire platform. Displays KPIs (total FTD, clicks, average ROI, revenue) with period-over-period comparisons. Includes health alerts for underperforming partners, geo performance breakdown, pipeline funnel, team performance charts, and traffic source quality analysis.',
  'frontend-workflow':
    'Visual workflow builder for automating partner engagement. Users design funnels with drag-and-drop blocks (landing pages, campaigns, SMS, email, scheduling). Supports templates, active/paused toggling, and linking workflows to projects and partners for automated task sequences.',
  'frontend-projects':
    'Project management system that connects partners to workflows and campaigns. Each project tracks status, budget, timeline, and links to specific partners and workflows. Provides sortable tables with search and filtering, plus a read-only preview of the linked workflow canvas.',
  'frontend-notifications':
    'AI-powered notification center that monitors system performance, partner health, and financial anomalies. Generates prioritized alerts with revenue impact scores, root cause analysis, and recommended actions. Tracks prediction accuracy and learns from outcomes to improve future notifications.',
  'frontend-settings':
    'Personal workspace configuration. Edit profile details (name, Telegram handle), manage personal notes and todo list, configure granular email notification preferences per action type. Security section includes password change, Google account linking, and 2FA setup (TOTP authenticator and YubiKey/WebAuthn).',
  'frontend-audit-log':
    'Compliance and security audit trail. Logs every significant action across the platform with user identity, IP address, country, device fingerprint, and timestamp. Each entry shows structured before/after data changes with detailed network and device information.',
  'frontend-roles':
    'Access control management for the platform. Define custom roles with granular page-level and block-level permissions. Manage users — assign roles, block/unblock accounts, reset passwords, disable 2FA, and impersonate users (super admin). Includes built-in roles (Super Admin, Manager, Viewer).',
  'frontend-ask-anything':
    'Voice-powered AI assistant. Users can speak commands or questions naturally. Audio is transcribed in real-time using Groq Whisper, then AI structures the input to extract intents, generate tasks, create workflows, or navigate the platform — all through natural language.',

  // ── API Routes ──
  'api-transcribe':
    'Processes audio recordings into structured meeting data. Accepts base64-encoded audio, transcribes via Groq Whisper (with AssemblyAI fallback), then uses an LLM to extract meeting metadata, participants, geographic focus, campaigns discussed, action items, decisions, and recommended follow-up actions.',
  'api-transcribe-status':
    'Configuration health check for transcription services. Returns whether Groq and AssemblyAI API keys are set without exposing the keys themselves. Used by the frontend to show/hide voice recording features.',
  'api-send-notification':
    'Multi-mode notification gateway. Handles authenticated email notification sending, Google Stitch template sync via shared secret, and Resend webhook event ingestion for delivery status updates.',
  'api-send-email':
    'General-purpose email delivery endpoint. Sends emails to specified recipients (up to 10) using Resend. Requires authentication via Supabase JWT token, validates all inputs, and enforces rate limiting (12/min).',
  'api-health':
    'Simple liveness probe that returns OK status. Used by monitoring systems and the dashboard to verify the API layer is responsive.',

  // ── Database Tables ──
  'table-partners':
    'Stores all partner CRM data as flexible JSONB. Each record contains the full partner object — company name, contact details, funnel status, performance tags, score, and notes. Supports dynamic fields for custom partner attributes without schema changes.',
  'table-meetings':
    'Meeting records linked to partners. Each meeting stores datetime, attendees, raw notes, AI-transcribed text, extracted action items, and structured analysis. Connected to partners via foreign key for timeline views.',
  'table-workflows':
    'Workflow automation definitions. Each record contains the visual canvas data (nodes, edges), trigger conditions, action sequences, and metadata (name, enabled status). Used by the Workflow builder and linked to Projects.',
  'table-projects':
    'Connects partners, workflows, and campaigns into organized projects. Tracks status (Active, Paused, Completed), budget, timeline, and notes. Acts as the junction between partner CRM and workflow automation.',
  'table-partner_history':
    'Immutable activity log for partner changes. Every edit, status change, meeting, and interaction is recorded with type, title, detail, and metadata. Append-only — records can never be modified or deleted.',
  'table-profile_notes':
    'Personal notes private to each user. Supports creating, editing, and deleting free-text notes. Scoped per user via Row Level Security — users can only see their own notes.',
  'table-profile_todos':
    'Personal todo list with completion tracking. Each item has text and a done/not-done status. Private per user and used in the Settings page.',
  'table-audit_log':
    'Platform-wide audit trail for compliance. Records every action type, affected entity, user identity, email, and structured details. Append-only for security — entries can be read and inserted but never modified.',
  'table-notifications':
    'AI-generated alerts with financial scoring. Each notification tracks priority, entity type, trigger conditions, profit impact score, revenue at risk, and status. Connected to action options, interactions, executions, and outcomes for full lifecycle tracking.',
  'table-action_options':
    'Recommended response actions for each AI notification. Each option includes estimated daily recovery, annual impact, implementation time, cost, risk level, and voice/text commands for quick execution.',
  'table-notification_interactions':
    'Tracks how users engage with notifications — views, time spent, dismissals, and actions taken. Used by the AI learning system to improve notification relevance.',
  'table-action_executions':
    'Records when users execute recommended actions from notifications. Captures what changes were made, validation status, and backup IDs for potential rollback.',
  'table-notification_outcomes':
    'Measures the actual impact of actions vs. AI predictions. Tracks variance percentage and effectiveness scores to calibrate the notification system over time.',
  'table-notification_learning':
    'Stores ML patterns and model updates derived from notification outcomes. Tracks accuracy scores and identified behavioral patterns that improve future predictions.',
  'table-email_notification_preferences':
    'Per-user preferences controlling which email notifications are enabled. Stored as a JSONB key-boolean map where each key represents an action type (e.g., partner_created, workflow_enabled).',
  'table-email_templates':
    'Versioned email templates synced from external providers (Google Stitch). Active templates are selected per action key during notification sends.',
  'table-email_notification_events':
    'Operational log of notification delivery lifecycle. Tracks sent/skipped/failed/delivered statuses with Resend message IDs and metadata.',
  'table-roles':
    'Role definitions with granular permissions. Each role has a name, description, color, and a JSONB map of page-level and block-level access toggles. Includes built-in roles that cannot be deleted.',
  'table-user_roles':
    'Maps users to their assigned roles. Each user can have exactly one role (unique constraint on user_id). Used by the permission system to check page and feature access.',

  // ── Backup System ──
  'api-backup-database':
    'Automated database backup as a Supabase Edge Function, triggered daily at 03:00 UTC via pg_cron. Exports all 15 database tables as JSON, compresses with gzip, uploads to the db-backups Supabase Storage bucket, and deletes backups older than 30 days. Secured with BACKUP_SECRET token.',
  'service-vercel-cron':
    'Supabase pg_cron scheduler that triggers the daily database backup at 03:00 UTC and AI partner analysis at 05:00 UTC. Configured via SQL in Supabase. No manual intervention needed once deployed.',
  'storage-db-backups':
    'Dedicated private Supabase Storage bucket for database backups. Stores compressed .json.gz files named with ISO timestamps (e.g., backup-2026-02-15T03-00-00Z.json.gz). Private bucket — no public access. Files are automatically cleaned up after 30 days by the backup function.',

  // ── Services & Infrastructure ──
  'service-supabase':
    'Core backend platform providing PostgreSQL database, user authentication (email + OAuth), file storage buckets, Row Level Security, and real-time subscriptions. All platform data flows through Supabase.',
  'service-groq':
    'Primary AI service for audio transcription (Whisper model) and LLM-powered text structuring. Processes meeting recordings into organized data — extracting participants, action items, decisions, and follow-up tasks.',
  'service-assemblyai':
    'Fallback transcription service. Activates when Groq is unavailable or fails. Provides audio-to-text conversion and LLM Gateway for transcript structuring.',
  'service-resend':
    'Email delivery service for transactional notifications. Handles sending notification emails, partner-related alerts, and system messages to users based on their notification preferences.',
  'storage-buckets':
    'Supabase Storage for binary assets. Manages file uploads (marketing materials, partner documents, meeting recordings), downloads, and access control for all platform media.',

  // ── Security ──
  'security-auth-email':
    'Standard email and password authentication. Users register with email, set a strong password, and receive a session JWT. Supports password reset and session management via Supabase Auth.',
  'security-auth-google':
    'Google OAuth single sign-on. Users can link their Google account for one-click login. Configured in the Supabase dashboard with Google Cloud Console credentials.',
  'security-rls':
    "Row Level Security policies enforced at the database level. Every table query is automatically filtered by the authenticated user's ID, ensuring complete data isolation between users without any application-level checks.",

  // ── DevOps & External Services ──
  'service-github':
    'Source code repository hosting all platform code. Tracks commits, pushes, pull requests, and branch activity. Every code change flows through GitHub before deployment. Connected to Vercel for automatic deployments on push to main branch.',
  'service-vercel-deployments':
    'Vercel deployment pipeline that builds and deploys the platform on every git push. Tracks deployment status (ready/building/error), build duration, production URL, and which commit triggered each deployment. Critical for correlating code changes with production behavior.',
  'service-azure-speech':
    'Microsoft Azure Cognitive Services Speech SDK used as a voice recognition fallback for Firefox and browsers without native Web Speech API. Loaded dynamically via web-speech-cognitive-services ponyfill. Requires VITE_AZURE_SPEECH_KEY and region configuration.',
  'service-ipwhois':
    'Free IP geolocation API (ipwho.is) called from the audit log backend on every logged action. Provides IP address, country, region, city, ISP, and ASN data for security and compliance tracking. Called client-side with a 1.8s timeout, fails silently if unavailable.',
  'service-google-stitch':
    'External template provider used to upload notification email templates. Templates are synced through /api/send-notification (template sync mode) and stored with versioning in Supabase.',
  'service-google-fonts':
    'Google Fonts CDN serving the Inter font family (weights 400-800) used across the entire platform UI. Loaded via preconnect links in index.html. If unavailable, the app falls back to system fonts, degrading visual consistency.',

  // ── New frontend pages ──
  'frontend-agent-hub':
    'Central agent management hub. Browse, create, configure, and monitor AI agents. Manage agent skills, assignments, and performance metrics. Tabs: pulse (real-time status), prompt-lab (prompt testing). Imports 15+ services including agentHubService, systemAgentsService, workflowService.',
  'frontend-consilium':
    'AI decision layer — the Consilium board. Create evaluation boards, assign LLM members with roles (chairman, evaluator, auditor), define criteria and consensus rules. Monitor agent performance, run evaluations, view analytics. Uses useConcilium and useJobs hooks.',
  'frontend-communicator':
    'Team communication hub. Real-time agent chat rooms, cross-platform messaging (Telegram, Discord, Slack). Route messages to agents for AI-powered responses. Uses useAgentRoom, useController, useConsiliumLog hooks.',
  'frontend-tools':
    'Tool marketplace and library. Browse, install, configure, and test external tools (GitHub, Vercel, Composio, browser automation). Manage API keys and credentials. Execute tools with live output. Uses toolService, toolExecutionService, composioService.',
  'frontend-job-pool':
    'Job queue management. View all agent jobs (queued, running, done, failed). Monitor job progress, retry failed jobs, cancel running ones. Pipeline management and task completion tracking. Uses agentJobService, jobService, requestService, pipelineService.',
  'frontend-goals':
    'Goal tracking and management. Create goals with budgets, monitor phase progression (planning → team-assembly → execution → evaluation). Live updates via real-time subscriptions. Approve/reject results, request changes. Uses goalService.',
  'frontend-knowledge-base':
    'Knowledge document management. Upload, organize, and search documents. AI-generated summaries from task outputs. File management with categories and tags. Used as context for agent reasoning. Uses knowledgeBaseService, kbFileService.',
  'frontend-marketplace':
    'Agent and service marketplace. Browse predefined agents, bundled skills, MCP catalog, consilium templates, organization templates, and business modules. Install and configure marketplace items. Config-driven, no direct API calls.',
  'frontend-organizations':
    'Organization management. Create orgs, manage teams, assign agents to org structures. Concilium team governance integration. Uses organizationService, orgTeamService, orgAgentService, conciliumTeamsService.',
  'frontend-investments':
    'Investment tracking. Manage deals, investors, commitment pools, and documents. Council operations for investment decisions. Uses investmentService with full CRUD for deals, investors, pools.',
  'frontend-campaigns':
    'Campaign management. Create and track marketing campaigns with geo targeting, tracking links, and performance metrics (FTD, ROI, CR). Uses campaignsService.',
  'frontend-finances':
    'Financial tracking and reporting. Revenue overview, partner payments, cost analysis. Audit log integration for financial compliance. Uses auditLogBackend.',
  'frontend-injection-hub':
    'Integration and material management hub. Upload and categorize partner materials (banners, landing pages, creatives). Translation support. Campaign linking. Uses injectionHubService, campaignsService, partnerService, translationService.',
  'frontend-task-manager':
    'Task lifecycle management. Create, assign, and track tasks across agents and team members. Email notifications on task updates. Audit logging. Uses agentHubService, partnerService, emailNotificationDispatcher, taskFileService.',
  'frontend-my-agents':
    'Personal agent dashboard. View and manage your deployed agents. Monitor pipeline status and agent performance. Uses pipelineService.',
  'frontend-reports':
    'Reporting and analytics. Build custom reports, view trend charts, bar breakdowns. Email report delivery. Uses emailNotificationDispatcher with Recharts visualization.',
  'frontend-github-pushes':
    'GitHub integration dashboard. View recent pushes, commits, branches, and deployment status. Monitor code changes across the repository.',
  'frontend-documentation':
    'Internal platform documentation. Browse guides, API references, and architecture docs. Searchable knowledge base for platform features.',
  'frontend-data':
    'This page — the Data Topology viewer. Interactive system architecture map showing all platform entities, connections, live metrics, and optimization insights. AI chat for architecture questions. Audit mode for cleanup.',

  // ── Agent handlers ──
  'agent-job-processor':
    'Central job execution hub. Claims jobs from queue (status: queued → running), routes by payload.type (run-llm, orchestrate-goal, execute-task, pulse-cycle, etc.), tracks retries (max 3), finalizes results. Handles 10+ job types. File: lib/agent-handlers/job-processor.js (40KB).',
  'agent-llm-executor':
    'LLM provider router with automatic fallback chain. Calls Groq → OpenAI → Anthropic with 25s timeout per call. Tracks token usage and cost to llm_usage table. Supports structured output, tool schemas, and streaming. File: lib/agent-handlers/llm-executor.js.',
  'agent-tool-runner':
    'ReAct tool execution loop. Max 3 iterations, 20s LLM timeout, 6s tool timeout. Executes: GitHub repos/PRs, Vercel deploys, Composio actions, browser automation, doc generation, PDF creation. File: lib/agent-handlers/tool-runner.js (45KB).',
  'agent-goal-orchestrator':
    'Goal lifecycle manager. Stages: feasibility-analysis → po-analysis → pm-planning → team-formation → tool-provisioning → execute-phase → evaluate-phase → complete. Waterfall execution with healing on failure. File: lib/agent-handlers/goal-orchestrator.js.',
  'agent-pulse-handler':
    'Autonomous agent feedback loop. Detects due pulse agents, checks budget ($0.50/day cap), fetches goal progress, reasons about performance, adjusts strategy. Triggers prompt refinement every 10 cycles. File: lib/agent-handlers/pulse-handler.js.',
  'agent-prompt-optimizer':
    'Prompt A/B testing engine. Scans autonomous agents (min 5 tasks), generates improved variants via LLM, tests with 30% traffic split. Evaluates after 3+ tasks per variant. Promotes if quality improves ≥5pp or success ≥10pp. Max 3 agents/cycle, $0.50 cap. File: lib/agent-handlers/prompt-optimizer.js.',

  // ── Consilium ──
  'consilium-board':
    'Core governance evaluation board. Groups LLM members for multi-model evaluation. Configurable approval threshold (60%), confidence threshold (70%), security level. Auto-quarantine on violation. Stores boards in concilium table.',
  'consilium-members':
    'LLM instances assigned to boards. Roles: chairman (tiebreaker), evaluator (scoring), auditor (compliance), specialist (domain), observer (read-only). Tracks: total_evaluations, avg_response_time_ms, avg_cost_usd, quarantine status.',
  'consilium-evaluation-engine':
    'Parallel multi-member evaluation. All members evaluate simultaneously (25s timeout each). Collusion detection via Jaccard similarity (>92% = flagged). Cost tracking per evaluation. Results stored in concilium_evaluations table.',
  'consilium-supervisor':
    'Automated monitoring loop. Checks: cost breaches (>daily cap), failure rates (>threshold), missed check-ins (>3 = auto-pause), security violations. Runs via cron. Applies quarantine or termination actions.',
  'consilium-agent-factory':
    'Agent creation from blueprints. Validates config (system_prompt, provider, model, tools, constraints), estimates cost per model, generates tracking_token, returns instruction packet. Stores in concilium_agents table.',
  'consilium-consensus':
    'Score aggregation calculator. Algorithms: unanimous (all agree), majority (>50%), weighted (by member weight), custom (JSONB rules). Split decision strategies: chairman_decides, reject, escalate_to_human, re_evaluate.',
  'consilium-fraud-detector':
    'Request pattern analysis. Detects: rapid-fire (≥10 requests/60s), cost anomaly (>5× average), repeated failures (≥5 consecutive). Jailbreak detection (24 regex patterns). Collusion check (cross-provider similarity). Auto-quarantine after 3 events/hour.',

  // ── Teams ──
  'team-collaboration':
    'Agent team assembly for goals. Assigns roles (designer, developer, coordinator), manages leader election, handles cooldowns (last_deal_posted_at). Creates agent_teams + agent_team_members records. Driven by goal-orchestrator team-formation stage.',
  'team-task-execution':
    'Waterfall task execution within assembled teams. Tasks run sequentially — next enqueued only after previous succeeds. Tracks per-task results, handles failures with retry. Connects to LLM executor and tool runner for actual work.',
  'team-suggestion-engine':
    'AI-powered team composition recommendations. Analyzes goal requirements, agent capabilities, past performance metrics, and workload balance to suggest optimal team structure. Frontend: teamSuggestionEngine.js.',
  'team-governance':
    'Concilium governance teams — groups of board members for oversight activities. Separate from execution teams. Members have roles (leader, member). Managed via concilium_teams and concilium_team_members tables.',

  // ── Communication ──
  'comm-agent-room':
    'Real-time agent communication channel. Agents collaborate, share context, and coordinate on tasks within shared rooms. Messages stored in communication_logs with thread_id grouping. Context types: build, deal, investment, consilium.',
  'comm-controller':
    'Communication router. Manages channel configurations across platforms (Telegram, Discord, Slack, internal). Handles message formatting, delivery, and response routing. Stores configs in communication_channels table.',

  // ── Webhooks ──
  'webhook-telegram':
    'Inbound Telegram bot webhook. Receives messages, verifies sender via allowed_ids in communication_channels config. Routes to processAssistantMessage() for AI reasoning. Response sent back via Telegram Bot API sendMessage.',
  'webhook-discord':
    'Inbound Discord slash command webhook. Receives interactions, verifies Discord signature (type=1 ping). Processes commands, stores in communication_logs. Returns type=4 response with command result.',
  'webhook-slack':
    'Inbound Slack event webhook. Receives message and app_mention events. Verifies via X-Slack-Request-Timestamp + signature. Routes to processAssistantMessage(). Response sent via Slack chat.postMessage API.',
  'webhook-supabase':
    'Supabase database webhook. Triggered on INSERT to agent_jobs table. Immediately calls processNextJob() with the new job ID — bypasses the 1-minute cron cycle for instant job processing. Auth: HMAC-SHA256 or x-webhook-token.',

  // ── LLM Providers ──
  'llm-groq':
    'Primary LLM provider. Model: llama-3.3-70b-versatile. Fast inference, cheapest option ($0.59/$0.79 per 1M tokens). Used for general tasks and Whisper transcription. Falls back to OpenAI on timeout/error.',
  'llm-openai':
    'Fallback LLM provider. Model: gpt-4o-mini. Best for tool calling and structured output ($0.15/$0.60 per 1M tokens). Primary choice for ReAct tool execution loops.',
  'llm-anthropic':
    'Premium LLM provider. Model: claude-sonnet-5. Highest quality output ($3/$15 per 1M tokens). Used for critical design work, complex reasoning, and Opus-tier tasks via ROLE_MODEL_MAP.',
  'llm-deepseek':
    'Reasoning-focused LLM. Model: deepseek-r1. Specialized for deep analysis and reasoning tasks. Variable pricing. Used via OpenRouter or direct API.',
  'llm-openrouter':
    'Multi-model aggregator. Routes to 350+ models at zero markup. Primary path to Claude Opus 5, Sonnet, Flash at competitive pricing. Auto-failover between providers.',
  'llm-together':
    'Alternative LLM provider. Various open-source models. Used as additional fallback in the provider chain. Variable pricing per model.',

  // ── Cron Jobs ──
  'cron-process-next':
    'Main job processor cron (every 1 minute). Reconciles active goals, heals stuck jobs (h01-h04 strategies), runs pulse cycles for autonomous agents, claims and executes next queued job. The heartbeat of the agent system.',
  'cron-optimize-prompts':
    'Daily prompt optimization cron (02:00 UTC). Scans autonomous agents with ≥5 completed tasks. Generates improved prompt variants via LLM. A/B tests with 30% traffic sampling. Max 3 agents per cycle, $0.50 budget cap.',
  'cron-evaluate-variants':
    'Variant evaluation cron (every 3 days, 03:00 UTC). Evaluates prompt variant performance. Compares baseline vs testing metrics. Promotes variants that improve quality ≥5pp or success rate ≥10pp. Archives underperformers.',
  'cron-backup-database':
    'Daily database backup cron (03:00 UTC). Reads all tables via Supabase REST API. Compresses to JSON.gz format. Stores in db-backups storage bucket. 30-day retention policy.',

  // ── Agent enrichment ──
  'agent-marketplace':
    'Agent registry and marketplace. Agents listed with: name, category, status (active/inactive/suspended), pricing_model (per_task/subscription/usage), cost_per_task, capabilities (JSONB). Browsable from Agent Hub and Marketplace pages.',
  'agent-blueprints':
    'Agent configuration templates. Defines: system_prompt, provider, model, temperature, max_tokens, tools (JSONB array), constraints (JSONB). Versioned with draft/active status. Used by consilium-agent-factory for agent creation.',
  'agent-skills-library':
    'Reusable skill packs for agents. Types: bundled (system), public (community), private (user). Each skill has: slug, content (prompt injection text), category, tags, compatible_roles. Installed per-agent via agent_installed_skills table. Rating and install tracking.',
  'agent-performance-tracker':
    'Agent performance metrics aggregation. Tracks per agent per period: jobs_completed, jobs_failed, avg_completion_ms, avg_quality_score, total_cost_usd, success_rate, reputation_score. Powers agent ranking and optimization decisions.',
};

const FRONTEND_USAGE = {
  partners: ['Partners', 'Partner Detail', 'Dashboard'],
  meetings: ['Partner Detail'],
  workflows: ['Workflow', 'Projects'],
  projects: ['Projects', 'Dashboard'],
  partner_history: ['Partner Detail'],
  profile_notes: ['Settings'],
  profile_todos: ['Settings'],
  notifications: ['AI Recomend'],
  action_options: ['AI Recomend'],
  notification_interactions: ['AI Recomend'],
  action_executions: ['AI Recomend'],
  notification_outcomes: ['AI Recomend'],
  notification_learning: ['AI Recomend'],
  email_notification_preferences: ['Settings'],
  email_templates: ['Settings'],
  email_notification_events: ['Settings'],
  audit_log: ['Audit Log'],
  roles: ['Roles & Permissions'],
  user_roles: ['Roles & Permissions'],
};

// Which tables each frontend page uses, with the service layer and CRUD operations
const PAGE_DATA_CHAINS = {
  'frontend-partners': {
    services: [
      {
        name: 'partnerService',
        backend: 'partnerBackend',
        tables: ['partners'],
        operations: ['select', 'upsert'],
      },
      {
        name: 'auditLogBackend',
        backend: 'auditLogBackend',
        tables: ['audit_log'],
        operations: ['insert'],
      },
    ],
    description:
      'Manages partner CRM data. Partners are stored as JSONB with flexible schema for name, company, funnel status, tags, and contact info.',
  },
  'frontend-partners-detail': {
    services: [
      {
        name: 'partnerService',
        backend: 'partnerBackend',
        tables: ['partners'],
        operations: ['select', 'upsert'],
      },
      {
        name: 'meetingService',
        backend: 'meetingBackend',
        tables: ['meetings'],
        operations: ['select', 'insert', 'update', 'delete'],
      },
      {
        name: 'partnerHistoryService',
        backend: 'partnerHistoryBackend',
        tables: ['partner_history'],
        operations: ['select', 'insert'],
      },
    ],
    description:
      'Detailed partner view with meetings timeline, history log, and voice transcription.',
  },
  'frontend-dashboard': {
    services: [
      {
        name: 'partnerService',
        backend: 'partnerBackend',
        tables: ['partners'],
        operations: ['select'],
      },
      {
        name: 'projectService',
        backend: 'projectBackend',
        tables: ['projects'],
        operations: ['select'],
      },
    ],
    description:
      'Overview dashboard showing partner stats, project summaries, and recent activity.',
  },
  'frontend-workflow': {
    services: [
      {
        name: 'workflowService',
        backend: 'workflowBackend',
        tables: ['workflows'],
        operations: ['select', 'insert', 'update', 'delete'],
      },
    ],
    description:
      'Workflow builder for automating partner engagement, email sequences, and task triggers.',
  },
  'frontend-projects': {
    services: [
      {
        name: 'projectService',
        backend: 'projectBackend',
        tables: ['projects'],
        operations: ['select', 'insert', 'update', 'delete'],
      },
      {
        name: 'workflowService',
        backend: 'workflowBackend',
        tables: ['workflows'],
        operations: ['select'],
      },
    ],
    description: 'Project management connecting partners, workflows, and campaigns.',
  },
  'frontend-notifications': {
    services: [
      {
        name: 'aiNotificationActionCenterService',
        backend: 'localStorage',
        tables: [],
        operations: [],
      },
    ],
    description:
      'AI-powered notification center. Currently uses localStorage for notification data.',
  },
  'frontend-settings': {
    services: [
      {
        name: 'profileDataBackend',
        backend: 'profileDataBackend',
        tables: ['profile_notes', 'profile_todos'],
        operations: ['select', 'insert', 'update', 'delete'],
      },
      {
        name: 'emailNotificationPreferences',
        backend: 'emailNotificationPreferences',
        tables: ['email_notification_preferences'],
        operations: ['select', 'upsert'],
      },
      {
        name: 'emailNotificationDispatcher',
        backend: 'api-send-notification',
        tables: ['email_templates', 'email_notification_events'],
        operations: ['select', 'insert'],
      },
      {
        name: 'auditLogBackend',
        backend: 'auditLogBackend',
        tables: ['audit_log'],
        operations: ['insert'],
      },
    ],
    description:
      'User settings, profile notes, todos, email notification preferences, and provider-synced template-backed notification dispatching.',
  },
  'frontend-audit-log': {
    services: [
      {
        name: 'auditLogBackend',
        backend: 'auditLogBackend',
        tables: ['audit_log'],
        operations: ['select'],
      },
    ],
    description: 'Read-only audit trail showing all user actions across the platform.',
  },
  'frontend-roles': {
    services: [
      {
        name: 'rolesPermissionsService',
        backend: 'rolesPermissionsService',
        tables: [],
        operations: [],
      },
    ],
    description: 'Role-based access control management.',
  },
  'frontend-ask-anything': {
    services: [
      {
        name: 'operatorOrchestratorService',
        backend: 'operatorOrchestratorService',
        tables: ['partners'],
        operations: ['select'],
      },
      { name: 'transcribeAPI', backend: 'api-transcribe', tables: [], operations: [] },
    ],
    description: 'Voice AI assistant with transcription and natural language commands.',
  },
};

// Which tables are used via which operations (for table entities, reverse mapping)
const TABLE_OPERATIONS = {
  partners: {
    operations: ['select', 'upsert'],
    storage: 'jsonb',
    keyField: 'data',
    description:
      'Full partner object stored as JSONB. Fields include name, company, email, phone, funnelStatus, tags, score, notes.',
  },
  meetings: {
    operations: ['select', 'insert', 'update', 'delete', 'upsert'],
    storage: 'jsonb',
    keyField: 'data',
    description:
      'Meeting records with datetime, notes, attendees, action items. Linked to partners via partner_id FK.',
  },
  workflows: {
    operations: ['select', 'insert', 'update', 'delete'],
    storage: 'jsonb',
    keyField: 'data',
    description:
      'Workflow automation definitions. Stores triggers, conditions, and actions as JSONB.',
  },
  projects: {
    operations: ['select', 'insert', 'update', 'delete'],
    storage: 'jsonb',
    keyField: 'data',
    description: 'Projects connecting partners and workflows. Tracks status, budget, timeline.',
  },
  partner_history: {
    operations: ['select', 'insert'],
    storage: 'columns',
    keyField: null,
    description:
      'Immutable activity log for partners. Records type, title, detail, and metadata for each event.',
  },
  profile_notes: {
    operations: ['select', 'insert', 'update', 'delete'],
    storage: 'columns',
    keyField: null,
    description: 'User personal notes. Private per-user data.',
  },
  profile_todos: {
    operations: ['select', 'insert', 'update', 'delete'],
    storage: 'columns',
    keyField: null,
    description: 'User todo items with completion status.',
  },
  audit_log: {
    operations: ['select', 'insert'],
    storage: 'columns',
    keyField: null,
    description:
      'Append-only audit trail. Records action, entity, user, and timestamp for compliance.',
  },
  notifications: {
    operations: ['select', 'insert', 'update'],
    storage: 'jsonb',
    keyField: 'data',
    description: 'AI-generated notifications with priority scoring and revenue impact tracking.',
  },
  action_options: {
    operations: ['select', 'insert'],
    storage: 'jsonb',
    keyField: 'data',
    description:
      'Recommended actions for each notification. Includes cost, risk, and implementation time.',
  },
  notification_interactions: {
    operations: ['select', 'insert'],
    storage: 'jsonb',
    keyField: 'details',
    description: 'User interaction tracking for notifications — views, dismissals, actions taken.',
  },
  action_executions: {
    operations: ['select', 'insert'],
    storage: 'jsonb',
    keyField: 'changes_made',
    description: 'Execution records when users take action on notifications.',
  },
  notification_outcomes: {
    operations: ['select', 'insert'],
    storage: 'columns',
    keyField: null,
    description: 'Measures predicted vs actual impact of notification actions.',
  },
  notification_learning: {
    operations: ['select', 'insert'],
    storage: 'columns',
    keyField: null,
    description: 'ML model updates and pattern identification from notification outcomes.',
  },
  email_notification_preferences: {
    operations: ['select', 'upsert'],
    storage: 'jsonb',
    keyField: 'preferences',
    description: 'Per-user email notification preferences stored as JSONB key-boolean map.',
  },
  email_templates: {
    operations: ['select', 'insert', 'update'],
    storage: 'columns',
    keyField: null,
    description: 'Versioned active email templates per action, synced from Google Stitch.',
  },
  email_notification_events: {
    operations: ['select', 'insert', 'update'],
    storage: 'jsonb',
    keyField: 'payload_meta',
    description:
      'Delivery events and statuses for notification emails (Resend id, state transitions, errors).',
  },
};

const FRONTEND_NODES = [
  { id: 'frontend-dashboard', label: 'Dashboard', aliases: ['Dashboard'] },
  { id: 'frontend-partners', label: 'Partners', aliases: ['Partners', 'Partner Detail'] },
  { id: 'frontend-workflow', label: 'Workflow', aliases: ['Workflow'] },
  { id: 'frontend-projects', label: 'Projects', aliases: ['Projects'] },
  {
    id: 'frontend-notifications',
    label: 'AI Recomend',
    aliases: ['AI Notifications', 'AI Recomend'],
  },
  { id: 'frontend-settings', label: 'Settings', aliases: ['Settings'] },
  { id: 'frontend-audit-log', label: 'Audit Log', aliases: ['Audit Log'] },
  { id: 'frontend-roles', label: 'Permissions', aliases: ['Roles & Permissions', 'Permissions'] },
  { id: 'frontend-ask-anything', label: 'AI', aliases: ['Ask Anything', 'AI', 'Voice AI'] },
  { id: 'frontend-agent-hub', label: 'Agents', aliases: ['Agent Hub', 'Agents'] },
  { id: 'frontend-consilium', label: 'Consilium', aliases: ['Consilium'] },
  { id: 'frontend-communicator', label: 'Communicator', aliases: ['Communicator'] },
  { id: 'frontend-tools', label: 'Tools', aliases: ['Tools'] },
  { id: 'frontend-job-pool', label: 'Requests', aliases: ['Job Pool', 'Requests'] },
  { id: 'frontend-goals', label: 'Goals', aliases: ['Goals'] },
  { id: 'frontend-knowledge-base', label: 'Knowledge', aliases: ['Knowledge Base', 'Knowledge'] },
  { id: 'frontend-marketplace', label: 'Marketplace', aliases: ['Marketplace'] },
  { id: 'frontend-organizations', label: 'Organizations', aliases: ['Organizations'] },
  { id: 'frontend-investments', label: 'Investments', aliases: ['Investments'] },
  { id: 'frontend-campaigns', label: 'Campaigns', aliases: ['Campaigns'] },
  { id: 'frontend-finances', label: 'Finances', aliases: ['Finances'] },
  { id: 'frontend-injection-hub', label: 'Injection', aliases: ['Injection Hub', 'Injection'] },
  { id: 'frontend-task-manager', label: 'Tasks', aliases: ['Task Manager', 'Tasks'] },
  { id: 'frontend-my-agents', label: 'My Agents', aliases: ['My Agents'] },
  { id: 'frontend-reports', label: 'Reports', aliases: ['Reports'] },
  { id: 'frontend-github-pushes', label: 'GitHub Pushes', aliases: ['GitHub Pushes'] },
  { id: 'frontend-documentation', label: 'Documentation', aliases: ['Documentation'] },
  { id: 'frontend-data', label: 'Data', aliases: ['Data Topology', 'Data'] },
];

// ── Frontend → API mappings (which API routes each page calls) ──
const FRONTEND_API_FLOWS = {
  'frontend-agent-hub': ['api-agent-enqueue', 'api-agent-status'],
  'frontend-consilium': [
    'api-concilium-boards',
    'api-concilium-agents',
    'api-concilium-evaluations',
  ],
  'frontend-communicator': ['api-communicator-agent-room', 'api-communicator-controller'],
  'frontend-tools': ['api-app-execute-tool'],
  'frontend-job-pool': ['api-agent-enqueue', 'api-agent-status'],
  'frontend-goals': ['api-app-goals', 'api-agent-enqueue'],
  'frontend-knowledge-base': ['api-app-knowledge-base'],
  'frontend-marketplace': ['api-app-marketplace'],
  'frontend-organizations': ['api-app-organizations'],
  'frontend-investments': ['api-invest'],
  'frontend-campaigns': ['api-campaigns'],
  'frontend-task-manager': ['api-agent-enqueue', 'api-agent-status'],
  'frontend-my-agents': ['api-app-pipeline'],
  'frontend-reports': ['api-reports'],
  'frontend-data': ['api-data-topology'],
  'frontend-partners': ['api-transcribe', 'api-transcribe-status'],
  'frontend-dashboard': ['api-health'],
  'frontend-ask-anything': ['api-transcribe'],
  'frontend-workflow': ['api-app-pipeline'],
  'frontend-projects': ['api-app-projects'],
  'frontend-settings': ['api-send-notification', 'api-send-email'],
  'frontend-notifications': ['api-send-notification'],
};

// ── Named pipelines (for detail inspector) ──
const PIPELINES = {
  'goal-orchestration': {
    label: 'Goal Orchestration',
    description:
      'User creates goal → job queue → agent team assembly → task execution → LLM reasoning → tool calls → completion',
    entities: [
      'frontend-goals',
      'api-agent-enqueue',
      'api-agent-process-next',
      'agent-job-processor',
      'agent-goal-orchestrator',
      'agent-llm-executor',
      'agent-tool-runner',
      'llm-groq',
      'llm-openai',
      'llm-anthropic',
    ],
  },
  'notification-pipeline': {
    label: 'AI Notification Pipeline',
    description:
      'AI generates notification → scores urgency → suggests actions → tracks user response → learns from outcomes',
    entities: [
      'frontend-notifications',
      'api-send-notification',
      'table-notifications',
      'table-action_options',
      'table-notification_interactions',
      'table-action_executions',
      'table-notification_outcomes',
      'table-notification_learning',
    ],
  },
  'backup-pipeline': {
    label: 'Database Backup',
    description:
      'Vercel cron triggers daily → backup API reads all tables → compresses to JSON → stores in Supabase storage bucket',
    entities: [
      'cron-backup-database',
      'api-backup-database',
      'service-supabase',
      'storage-db-backups',
    ],
  },
  'pulse-cycle': {
    label: 'Autonomous Pulse Cycle',
    description:
      'Cron detects due agents → checks budget → enqueues pulse job → agent reasons about performance → adjusts strategy → schedules prompt refinement',
    entities: [
      'cron-process-next',
      'api-agent-process-next',
      'agent-job-processor',
      'agent-pulse-handler',
      'agent-llm-executor',
      'agent-prompt-optimizer',
    ],
  },
  'prompt-optimization': {
    label: 'Prompt A/B Testing',
    description:
      'Daily cron → scans autonomous agents → generates improved prompt variants → A/B tests with 30% traffic → tracks performance → promotes winners',
    entities: [
      'cron-optimize-prompts',
      'api-agent-optimize-prompts',
      'agent-prompt-optimizer',
      'agent-llm-executor',
    ],
  },
  'communication-inbound': {
    label: 'Inbound Communication',
    description:
      'Platform webhook (Telegram/Discord/Slack) → verify signature → route message → agent reasoning → tool execution → send response back',
    entities: [
      'webhook-telegram',
      'webhook-discord',
      'webhook-slack',
      'api-communicator-webhook-receiver',
      'agent-llm-executor',
    ],
  },
  'agent-job-processing': {
    label: 'Agent Job Processing',
    description:
      'Every minute cron → reconcile goals → heal stuck jobs → claim next job → route by type → execute → finalize result',
    entities: [
      'cron-process-next',
      'api-agent-process-next',
      'agent-job-processor',
      'agent-llm-executor',
      'agent-tool-runner',
      'agent-goal-orchestrator',
    ],
  },
  'consilium-evaluation': {
    label: 'Consilium Evaluation',
    description:
      'Job completed → evaluation board assembles members → parallel LLM evaluation (25s timeout) → consensus calculation → approve/reject → feedback + score → analytics aggregation',
    entities: [
      'consilium-board',
      'consilium-members',
      'consilium-evaluation-engine',
      'consilium-consensus',
      'consilium-fraud-detector',
      'consilium-supervisor',
    ],
  },
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchGitHubData() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return null;
  try {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };

    // Parallel: repo metadata + branches + main commits (3 requests at once)
    const [repoRes, branchRes, mainCommitsRes] = await Promise.allSettled([
      fetchWithTimeout(`https://api.github.com/repos/${repo}`, { headers }, 3000),
      fetchWithTimeout(
        `https://api.github.com/repos/${repo}/branches?per_page=30`,
        { headers },
        3000
      ),
      fetchWithTimeout(
        `https://api.github.com/repos/${repo}/commits?per_page=30`,
        { headers },
        3000
      ),
    ]);

    let defaultBranch = 'main';
    if (repoRes.status === 'fulfilled' && repoRes.value.ok) {
      const repoData = await repoRes.value.json();
      defaultBranch = repoData.default_branch || 'main';
    }

    let branches = [defaultBranch];
    if (branchRes.status === 'fulfilled' && branchRes.value.ok) {
      const branchList = await branchRes.value.json();
      branches = branchList.map((b) => b.name);
    }

    const allCommits = [];
    if (mainCommitsRes.status === 'fulfilled' && mainCommitsRes.value.ok) {
      const commits = await mainCommitsRes.value.json();
      for (const c of commits) {
        allCommits.push({
          sha: c.sha?.slice(0, 7),
          message: c.commit?.message?.split('\n')[0] || '',
          author: c.commit?.author?.name || '',
          timestamp: c.commit?.author?.date || '',
          branch: defaultBranch,
        });
      }
    }

    return { repo, defaultBranch, branches, commits: allCommits.slice(0, 30) };
  } catch (e) {
    console.error('[GitHub] fetchGitHubData failed:', e.message);
    return null;
  }
}

async function fetchVercelDeployments() {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const res = await fetchWithTimeout(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=10`,
      { headers },
      3000
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.deployments || []).map((d) => ({
      id: d.uid,
      status: d.state || d.readyState,
      url: d.url,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
      readyAt: d.ready ? new Date(d.ready).toISOString() : null,
      duration: d.ready && d.createdAt ? Math.round((d.ready - d.createdAt) / 1000) : null,
      gitCommitSha: d.meta?.githubCommitSha?.slice(0, 7) || null,
      gitCommitMessage: d.meta?.githubCommitMessage?.split('\n')[0] || null,
      gitCommitAuthor: d.meta?.githubCommitAuthorName || null,
      target: d.target || 'preview',
    }));
  } catch {
    return null;
  }
}

async function readDirFilesSafe(dirPath) {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function buildTopologyPayload() {
  const root = process.cwd();
  const migrationsDir = path.join(root, 'supabase', 'migrations');
  const apiDir = path.join(root, 'api');

  const migrationEntries = (await readDirFilesSafe(migrationsDir))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const sqlTexts = await Promise.all(
    migrationEntries.map((entry) =>
      fs.readFile(path.join(migrationsDir, entry.name), 'utf8').catch(() => '')
    )
  );
  const parsed = parseSqlArtifacts(sqlTexts.join('\n\n'));

  const supabaseClient = buildSupabaseAdminClient();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const projectRef = supabaseUrl ? (supabaseUrl.split('//')[1] || '').split('.')[0] : '';
  const entities = [];
  const edges = [];

  // Frontend nodes — enriched with data chain info (Voice AI is an agent)
  FRONTEND_NODES.forEach(({ id, label }) => {
    const chain = PAGE_DATA_CHAINS[id] || null;
    const category = 'frontend';
    entities.push(
      makeEntity({
        id,
        label,
        type: 'frontend',
        category,
        description: chain?.description || `${label} page and related components.`,
        info: ENTITY_INFO[id] || '',
        details: {
          dataChain: chain?.services || [],
          relatedTables: chain ? [...new Set(chain.services.flatMap((s) => s.tables))] : [],
        },
      })
    );
  });

  // Tables from migrations + live row counts (parallel to avoid timeout)
  const tableHealthIssues = [];
  const countByTable = {};
  if (supabaseClient && parsed.tableDefs.length > 0) {
    await Promise.all(
      parsed.tableDefs.map(async (table) => {
        let rowCount = null;
        let exists = true;
        let countError = null;
        const result = await supabaseClient
          .from(table.tableName)
          .select('*', { count: 'exact', head: true });
        if (result.error) {
          exists = !String(result.error.message || '')
            .toLowerCase()
            .includes('relation');
          countError = result.error.message;
        } else {
          rowCount = result.count;
        }
        countByTable[table.tableName] = { rowCount, exists, countError };
      })
    );
  }
  for (const table of parsed.tableDefs) {
    const {
      rowCount = null,
      exists = true,
      countError = null,
    } = countByTable[table.tableName] || {};

    const rlsEnabled = parsed.rlsEnabled.has(table.tableName);
    const policies = parsed.policiesByTable.get(table.tableName) || [];
    const indexedCols = parsed.indexedColumnsByTable.get(table.tableName) || new Set();
    const missingFkIndexes = table.foreignKeys
      .filter((fk) => !indexedCols.has(fk.column))
      .map((fk) => fk.column);

    const broadPolicies = policies.filter((p) => p.toLowerCase().includes('authenticated'));

    let health = 'healthy';
    const tags = [];
    if (!rlsEnabled) {
      health = 'critical';
      tags.push('no-rls');
      tableHealthIssues.push(`${table.tableName}: RLS disabled`);
    } else if (missingFkIndexes.length > 0 || broadPolicies.length > 0 || !exists) {
      health = 'warning';
      if (missingFkIndexes.length > 0) tags.push(`missing-fk-index:${missingFkIndexes.join(',')}`);
      if (broadPolicies.length > 0) tags.push('broad-rls-policy');
      if (!exists) tags.push('table-not-found-live-db');
    }

    const tableOps = TABLE_OPERATIONS[table.tableName] || {};
    const tableId = `table-${table.tableName}`;
    const tableAppPathMap = {
      email_notification_preferences: '/settings#notifications',
      email_templates: '/settings#notifications',
      email_notification_events: '/settings#notifications',
    };
    entities.push(
      makeEntity({
        id: tableId,
        label: table.tableName,
        type: 'table',
        category: 'database',
        health,
        description: tableOps.description || `Database table ${table.tableName}.`,
        info: ENTITY_INFO[tableId] || '',
        details: {
          columns: table.columns,
          columnDetails: table.columnDetails || [],
          rowCount,
          rls: rlsEnabled ? 'enabled' : 'disabled',
          policies,
          foreignKeys: table.foreignKeys.map(
            (fk) => `${fk.column} -> ${fk.targetTable}.${fk.targetColumn}`
          ),
          liveStatus: exists ? 'ok' : `missing (${countError || 'unknown'})`,
          operations: tableOps.operations || [],
          storagePattern: tableOps.storage || 'columns',
          jsonbKeyField: tableOps.keyField || null,
        },
        usage: { pages: FRONTEND_USAGE[table.tableName] || [] },
        links: {
          supabasePath: `/editor?schema=public&table=${table.tableName}`,
          ...(tableAppPathMap[table.tableName]
            ? { appPath: tableAppPathMap[table.tableName] }
            : {}),
        },
        tags,
      })
    );

    for (const fk of table.foreignKeys) {
      edges.push({
        id: `fk-${table.tableName}-${fk.column}-${fk.targetTable}`,
        source: `table-${table.tableName}`,
        target: `table-${fk.targetTable}`,
        relationship: 'foreign-key',
      });
    }
  }

  // Views/functions/triggers from SQL
  if (parsed.viewNames.length > 0) {
    parsed.viewNames.forEach((name) => {
      entities.push(
        makeEntity({
          id: `view-${name}`,
          label: name,
          type: 'view',
          category: 'database',
          description: `SQL view ${name}.`,
        })
      );
    });
  }
  // Placeholder -none entities removed — they had 0 edges and added noise

  if (parsed.functionNames.length > 0) {
    parsed.functionNames.forEach((name) => {
      entities.push(
        makeEntity({
          id: `function-${name}`,
          label: name,
          type: 'function',
          category: 'database',
          description: `SQL function ${name}.`,
        })
      );
    });
  }

  if (parsed.triggerNames.length > 0) {
    parsed.triggerNames.forEach((name) => {
      entities.push(
        makeEntity({
          id: `trigger-${name}`,
          label: name,
          type: 'trigger',
          category: 'database',
          description: `SQL trigger ${name}.`,
        })
      );
    });
  }

  // APIs from /api folder (read files in parallel)
  const apiEntries = await readDirFilesSafe(apiDir);
  const apiFiles = apiEntries.filter(
    (entry) => entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'data-topology.js'
  );
  const apiFileContents = await Promise.all(
    apiFiles.map((apiFile) => fs.readFile(path.join(apiDir, apiFile.name), 'utf8').catch(() => ''))
  );
  const apiAppPathMap = {
    'send-notification': '/settings#notifications',
  };
  for (let i = 0; i < apiFiles.length; i++) {
    const apiFile = apiFiles[i];
    const fileContent = apiFileContents[i] || '';
    const name = apiFile.name.replace(/\.js$/, '');
    const endpoint = `/api/${name}`;
    const hasSupabaseAuth = fileContent.includes('verifySupabaseToken(');
    const hasSecretAuth =
      fileContent.includes('BACKUP_SECRET') ||
      fileContent.includes('x-vercel-cron') ||
      fileContent.includes('STITCH_TEMPLATE_SYNC_TOKEN') ||
      fileContent.includes('RESEND_WEBHOOK_SECRET');
    const authRequired = hasSupabaseAuth || hasSecretAuth;
    const methodMatch = /if\s*\(req\.method\s*!==\s*'([A-Z]+)'\)/.exec(fileContent);
    const method = methodMatch ? methodMatch[1] : 'GET/POST';
    const isPublicRisk = !authRequired;
    const apiId = `api-${name}`;
    entities.push(
      makeEntity({
        id: apiId,
        label: `${method} ${endpoint}`,
        type: 'api',
        category: 'api',
        health: isPublicRisk ? 'warning' : 'healthy',
        description: `Vercel API route: ${endpoint}`,
        info: ENTITY_INFO[apiId] || '',
        details: { method, authRequired },
        links: { endpoint, ...(apiAppPathMap[name] ? { appPath: apiAppPathMap[name] } : {}) },
        tags: isPublicRisk ? ['public-endpoint-no-auth'] : [],
      })
    );
  }

  // Storage buckets live (used for db-backups check)
  let bucketNames = [];
  if (supabaseClient?.storage?.listBuckets) {
    const bucketsRes = await supabaseClient.storage.listBuckets();
    if (!bucketsRes.error && Array.isArray(bucketsRes.data)) {
      bucketNames = bucketsRes.data.map((bucket) => bucket.name);
    }
  }

  // Auth providers (actually integrated)
  entities.push(
    makeEntity({
      id: 'security-auth-email',
      label: 'Email/Password Auth',
      type: 'auth',
      category: 'security',
      health: 'healthy',
      description: 'Supabase email authentication provider. Active and working.',
      info: ENTITY_INFO['security-auth-email'] || '',
    })
  );
  entities.push(
    makeEntity({
      id: 'security-auth-google',
      label: 'Google OAuth',
      type: 'auth',
      category: 'security',
      health: 'healthy',
      description: 'Google OAuth via Supabase Auth. Configured in Supabase dashboard.',
      info: ENTITY_INFO['security-auth-google'] || '',
    })
  );

  // Core infrastructure services (actually integrated)
  entities.push(
    makeEntity({
      id: 'service-supabase',
      label: 'Supabase',
      type: 'service',
      category: 'infrastructure',
      health: supabaseClient ? 'healthy' : 'warning',
      description: supabaseClient
        ? 'Primary database, auth, and storage. Connected and active.'
        : 'Supabase env not configured.',
      info: ENTITY_INFO['service-supabase'] || '',
      details: { projectRef: projectRef || null },
    })
  );

  // Only show services that have real code integrations
  const groqEnabled = Boolean(process.env.GROQ_API_KEY);
  entities.push(
    makeEntity({
      id: 'service-groq',
      label: 'Groq API',
      type: 'service',
      category: 'infrastructure',
      health: groqEnabled ? 'healthy' : 'warning',
      description: groqEnabled
        ? 'Primary transcription (Whisper) and LLM structuring. Active.'
        : 'Groq API key not detected.',
      info: ENTITY_INFO['service-groq'] || '',
      details: { envKey: 'GROQ_API_KEY', enabled: groqEnabled },
    })
  );

  const assemblyaiEnabled = Boolean(process.env.ASSEMBLYAI_API_KEY);
  entities.push(
    makeEntity({
      id: 'service-assemblyai',
      label: 'AssemblyAI',
      type: 'service',
      category: 'infrastructure',
      health: assemblyaiEnabled ? 'healthy' : 'warning',
      description: assemblyaiEnabled
        ? 'Fallback transcription service. Active.'
        : 'AssemblyAI key not detected.',
      info: ENTITY_INFO['service-assemblyai'] || '',
      details: { envKey: 'ASSEMBLYAI_API_KEY', enabled: assemblyaiEnabled },
    })
  );

  // Resend: code exists in API routes but requires RESEND_API_KEY to function
  const resendEnabled = Boolean(process.env.RESEND_API_KEY);
  entities.push(
    makeEntity({
      id: 'service-resend',
      label: 'Resend',
      type: 'service',
      category: 'infrastructure',
      health: resendEnabled ? 'healthy' : 'warning',
      description: resendEnabled
        ? 'Email delivery service. Active.'
        : 'Email service implemented but RESEND_API_KEY not configured. Emails will not send.',
      info: ENTITY_INFO['service-resend'] || '',
      details: { envKey: 'RESEND_API_KEY', enabled: resendEnabled },
      tags: resendEnabled ? [] : ['not-configured'],
    })
  );

  const stitchEnabled = Boolean(process.env.STITCH_TEMPLATE_SYNC_TOKEN);
  entities.push(
    makeEntity({
      id: 'service-google-stitch',
      label: 'Google Stitch',
      type: 'service',
      category: 'infrastructure',
      health: stitchEnabled ? 'healthy' : 'warning',
      description: stitchEnabled
        ? 'Template sync provider is configured. Notification templates can be uploaded and activated.'
        : 'Template sync provider token not configured. Uploaded provider templates are disabled.',
      info: ENTITY_INFO['service-google-stitch'] || '',
      details: { envKey: 'STITCH_TEMPLATE_SYNC_TOKEN', enabled: stitchEnabled },
      tags: stitchEnabled ? [] : ['not-configured'],
    })
  );

  // NOTE: Stripe, SendGrid, Firebase are NOT integrated in the codebase.
  // They were previously listed as env checks but have no actual code usage.
  // Removed to show only real, working connections.

  // ── LLM Providers (from llm-executor.js and llm-executor-v2.js) ──
  const llmProviders = [
    {
      id: 'llm-groq',
      label: 'Groq',
      envKey: 'GROQ_API_KEY',
      model: 'llama-3.3-70b-versatile',
      role: 'Optional LLM — fast inference',
      cost: '$0.59/$0.79 per 1M tokens',
    },
    {
      id: 'llm-openai',
      label: 'OpenAI',
      envKey: 'OPENAI_API_KEY',
      model: 'gpt-4o-mini',
      role: 'Fallback LLM — tool calling',
      cost: '$0.15/$0.60 per 1M tokens',
    },
    {
      id: 'llm-anthropic',
      label: 'Anthropic',
      envKey: 'ANTHROPIC_API_KEY',
      model: 'claude-sonnet-5',
      role: 'Premium LLM — quality output',
      cost: '$3/$15 per 1M tokens',
    },
    {
      id: 'llm-deepseek',
      label: 'DeepSeek',
      envKey: 'DEEPSEEK_API_KEY',
      model: 'deepseek-r1',
      role: 'Reasoning tasks',
      cost: 'Variable',
    },
    {
      id: 'llm-gemini',
      label: 'Google Gemini',
      envKey: 'GEMINI_API_KEY',
      model: GEMINI_DEFAULT_MODEL,
      role: 'Default multimodal LLM',
      cost: '$1.50/$7.50 per 1M tokens (flash)',
    },
    {
      id: 'llm-openrouter',
      label: 'OpenRouter',
      envKey: 'OPENROUTER_API_KEY',
      model: 'multi-model',
      role: 'Model aggregator — 5+ providers',
      cost: 'Variable per model',
    },
    {
      id: 'llm-together',
      label: 'Together.ai',
      envKey: 'TOGETHER_API_KEY',
      model: 'various',
      role: 'Alternative provider',
      cost: 'Variable',
    },
  ];
  llmProviders.forEach(({ id, label, envKey, model, role, cost }) => {
    const enabled = Boolean(process.env[envKey]);
    entities.push(
      makeEntity({
        id,
        label,
        type: 'llm',
        category: 'llm',
        health: enabled ? 'healthy' : 'warning',
        description: enabled
          ? `${role}. Model: ${model}. Active.`
          : `${label} not configured (${envKey}).`,
        details: { envKey, enabled, model, role, cost },
        tags: enabled ? [] : ['not-configured'],
        rules: [
          {
            label: 'Auto-fallback',
            detail:
              'If primary times out (>25s) or errors (429/400/403/5xx), next provider in chain is tried',
          },
          {
            label: 'Cost tracking',
            detail: `Token usage recorded to llm_usage table. Rate: ${cost}`,
          },
        ],
        pipelines: [
          'goal-orchestration',
          'pulse-cycle',
          'prompt-optimization',
          'agent-job-processing',
        ],
      })
    );
  });

  // ── Individual Cron Jobs (from vercel.json) ──
  const cronJobs = [
    {
      id: 'cron-process-next',
      label: 'Process Next Job',
      schedule: '*/1 * * * *',
      frequency: 'Every minute',
      target: 'api-agent-process-next',
      description:
        'Main job processor — reconciles goals, heals stuck jobs, runs pulse cycles, claims and executes next queued job.',
    },
    {
      id: 'cron-optimize-prompts',
      label: 'Optimize Prompts',
      schedule: '0 2 * * *',
      frequency: 'Daily at 02:00 UTC',
      target: 'api-agent-optimize-prompts',
      description:
        'Scans autonomous agents, generates improved prompt variants, A/B tests with 30% traffic sampling.',
    },
    {
      id: 'cron-evaluate-variants',
      label: 'Evaluate Variants',
      schedule: '0 3 */3 * *',
      frequency: 'Every 3 days at 03:00 UTC',
      target: 'api-agent-evaluate-variants',
      description:
        'Evaluates prompt variant performance, promotes winners, retires underperformers.',
    },
    {
      id: 'cron-backup-database',
      label: 'Backup Database',
      schedule: '0 3 * * *',
      frequency: 'Daily at 03:00 UTC',
      target: 'api-backup-database',
      description:
        'Reads all tables via Supabase REST, compresses to JSON.gz, stores in db-backups bucket. 30-day retention.',
    },
  ];
  cronJobs.forEach(({ id, label, schedule, frequency, target, description }) => {
    entities.push(
      makeEntity({
        id,
        label,
        type: 'cron',
        category: 'crons',
        health: 'healthy',
        description,
        details: { schedule, frequency, target },
        rules: [
          { label: 'Schedule', detail: `${schedule} (${frequency})` },
          {
            label: 'Trigger',
            detail: `GET /api/agent?path=${target.replace('api-agent-', '').replace('api-', '')}`,
          },
        ],
        pipelines: PIPELINES[
          Object.keys(PIPELINES).find((k) => (PIPELINES[k].entities || []).includes(id))
        ]
          ? [Object.keys(PIPELINES).find((k) => (PIPELINES[k].entities || []).includes(id))]
          : [],
      })
    );
  });

  // ── Agent Pipeline Handlers (from lib/agent-handlers/) ──
  const agentHandlers = [
    {
      id: 'agent-job-processor',
      label: 'Job Processor',
      description:
        'Central hub — claims jobs from queue, routes by payload.type (run-llm, orchestrate-goal, execute-task, pulse-cycle, etc.), finalizes results.',
      file: 'job-processor.js',
    },
    {
      id: 'agent-llm-executor',
      label: 'LLM Executor',
      description:
        'Routes LLM calls across providers (Groq→OpenAI→Anthropic) with automatic fallback on timeout/error. Tracks token usage and cost.',
      file: 'llm-executor.js',
    },
    {
      id: 'agent-tool-runner',
      label: 'Tool Runner',
      description:
        'ReAct loop (max 3 iterations, 20s timeout per LLM call). Executes tools: GitHub, Vercel, Composio, browser automation, doc generation.',
      file: 'tool-runner.js',
    },
    {
      id: 'agent-goal-orchestrator',
      label: 'Goal Orchestrator',
      description:
        'Manages goal lifecycle stages: library-calibration → planning → team-assembly → execution. Waterfall task sequencing.',
      file: 'goal-orchestrator.js',
    },
    {
      id: 'agent-pulse-handler',
      label: 'Pulse Handler',
      description:
        'Autonomous feedback loop — fetches agent goal progress, reasons about performance, adjusts strategy. Budget-controlled.',
      file: 'pulse-handler.js',
    },
    {
      id: 'agent-prompt-optimizer',
      label: 'Prompt Optimizer',
      description:
        'A/B tests prompt variants with 30% traffic sampling. Generates improved prompts via LLM, tracks performance metrics.',
      file: 'prompt-optimizer.js',
    },
  ];
  agentHandlers.forEach(({ id, label, description, file }) => {
    const pipelineKeys = Object.keys(PIPELINES).filter((k) =>
      (PIPELINES[k].entities || []).includes(id)
    );
    entities.push(
      makeEntity({
        id,
        label,
        type: 'agent',
        category: 'agents',
        health: 'healthy',
        description,
        details: { file: `lib/agent-handlers/${file}` },
        rules: [
          { label: 'Auth', detail: 'Internal — called by job queue, not directly exposed via API' },
          { label: 'Timeout', detail: 'Max 180s per job execution (Vercel function limit)' },
        ],
        pipelines: pipelineKeys,
      })
    );
  });

  // ── Webhook Inbound Entities ──
  const webhookEntities = [
    {
      id: 'webhook-telegram',
      label: 'Telegram Bot',
      description:
        'Inbound messages from Telegram bot. Verified via allowed_ids in communication_channels config.',
    },
    {
      id: 'webhook-discord',
      label: 'Discord Bot',
      description:
        'Discord slash command interactions. Verified via Discord signature verification.',
    },
    {
      id: 'webhook-slack',
      label: 'Slack Bot',
      description:
        'Slack event subscriptions (message, app_mention). Verified via X-Slack-Request-Timestamp + signature.',
    },
    {
      id: 'webhook-supabase',
      label: 'Supabase DB Webhook',
      description:
        'INSERT trigger on agent_jobs table. Immediately processes newly queued jobs without waiting for cron.',
    },
  ];
  webhookEntities.forEach(({ id, label, description }) => {
    entities.push(
      makeEntity({
        id,
        label,
        type: 'webhook',
        category: 'communication',
        health: 'healthy',
        description,
        rules: [
          {
            label: 'Auth',
            detail:
              id === 'webhook-supabase'
                ? 'HMAC-SHA256 signature or x-webhook-token header'
                : 'Platform-specific signature verification',
          },
        ],
        pipelines: id === 'webhook-supabase' ? ['agent-job-processing'] : ['communication-inbound'],
      })
    );
  });

  // ── Communication Entities ──
  const commEntities = [
    {
      id: 'comm-agent-room',
      label: 'Agent Room',
      description:
        'Real-time agent communication channel. Agents collaborate, share context, and coordinate on tasks within shared rooms.',
    },
    {
      id: 'comm-controller',
      label: 'Communication Controller',
      description:
        'Routes messages across platforms (Telegram, Discord, Slack). Manages channel configs, message formatting, and delivery.',
    },
  ];
  commEntities.forEach(({ id, label, description }) => {
    entities.push(
      makeEntity({
        id,
        label,
        type: 'service',
        category: 'communication',
        health: 'healthy',
        description,
      })
    );
  });

  // ── Teams Entities ──
  const teamEntities = [
    {
      id: 'team-collaboration',
      label: 'Team Assembly',
      description:
        'Assembles agent teams for goals. Assigns roles (designer, developer, coordinator), manages leader election and cooldowns.',
    },
    {
      id: 'team-task-execution',
      label: 'Task Execution',
      description:
        'Waterfall task execution within teams. Tasks run sequentially — next task enqueued only after previous succeeds. Tracks per-task results.',
    },
  ];
  teamEntities.forEach(({ id, label, description }) => {
    entities.push(
      makeEntity({ id, label, type: 'service', category: 'teams', health: 'healthy', description })
    );
  });

  // ── Consilium Entities ──
  const consiliumEntities = [
    {
      id: 'consilium-board',
      label: 'Evaluation Board',
      description:
        'Core governance body — groups LLM members for multi-model evaluation. Configurable approval/confidence thresholds, security levels.',
    },
    {
      id: 'consilium-members',
      label: 'Board Members',
      description:
        'LLM instances with roles: chairman, evaluator, auditor, specialist, observer. Tracks performance, quarantine status, cost, tokens.',
    },
    {
      id: 'consilium-evaluation-engine',
      label: 'Evaluation Engine',
      type: 'agent',
      description:
        'Parallel multi-member evaluation with consensus. Per-member 25s timeout, collusion detection, cost tracking.',
    },
    {
      id: 'consilium-supervisor',
      label: 'Supervisor',
      type: 'agent',
      description:
        'Auto-monitoring loop: cost breaches, failure rates, missed check-ins (>3 = auto-pause), security violations.',
    },
    {
      id: 'consilium-agent-factory',
      label: 'Agent Factory',
      description:
        'Creates agents from blueprints with cost estimation per model, generates tracking tokens, returns instruction packets.',
    },
    {
      id: 'consilium-consensus',
      label: 'Consensus Calculator',
      description:
        'Aggregates member scores: unanimous, majority, weighted, custom. Split decision strategies: chairman_decides, reject, escalate, re_evaluate.',
    },
    {
      id: 'consilium-fraud-detector',
      label: 'Fraud Detector',
      description:
        'Request pattern analysis: rapid-fire (≥10/60s), cost anomaly (>5x avg), repeated failures (≥5). Jailbreak detection (24 regex). Collusion check (Jaccard >92%).',
    },
  ];
  consiliumEntities.forEach(({ id, label, description, type: eType }) => {
    entities.push(
      makeEntity({
        id,
        label,
        type: eType || 'service',
        category: 'consilium',
        health: 'healthy',
        description,
        rules: [
          { label: 'Approval threshold', detail: '60% default (configurable per board)' },
          { label: 'Confidence threshold', detail: '70% default' },
          { label: 'Auto-quarantine', detail: '≥3 fraud events in 1h triggers quarantine' },
        ],
        pipelines: ['consilium-evaluation'],
      })
    );
  });

  // ── Agent Enrichment Entities ──
  const agentEnrichEntities = [
    {
      id: 'agent-marketplace',
      label: 'Agent Marketplace',
      description:
        'Agent registry with pricing (per_task, subscription, usage), categories, capabilities. Status lifecycle: active → suspended → pending_review.',
    },
    {
      id: 'agent-blueprints',
      label: 'Agent Blueprints',
      description:
        'Config templates: system_prompt, provider, model, temperature, max_tokens, tools, constraints. Versioned, draft/active status.',
    },
    {
      id: 'agent-skills-library',
      label: 'Skills Library',
      description:
        'Skill packs (bundled, public, private). Reusable prompt injections installed per agent. Categories, tags, ratings, install counts.',
    },
    {
      id: 'agent-performance-tracker',
      label: 'Performance Tracker',
      description:
        'Metrics per agent per period: success_rate, avg_completion_ms, avg_quality_score, total_cost_usd, reputation_score.',
    },
  ];
  agentEnrichEntities.forEach(({ id, label, description }) => {
    entities.push(
      makeEntity({ id, label, type: 'service', category: 'agents', health: 'healthy', description })
    );
  });

  // ── Team Enrichment Entities ──
  entities.push(
    makeEntity({
      id: 'team-suggestion-engine',
      label: 'Suggestion Engine',
      type: 'agent',
      category: 'teams',
      health: 'healthy',
      description:
        'AI-based team composition recommendations. Analyzes goal requirements, agent capabilities, and past performance to suggest optimal team structure.',
    })
  );
  entities.push(
    makeEntity({
      id: 'team-governance',
      label: 'Governance Teams',
      type: 'service',
      category: 'teams',
      health: 'healthy',
      description:
        'Concilium governance teams — groups of board members for oversight activities. Separate from execution teams.',
    })
  );

  // ── Additional API Routes (handler-level, not just top-level files) ──
  const additionalApiRoutes = [
    {
      id: 'api-agent-enqueue',
      label: 'POST /api/agent/enqueue',
      description: 'Enqueue a new agent job. Validates JWT, rate-limits 30 req/min per user.',
      auth: true,
    },
    {
      id: 'api-agent-process-next',
      label: 'GET /api/agent/process-next',
      description:
        'Cron-triggered: reconcile goals, heal stuck jobs, pulse cycles, process next job.',
      auth: true,
    },
    {
      id: 'api-agent-status',
      label: 'GET /api/agent/status',
      description: 'Poll job status by ID.',
      auth: true,
    },
    {
      id: 'api-agent-webhook-process',
      label: 'POST /api/agent/webhook-process',
      description: 'Supabase DB webhook — immediately processes newly inserted job.',
      auth: true,
    },
    {
      id: 'api-agent-heal-goal',
      label: 'POST /api/agent/heal-goal',
      description: 'Recover stuck goals with healing strategies (h01-h04, h99 escalate).',
      auth: true,
    },
    {
      id: 'api-agent-optimize-prompts',
      label: 'GET /api/agent/optimize-prompts',
      description: 'Cron: scan agents and optimize prompt variants.',
      auth: true,
    },
    {
      id: 'api-agent-evaluate-variants',
      label: 'GET /api/agent/evaluate-variants',
      description: 'Cron: evaluate prompt variant performance.',
      auth: true,
    },
    {
      id: 'api-app-goals',
      label: 'POST /api/app?path=goals',
      description: 'Goal CRUD — create, list, get, pause, resume, cancel, retry, update-budget.',
      auth: true,
    },
    {
      id: 'api-app-pipeline',
      label: 'POST /api/app?path=pipeline',
      description: 'Pipeline operations — requestToJob, runPipeline, checkJobTaskCompletion.',
      auth: true,
    },
    {
      id: 'api-app-execute-tool',
      label: 'POST /api/app?path=execute-tool',
      description: 'Execute a tool (API, Composio, internal) with credentials.',
      auth: true,
    },
    {
      id: 'api-app-assistant-chat',
      label: 'POST /api/app?path=assistant-chat',
      description: 'AI assistant chat endpoint with streaming support.',
      auth: true,
    },
    {
      id: 'api-app-marketplace',
      label: 'GET /api/app?path=marketplace',
      description: 'Agent marketplace — browse, install, rate agents.',
      auth: true,
    },
    {
      id: 'api-app-organizations',
      label: 'POST /api/app?path=organizations',
      description: 'Organization CRUD and team management.',
      auth: true,
    },
    {
      id: 'api-app-projects',
      label: 'POST /api/app?path=projects',
      description: 'Project management — link partners, workflows, campaigns.',
      auth: true,
    },
    {
      id: 'api-app-knowledge-base',
      label: 'POST /api/app?path=knowledge-base',
      description: 'Knowledge document CRUD and file management.',
      auth: true,
    },
    {
      id: 'api-invest',
      label: 'POST /api/invest',
      description: 'Investment management — deals, investors, pools, commitments.',
      auth: true,
    },
    {
      id: 'api-concilium-boards',
      label: 'POST /api/concilium/boards',
      description: 'Concilium board CRUD.',
      auth: true,
    },
    {
      id: 'api-concilium-agents',
      label: 'POST /api/concilium/agents',
      description: 'Concilium agent management and blueprints.',
      auth: true,
    },
    {
      id: 'api-concilium-evaluations',
      label: 'POST /api/concilium/evaluations',
      description: 'Agent evaluation results and analytics.',
      auth: true,
    },
    {
      id: 'api-communicator-agent-room',
      label: 'POST /api/communicator/agent-room',
      description: 'Agent communication room — real-time agent chat.',
      auth: true,
    },
    {
      id: 'api-communicator-controller',
      label: 'POST /api/communicator/controller',
      description: 'Communication controller — manage channels and routing.',
      auth: true,
    },
    {
      id: 'api-communicator-webhook-receiver',
      label: 'POST /api/communicator/webhook-receiver',
      description: 'Inbound webhook receiver for Telegram, Discord, Slack, generic webhooks.',
      auth: true,
    },
    {
      id: 'api-campaigns',
      label: 'GET /api/campaigns',
      description: 'Campaign listing and management.',
      auth: true,
    },
    {
      id: 'api-reports',
      label: 'GET /api/reports',
      description: 'Report generation and analytics.',
      auth: true,
    },
    {
      id: 'api-data-topology',
      label: 'GET /api/data-topology',
      description: 'This endpoint — builds live system topology graph.',
      auth: true,
    },
  ];
  additionalApiRoutes.forEach(({ id, label, description, auth }) => {
    // Skip if already exists (from file scan)
    if (entities.some((e) => e.id === id)) return;
    entities.push(
      makeEntity({
        id,
        label,
        type: 'api',
        category: 'api',
        health: 'healthy',
        description,
        details: { method: label.split(' ')[0], authRequired: auth },
        rules: [
          { label: 'Auth', detail: 'Supabase JWT required' },
          ...(id.includes('agent') ? [{ label: 'Rate limit', detail: '30 req/min per user' }] : []),
        ],
      })
    );
  });

  // ── DevOps: Fetch external data in parallel ──
  const [githubData, vercelDeployments] = await Promise.all([
    fetchGitHubData(),
    fetchVercelDeployments(),
  ]);
  const githubTokenSet = Boolean(process.env.GITHUB_TOKEN);
  const githubRepo = process.env.GITHUB_REPO || '';
  entities.push(
    makeEntity({
      id: 'service-github',
      label: 'GitHub',
      type: 'service',
      category: 'infrastructure',
      health: githubData ? 'healthy' : 'warning',
      description: githubData
        ? `Source code repository (${githubRepo}). ${githubData.commits.length} recent commits across ${githubData.branches?.length || 1} branch${(githubData.branches?.length || 1) > 1 ? 'es' : ''}.`
        : githubTokenSet
          ? 'GitHub token set but could not fetch data. Check GITHUB_REPO format (owner/repo).'
          : 'GitHub monitoring not configured. Set GITHUB_TOKEN and GITHUB_REPO env vars.',
      info: ENTITY_INFO['service-github'] || '',
      details: {
        repo: githubData?.repo || githubRepo || null,
        defaultBranch: githubData?.defaultBranch || 'main',
        branches: githubData?.branches || [],
        latestCommit: githubData?.commits?.[0]?.sha || null,
        latestCommitMessage: githubData?.commits?.[0]?.message || null,
        latestCommitAuthor: githubData?.commits?.[0]?.author || null,
        latestCommitTime: githubData?.commits?.[0]?.timestamp || null,
        latestCommitBranch: githubData?.commits?.[0]?.branch || null,
        envKeys: ['GITHUB_TOKEN', 'GITHUB_REPO'],
        configured: githubTokenSet && Boolean(githubRepo),
      },
      tags: githubTokenSet ? [] : ['not-configured'],
      history: githubData
        ? githubData.commits.map((c) => ({
            timestamp: c.timestamp,
            action: 'commit',
            label: `${c.sha} (${c.branch})`,
            detail: c.message,
            user: c.author,
            status: 'success',
            branch: c.branch,
          }))
        : [],
    })
  );

  // ── DevOps: Vercel Deployments (already fetched in parallel above) ──
  const vercelTokenSet = Boolean(process.env.VERCEL_TOKEN);
  const vercelProjectId = process.env.VERCEL_PROJECT_ID || '';
  const latestDeploy = vercelDeployments?.[0] || null;
  const latestDeployStatus = latestDeploy?.status?.toUpperCase() || '';
  const vercelDeployHealth = vercelDeployments
    ? latestDeployStatus === 'READY'
      ? 'healthy'
      : latestDeployStatus === 'ERROR'
        ? 'critical'
        : 'warning'
    : 'warning';
  const productionDeploy = vercelDeployments?.find((d) => d.target === 'production') || null;
  entities.push(
    makeEntity({
      id: 'service-vercel-deployments',
      label: 'Vercel Deployments',
      type: 'service',
      category: 'infrastructure',
      health: vercelDeployHealth,
      description: vercelDeployments
        ? `Deployment pipeline. Latest: ${latestDeployStatus} (${latestDeploy?.gitCommitMessage || 'no commit info'}). ${vercelDeployments.length} recent deploys loaded.`
        : vercelTokenSet
          ? 'Vercel token set but could not fetch deployments. Check VERCEL_PROJECT_ID.'
          : 'Vercel deployment monitoring not configured. Set VERCEL_TOKEN and VERCEL_PROJECT_ID env vars.',
      info: ENTITY_INFO['service-vercel-deployments'] || '',
      details: {
        projectId: vercelProjectId || null,
        productionUrl: productionDeploy?.url || null,
        latestStatus: latestDeployStatus || null,
        latestDeployTime: latestDeploy?.createdAt || null,
        latestBuildDuration: latestDeploy?.duration ? `${latestDeploy.duration}s` : null,
        latestCommitSha: latestDeploy?.gitCommitSha || null,
        latestCommitMessage: latestDeploy?.gitCommitMessage || null,
        latestCommitAuthor: latestDeploy?.gitCommitAuthor || null,
        envKeys: ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID'],
        configured: vercelTokenSet && Boolean(vercelProjectId),
      },
      tags: vercelTokenSet
        ? latestDeployStatus === 'ERROR'
          ? ['deploy-failed']
          : []
        : ['not-configured'],
      history: vercelDeployments
        ? vercelDeployments.map((d) => ({
            timestamp: d.createdAt,
            action: `deploy_${(d.status || 'unknown').toLowerCase()}`,
            label: `Deploy ${d.status || 'unknown'}`,
            detail: d.gitCommitMessage || d.url || d.id,
            user: d.gitCommitAuthor || '—',
            status:
              (d.status || '').toUpperCase() === 'READY'
                ? 'success'
                : (d.status || '').toUpperCase() === 'ERROR'
                  ? 'error'
                  : 'pending',
            meta: {
              duration: d.duration ? `${d.duration}s` : null,
              url: d.url,
              commit: d.gitCommitSha,
              target: d.target,
            },
          }))
        : [],
    })
  );

  // ── External: Azure Speech Services ──
  const azureSpeechKeySet = Boolean(process.env.VITE_AZURE_SPEECH_KEY);
  const azureSpeechRegion = process.env.VITE_AZURE_SPEECH_REGION || 'eastus';
  entities.push(
    makeEntity({
      id: 'service-azure-speech',
      label: 'Azure Speech',
      type: 'service',
      category: 'infrastructure',
      health: azureSpeechKeySet ? 'healthy' : 'warning',
      description: azureSpeechKeySet
        ? `Azure Cognitive Services Speech SDK. Region: ${azureSpeechRegion}. Active for Firefox voice recognition fallback.`
        : 'Azure Speech key not configured (VITE_AZURE_SPEECH_KEY). Voice recognition on Firefox will use browser defaults.',
      info: ENTITY_INFO['service-azure-speech'] || '',
      details: {
        envKey: 'VITE_AZURE_SPEECH_KEY',
        region: azureSpeechRegion,
        regionEnvKey: 'VITE_AZURE_SPEECH_REGION',
        enabled: azureSpeechKeySet,
        usedBy: ['Ask Anything / Voice AI'],
        purpose:
          'Voice recognition fallback for Firefox and browsers without native Web Speech API',
        sdk: 'web-speech-cognitive-services',
      },
      tags: azureSpeechKeySet ? [] : ['not-configured'],
    })
  );

  // ipwho.is removed — single weak connection to audit-log, low insight value

  // Google Fonts CDN removed — connects to every page, adds noise with zero insight value

  // service-vercel-cron replaced by individual cron entities (cron-process-next, cron-optimize-prompts, etc.)

  // db-backups storage bucket (check if it exists in the bucket list)
  const dbBackupsBucketExists = bucketNames.includes('db-backups');
  entities.push(
    makeEntity({
      id: 'storage-db-backups',
      label: 'db-backups Bucket',
      type: 'storage',
      category: 'infrastructure',
      health: dbBackupsBucketExists ? 'healthy' : 'warning',
      description: dbBackupsBucketExists
        ? 'Private storage bucket for compressed database backups. Active and receiving daily snapshots.'
        : 'db-backups bucket not found. Create it in Supabase Dashboard > Storage.',
      info: ENTITY_INFO['storage-db-backups'] || '',
      details: {
        bucket: 'db-backups',
        format: '.json.gz (gzip compressed JSON)',
        retention: '30 days',
        access: 'Private (no public access)',
        exists: dbBackupsBucketExists,
      },
    })
  );

  // Security summary node
  entities.push(
    makeEntity({
      id: 'security-rls',
      label: 'RLS Policies',
      type: 'security',
      category: 'security',
      health: tableHealthIssues.some((x) => x.includes('disabled')) ? 'critical' : 'warning',
      description: 'Aggregated row-level security status from migrations + live checks.',
      info: ENTITY_INFO['security-rls'] || '',
      details: {
        issues: tableHealthIssues,
      },
    })
  );

  // ══════════════════════════════════════════════════════════════
  // ── EDGES — rewired to show actual call chains ──
  // ══════════════════════════════════════════════════════════════

  const entityIds = new Set(entities.map((e) => e.id));
  const safeEdge = (edge) => {
    if (entityIds.has(edge.source) && entityIds.has(edge.target)) edges.push(edge);
  };

  // ── Frontend → Table usage edges (kept for Database view mode) ──
  const frontendIdByAlias = new Map();
  FRONTEND_NODES.forEach((node) => {
    node.aliases.forEach((alias) => frontendIdByAlias.set(alias, node.id));
  });
  Object.entries(FRONTEND_USAGE).forEach(([table, pages]) => {
    const tableId = `table-${table}`;
    pages.forEach((page) => {
      const source = frontendIdByAlias.get(page) || `frontend-${slugify(page)}`;
      safeEdge({
        id: `usage-${source}-${tableId}`,
        source,
        target: tableId,
        relationship: 'usage',
      });
    });
  });

  // ── Frontend → API edges (from FRONTEND_API_FLOWS map) ──
  Object.entries(FRONTEND_API_FLOWS).forEach(([frontendId, apiIds]) => {
    apiIds.forEach((apiId) => {
      safeEdge({
        id: `flow-${frontendId}-${apiId}`,
        source: frontendId,
        target: apiId,
        relationship: 'api-call',
      });
    });
  });

  // ── Ask Anything special flows ──
  safeEdge({
    id: 'flow-ask-anything-groq',
    source: 'frontend-ask-anything',
    target: 'llm-groq',
    relationship: 'assistant-flow',
  });

  // ── API → external service edges ──
  safeEdge({
    id: 'svc-transcribe-groq',
    source: 'api-transcribe',
    target: 'service-groq',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'svc-transcribe-assemblyai',
    source: 'api-transcribe',
    target: 'service-assemblyai',
    relationship: 'service-call',
  });
  if (resendEnabled) {
    safeEdge({
      id: 'svc-send-email-resend',
      source: 'api-send-email',
      target: 'service-resend',
      relationship: 'service-call',
    });
    safeEdge({
      id: 'svc-send-notif-resend',
      source: 'api-send-notification',
      target: 'service-resend',
      relationship: 'service-call',
    });
  }
  if (stitchEnabled) {
    safeEdge({
      id: 'flow-stitch-notif',
      source: 'service-google-stitch',
      target: 'api-send-notification',
      relationship: 'api-call',
    });
  }

  // ── Notification API → table edges ──
  [
    'table-email_notification_preferences',
    'table-email_templates',
    'table-email_notification_events',
  ].forEach((target) => {
    safeEdge({
      id: `notify-api-${target}`,
      source: 'api-send-notification',
      target,
      relationship: 'data-flow',
    });
  });

  // ── Cron → API target edges ──
  cronJobs.forEach(({ id, target }) => {
    safeEdge({ id: `cron-edge-${id}`, source: id, target, relationship: 'cron-trigger' });
  });

  // ── Agent pipeline edges ──
  // process-next API → job processor
  safeEdge({
    id: 'api-to-job-proc',
    source: 'api-agent-process-next',
    target: 'agent-job-processor',
    relationship: 'service-call',
  });
  // webhook-process API → job processor
  safeEdge({
    id: 'webhook-to-job-proc',
    source: 'api-agent-webhook-process',
    target: 'agent-job-processor',
    relationship: 'service-call',
  });
  // job processor → sub-handlers
  safeEdge({
    id: 'proc-to-llm-exec',
    source: 'agent-job-processor',
    target: 'agent-llm-executor',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'proc-to-tool-runner',
    source: 'agent-job-processor',
    target: 'agent-tool-runner',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'proc-to-goal-orch',
    source: 'agent-job-processor',
    target: 'agent-goal-orchestrator',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'proc-to-pulse',
    source: 'agent-job-processor',
    target: 'agent-pulse-handler',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'proc-to-prompt-opt',
    source: 'agent-job-processor',
    target: 'agent-prompt-optimizer',
    relationship: 'service-call',
  });
  // LLM executor → LLM providers
  llmProviders.forEach(({ id }) => {
    safeEdge({
      id: `llm-exec-to-${id}`,
      source: 'agent-llm-executor',
      target: id,
      relationship: 'assistant-flow',
    });
  });
  // tool runner → LLM executor (ReAct loop uses LLM)
  safeEdge({
    id: 'tool-runner-to-llm',
    source: 'agent-tool-runner',
    target: 'agent-llm-executor',
    relationship: 'service-call',
  });

  // ── Webhook → API edges ──
  safeEdge({
    id: 'wh-telegram-to-api',
    source: 'webhook-telegram',
    target: 'api-communicator-webhook-receiver',
    relationship: 'api-call',
  });
  safeEdge({
    id: 'wh-discord-to-api',
    source: 'webhook-discord',
    target: 'api-communicator-webhook-receiver',
    relationship: 'api-call',
  });
  safeEdge({
    id: 'wh-slack-to-api',
    source: 'webhook-slack',
    target: 'api-communicator-webhook-receiver',
    relationship: 'api-call',
  });
  safeEdge({
    id: 'wh-supabase-to-api',
    source: 'webhook-supabase',
    target: 'api-agent-webhook-process',
    relationship: 'api-call',
  });
  // Communicator webhook → LLM (for agent reasoning)
  safeEdge({
    id: 'comm-webhook-to-llm',
    source: 'api-communicator-webhook-receiver',
    target: 'agent-llm-executor',
    relationship: 'assistant-flow',
  });

  // ── Backup system edges ──
  safeEdge({
    id: 'backup-to-storage',
    source: 'api-backup-database',
    target: 'storage-db-backups',
    relationship: 'data-flow',
  });
  safeEdge({
    id: 'backup-to-supabase',
    source: 'api-backup-database',
    target: 'service-supabase',
    relationship: 'service-call',
  });
  entities
    .filter((e) => e.type === 'table')
    .forEach((tableEntity) => {
      safeEdge({
        id: `backup-reads-${tableEntity.id}`,
        source: 'api-backup-database',
        target: tableEntity.id,
        relationship: 'backup-read',
      });
    });

  // ── Security edges to all tables ──
  entities
    .filter((e) => e.type === 'table')
    .forEach((entity) => {
      safeEdge({
        id: `sec-${entity.id}`,
        source: 'security-rls',
        target: entity.id,
        relationship: 'security',
      });
    });

  // ── DevOps Pipeline edges ──
  safeEdge({
    id: 'github-to-vercel',
    source: 'service-github',
    target: 'service-vercel-deployments',
    relationship: 'deploy-trigger',
  });
  safeEdge({
    id: 'vercel-to-supabase',
    source: 'service-vercel-deployments',
    target: 'service-supabase',
    relationship: 'service-call',
  });

  // ── Consilium edges ──
  safeEdge({
    id: 'board-to-members',
    source: 'consilium-board',
    target: 'consilium-members',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'members-to-eval',
    source: 'consilium-members',
    target: 'consilium-evaluation-engine',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'eval-to-consensus',
    source: 'consilium-evaluation-engine',
    target: 'consilium-consensus',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'supervisor-to-board',
    source: 'consilium-supervisor',
    target: 'consilium-board',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'factory-to-board',
    source: 'consilium-agent-factory',
    target: 'consilium-board',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'eval-to-fraud',
    source: 'consilium-evaluation-engine',
    target: 'consilium-fraud-detector',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'job-proc-to-eval',
    source: 'agent-job-processor',
    target: 'consilium-evaluation-engine',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'frontend-consilium-to-board',
    source: 'frontend-consilium',
    target: 'consilium-board',
    relationship: 'api-call',
  });
  safeEdge({
    id: 'factory-to-blueprints',
    source: 'consilium-agent-factory',
    target: 'agent-blueprints',
    relationship: 'service-call',
  });

  // ── Agent enrichment edges ──
  safeEdge({
    id: 'hub-to-marketplace',
    source: 'frontend-agent-hub',
    target: 'agent-marketplace',
    relationship: 'api-call',
  });
  safeEdge({
    id: 'marketplace-to-blueprints',
    source: 'agent-marketplace',
    target: 'agent-blueprints',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'blueprints-to-skills',
    source: 'agent-blueprints',
    target: 'agent-skills-library',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'job-proc-to-perf',
    source: 'agent-job-processor',
    target: 'agent-performance-tracker',
    relationship: 'data-flow',
  });
  safeEdge({
    id: 'llm-exec-to-perf',
    source: 'agent-llm-executor',
    target: 'agent-performance-tracker',
    relationship: 'data-flow',
  });

  // ── Team enrichment edges ──
  safeEdge({
    id: 'team-to-suggest',
    source: 'team-collaboration',
    target: 'team-suggestion-engine',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'governance-to-board',
    source: 'team-governance',
    target: 'consilium-board',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'orgs-to-governance',
    source: 'frontend-organizations',
    target: 'team-governance',
    relationship: 'api-call',
  });

  // ── Communication edges ──
  safeEdge({
    id: 'comm-ctrl-to-room',
    source: 'comm-controller',
    target: 'comm-agent-room',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'comm-ctrl-to-llm',
    source: 'comm-controller',
    target: 'agent-llm-executor',
    relationship: 'assistant-flow',
  });
  safeEdge({
    id: 'frontend-comm-to-ctrl',
    source: 'frontend-communicator',
    target: 'comm-controller',
    relationship: 'api-call',
  });

  // ── Teams edges ──
  safeEdge({
    id: 'goal-to-team',
    source: 'agent-goal-orchestrator',
    target: 'team-collaboration',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'team-to-exec',
    source: 'team-collaboration',
    target: 'team-task-execution',
    relationship: 'workflow-flow',
  });
  safeEdge({
    id: 'exec-to-llm',
    source: 'team-task-execution',
    target: 'agent-llm-executor',
    relationship: 'service-call',
  });
  safeEdge({
    id: 'exec-to-tools',
    source: 'team-task-execution',
    target: 'agent-tool-runner',
    relationship: 'service-call',
  });

  // ── External service edges ──
  safeEdge({
    id: 'azure-to-voice',
    source: 'service-azure-speech',
    target: 'frontend-ask-anything',
    relationship: 'service-call',
  });

  // ── Fetch history data for entities ──
  if (supabaseClient) {
    // 1. Backup files history for storage-db-backups
    try {
      const bucketListRes = await supabaseClient.storage.from('db-backups').list('', {
        limit: 50,
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (!bucketListRes.error && Array.isArray(bucketListRes.data)) {
        const backupHistory = bucketListRes.data
          .filter((f) => f.name && f.name.startsWith('backup-'))
          .map((f) => {
            // Parse date from filename: backup-2026-02-15T03-00-00Z.json.gz
            const tsMatch = f.name.match(/backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)/);
            let timestamp = f.created_at || null;
            if (tsMatch) {
              const iso = tsMatch[1].replace(/(\d{2})-(\d{2})-(\d{2}Z)$/, '$1:$2:$3');
              timestamp = new Date(iso).toISOString();
            }
            const sizeKB = f.metadata?.size ? (f.metadata.size / 1024).toFixed(1) : null;
            return {
              timestamp,
              action: 'backup_created',
              label: 'Database backup',
              detail: f.name,
              size: sizeKB ? `${sizeKB} KB` : null,
              status: 'success',
            };
          });
        // Attach to db-backups entity
        const dbBackupsEntity = entities.find((e) => e.id === 'storage-db-backups');
        if (dbBackupsEntity) dbBackupsEntity.history = backupHistory;
        // And to the backup API
        const backupApiEntity = entities.find((e) => e.id === 'api-backup-database');
        if (backupApiEntity) backupApiEntity.history = backupHistory;
        // Attach to backup cron entity
        const cronEntity = entities.find((e) => e.id === 'cron-backup-database');
        if (cronEntity)
          cronEntity.history = backupHistory.map((h) => ({ ...h, label: 'Cron triggered backup' }));
      }
    } catch {
      // Silently skip if bucket doesn't exist or access fails
    }

    // 2. Audit log history for tables, frontends, APIs, and services
    const ENTITY_AUDIT_MAP = {
      // table entities → audit_log entity names
      'table-partners': ['partner', 'partners'],
      'table-meetings': ['meeting', 'meetings'],
      'table-workflows': ['workflow', 'workflows'],
      'table-projects': ['project', 'projects'],
      'table-partner_history': ['partner_history'],
      'table-profile_notes': ['profile_note', 'profile_notes', 'note'],
      'table-profile_todos': ['profile_todo', 'profile_todos', 'todo'],
      'table-audit_log': ['audit_log'],
      'table-notifications': ['notification', 'notifications'],
      'table-action_options': ['action_option', 'action_options'],
      'table-email_notification_preferences': [
        'email_preferences',
        'email_notification_preferences',
      ],
      'table-email_templates': ['email_template', 'email_templates', 'template_sync'],
      'table-email_notification_events': [
        'email_notification_event',
        'email_notification_events',
        'email',
        'notification',
      ],
      'table-roles': ['role', 'roles'],
      'table-user_roles': ['user_role', 'user_roles'],
      // frontend entities → audit_log entity names
      'frontend-partners': ['partner', 'partners'],
      'frontend-dashboard': ['dashboard'],
      'frontend-workflow': ['workflow', 'workflows'],
      'frontend-projects': ['project', 'projects'],
      'frontend-settings': [
        'settings',
        'profile_note',
        'profile_notes',
        'profile_todo',
        'profile_todos',
        'email_preferences',
      ],
      'frontend-audit-log': ['audit_log'],
      'frontend-roles': ['role', 'roles', 'user_role', 'user_roles'],
      'frontend-notifications': ['notification', 'notifications'],
      'frontend-ask-anything': ['transcription', 'voice'],
      // API entities
      'api-transcribe': ['transcription', 'meeting'],
      'api-send-email': ['email'],
      'api-send-notification': [
        'notification',
        'email',
        'template_sync',
        'email_template',
        'email_notification_event',
      ],
      // New frontend pages
      'frontend-agent-hub': ['agent', 'agents', 'agent_job', 'agent_jobs'],
      'frontend-consilium': ['concilium', 'evaluation', 'concilium_evaluations'],
      'frontend-communicator': ['communication', 'message', 'agent_room'],
      'frontend-tools': ['tool', 'tools', 'tool_execution'],
      'frontend-job-pool': ['agent_job', 'agent_jobs', 'job', 'request'],
      'frontend-goals': ['goal', 'goals', 'goal_log'],
      'frontend-knowledge-base': ['knowledge', 'document', 'knowledge_documents'],
      'frontend-marketplace': ['marketplace', 'agent'],
      'frontend-organizations': ['organization', 'organizations', 'org_team'],
      'frontend-investments': ['investment', 'deal', 'investor', 'pool'],
      'frontend-campaigns': ['campaign', 'campaigns'],
      'frontend-finances': ['financial', 'payment', 'revenue'],
      'frontend-injection-hub': ['material', 'injection', 'translation'],
      'frontend-task-manager': ['task', 'team_task', 'team_tasks'],
      'frontend-my-agents': ['agent', 'pipeline'],
      'frontend-reports': ['report', 'reports'],
      // Agent system
      'agent-job-processor': ['agent_job', 'agent_jobs', 'job'],
      'agent-llm-executor': ['llm', 'llm_usage'],
      'agent-goal-orchestrator': ['goal', 'goals', 'goal_log'],
      'agent-tool-runner': ['tool', 'tool_execution'],
      'agent-pulse-handler': ['pulse', 'pulse_cycle'],
      'agent-prompt-optimizer': ['optimization', 'prompt_version'],
      // Consilium
      'consilium-board': ['concilium', 'board'],
      'consilium-evaluation-engine': ['evaluation', 'concilium_evaluations'],
      'consilium-supervisor': ['supervisor', 'quarantine', 'security_event'],
      // Crons
      'cron-process-next': ['agent_job', 'agent_jobs', 'goal'],
      'cron-backup-database': ['backup', 'backup_created'],
    };

    // Collect all unique entity names to query
    const allAuditEntityNames = new Set();
    Object.values(ENTITY_AUDIT_MAP).forEach((names) =>
      names.forEach((n) => allAuditEntityNames.add(n))
    );

    try {
      const { data: auditRows, error: auditErr } = await supabaseClient
        .from('audit_log')
        .select('action, entity, entity_id, user_email, created_at')
        .in('entity', [...allAuditEntityNames])
        .order('created_at', { ascending: false })
        .limit(500);

      if (!auditErr && Array.isArray(auditRows)) {
        // Build per-entity-name index
        const auditByEntity = new Map();
        auditRows.forEach((row) => {
          if (!auditByEntity.has(row.entity)) auditByEntity.set(row.entity, []);
          auditByEntity.get(row.entity).push(row);
        });

        // Assign history to entities
        Object.entries(ENTITY_AUDIT_MAP).forEach(([entityId, auditNames]) => {
          const targetEntity = entities.find((e) => e.id === entityId);
          if (!targetEntity) return;
          // Skip if already has history (like backup entities)
          if (targetEntity.history && targetEntity.history.length > 0) return;

          const rows = [];
          auditNames.forEach((name) => {
            const items = auditByEntity.get(name) || [];
            rows.push(...items);
          });

          // Sort by time, take latest 30
          rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          targetEntity.history = rows.slice(0, 30).map((r) => ({
            timestamp: r.created_at,
            action: r.action,
            label: `${r.action.replace(/_/g, ' ')}`,
            detail: r.entity_id || '—',
            user: r.user_email || '—',
            status: 'logged',
          }));
        });
      }
    } catch {
      // Silently skip if audit_log is not accessible
    }

    // 3. Supabase service: add auth user count as history-like data
    const supabaseEntity = entities.find((e) => e.id === 'service-supabase');
    if (supabaseEntity && !supabaseEntity.history.length) {
      supabaseEntity.history = [
        {
          timestamp: new Date().toISOString(),
          action: 'status_check',
          label: 'Service status check',
          detail: 'Connected and operational',
          status: 'success',
        },
      ];
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ── FEATURE FLAGS ──
  if (supabaseClient) {
    try {
      const { data: flags } = await supabaseClient
        .from('feature_flags')
        .select('entity_id, disabled, reason, disabled_at');
      if (Array.isArray(flags)) {
        flags.forEach((flag) => {
          if (!flag.disabled) return;
          const ent = entities.find((e) => e.id === flag.entity_id);
          if (ent) {
            ent.disabled = true;
            ent.health = 'warning';
            ent.tags = [...(ent.tags || []), 'feature-disabled'];
            ent.disabledReason = flag.reason;
            ent.disabledAt = flag.disabled_at;
          }
        });
      }
    } catch {
      /* feature_flags table may not exist yet */
    }
  }

  // ── LIVE METRICS + OPTIMIZATION INSIGHTS ──
  // ══════════════════════════════════════════════════════════════
  const liveMetrics = {};
  const insights = [];
  if (supabaseClient) {
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    try {
      const [
        jobsRes,
        jobsFailedRes,
        jobsQueuedRes,
        llmRes,
        goalsCreatedRes,
        goalsCompletedRes,
        goalsFailedRes,
        evalsRes,
      ] = await Promise.allSettled([
        supabaseClient.from('agent_jobs').select('*', { count: 'exact', head: true }),
        supabaseClient
          .from('agent_jobs')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'failed'),
        supabaseClient
          .from('agent_jobs')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'queued'),
        supabaseClient
          .from('llm_usage')
          .select('estimated_cost_usd, provider, total_tokens')
          .gte('created_at', dayAgo)
          .limit(500),
        supabaseClient
          .from('goal_log')
          .select('*', { count: 'exact', head: true })
          .eq('event_type', 'goal_created')
          .gte('created_at', dayAgo),
        supabaseClient
          .from('goal_log')
          .select('*', { count: 'exact', head: true })
          .eq('event_type', 'goal_completed')
          .gte('created_at', dayAgo),
        supabaseClient
          .from('goal_log')
          .select('*', { count: 'exact', head: true })
          .eq('event_type', 'goal_failed')
          .gte('created_at', dayAgo),
        supabaseClient
          .from('concilium_evaluations')
          .select('overall_score, approved')
          .gte('created_at', dayAgo)
          .limit(200),
      ]);

      // Job metrics
      const jobsTotal = jobsRes.status === 'fulfilled' ? jobsRes.value.count || 0 : 0;
      const jobsFailed = jobsFailedRes.status === 'fulfilled' ? jobsFailedRes.value.count || 0 : 0;
      const jobsQueued = jobsQueuedRes.status === 'fulfilled' ? jobsQueuedRes.value.count || 0 : 0;
      liveMetrics.jobs = {
        total: jobsTotal,
        failed: jobsFailed,
        queued: jobsQueued,
        failRate: jobsTotal > 0 ? ((jobsFailed / jobsTotal) * 100).toFixed(1) : '0',
      };

      // LLM cost metrics
      const llmRows =
        llmRes.status === 'fulfilled' && !llmRes.value.error ? llmRes.value.data || [] : [];
      const costByProvider = {};
      let totalCost = 0;
      let totalTokens = 0;
      llmRows.forEach((r) => {
        const p = r.provider || 'unknown';
        costByProvider[p] = (costByProvider[p] || 0) + (r.estimated_cost_usd || 0);
        totalCost += r.estimated_cost_usd || 0;
        totalTokens += r.total_tokens || 0;
      });
      liveMetrics.llm = {
        costToday: totalCost.toFixed(4),
        tokensToday: totalTokens,
        callsToday: llmRows.length,
        byProvider: costByProvider,
      };

      // Goal metrics
      const goalsCreated =
        goalsCreatedRes.status === 'fulfilled' ? goalsCreatedRes.value.count || 0 : 0;
      const goalsCompleted =
        goalsCompletedRes.status === 'fulfilled' ? goalsCompletedRes.value.count || 0 : 0;
      const goalsFailed2 =
        goalsFailedRes.status === 'fulfilled' ? goalsFailedRes.value.count || 0 : 0;
      liveMetrics.goals = {
        created: goalsCreated,
        completed: goalsCompleted,
        failed: goalsFailed2,
        completionRate: goalsCreated > 0 ? ((goalsCompleted / goalsCreated) * 100).toFixed(0) : '—',
      };

      // Evaluation metrics
      const evalRows =
        evalsRes.status === 'fulfilled' && !evalsRes.value.error ? evalsRes.value.data || [] : [];
      const avgScore =
        evalRows.length > 0
          ? (evalRows.reduce((s, r) => s + (r.overall_score || 0), 0) / evalRows.length).toFixed(1)
          : '—';
      const approvedCount = evalRows.filter((r) => r.approved).length;
      liveMetrics.evaluations = {
        total: evalRows.length,
        avgScore,
        approvalRate:
          evalRows.length > 0 ? ((approvedCount / evalRows.length) * 100).toFixed(0) : '—',
      };

      // Attach metrics to relevant entities
      const jobProcEntity = entities.find((e) => e.id === 'agent-job-processor');
      if (jobProcEntity) jobProcEntity.metrics = liveMetrics.jobs;
      const goalOrchEntity = entities.find((e) => e.id === 'agent-goal-orchestrator');
      if (goalOrchEntity) goalOrchEntity.metrics = liveMetrics.goals;
      const evalEngineEntity = entities.find((e) => e.id === 'consilium-evaluation-engine');
      if (evalEngineEntity) evalEngineEntity.metrics = liveMetrics.evaluations;
      // Attach LLM cost to each provider
      llmProviders.forEach(({ id, label }) => {
        const providerKey = label.toLowerCase();
        const entity = entities.find((e) => e.id === id);
        if (entity && costByProvider[providerKey] != null) {
          entity.metrics = {
            costToday: costByProvider[providerKey].toFixed(4),
            callsToday: llmRows.filter((r) => r.provider === providerKey).length,
          };
        }
      });

      // ── Optimization Insights ──
      if (jobsQueued > 100)
        insights.push({
          entityId: 'agent-job-processor',
          severity: 'warning',
          text: `Queue backing up: ${jobsQueued} jobs pending. Consider investigating slow stages.`,
        });
      if (jobsTotal > 0 && jobsFailed / jobsTotal > 0.1)
        insights.push({
          entityId: 'agent-job-processor',
          severity: 'warning',
          text: `Job failure rate ${liveMetrics.jobs.failRate}% (target <10%). Check error logs.`,
        });
      if (goalsCreated > 0 && goalsCompleted / goalsCreated < 0.7)
        insights.push({
          entityId: 'agent-goal-orchestrator',
          severity: 'warning',
          text: `Goal completion rate ${liveMetrics.goals.completionRate}% (target >70%). Top failures need investigation.`,
        });
      if (totalCost > 5)
        insights.push({
          entityId: 'agent-llm-executor',
          severity: 'warning',
          text: `LLM spend today: $${liveMetrics.llm.costToday}. Review model selection for cost optimization.`,
        });

      // Attach insights to entities
      insights.forEach((insight) => {
        const ent = entities.find((e) => e.id === insight.entityId);
        if (ent) {
          if (!ent.insights) ent.insights = [];
          ent.insights.push(insight);
          if (insight.severity === 'warning' && ent.health === 'healthy') ent.health = 'warning';
          if (insight.severity === 'critical') ent.health = 'critical';
        }
      });
    } catch {
      // Silently skip metrics if tables don't exist yet
    }
  }

  // ── EDGE METRICS — attach live numbers to edges ──
  edges.forEach((edge) => {
    if (!edge.metric) {
      if (edge.relationship === 'assistant-flow' && edge.target.startsWith('llm-')) {
        const providerKey = edge.target.replace('llm-', '');
        const cost = liveMetrics.llm?.byProvider?.[providerKey];
        if (cost != null) edge.metric = `$${Number(cost).toFixed(3)}`;
      } else if (edge.relationship === 'cron-trigger') {
        const cronEnt = entities.find((e) => e.id === edge.source);
        if (cronEnt?.details?.frequency)
          edge.metric = cronEnt.details.frequency.replace('Every ', '').replace('Daily at ', '');
      } else if (edge.relationship === 'usage' || edge.relationship === 'data-flow') {
        const tableEnt = entities.find((e) => e.id === edge.target);
        if (tableEnt?.details?.rowCount != null) edge.metric = `${tableEnt.details.rowCount} rows`;
      }
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    source: 'live',
    entities,
    edges,
    pipelines: PIPELINES,
    liveMetrics,
    insights,
    meta: {
      migrationsParsed: migrationEntries.map((entry) => entry.name),
      supabaseConnected: Boolean(supabaseClient),
      supabaseProjectRef: projectRef || null,
      warnings: [],
    },
  };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  // ── Auth ──────────────────────────────────────────────────────
  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

  // ── Super Admin check (exposes infrastructure details) ────────
  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (roleRow?.role_id !== 'role-super-admin') {
    return jsonError(res, 403, 'Only Super Admin can access data topology.');
  }

  // ── Rate limit ────────────────────────────────────────────────
  const rlKey = getRateLimitIdentifier(req);
  const rl = checkRateLimit({ key: rlKey, limit: 10, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  try {
    const payload = await buildTopologyPayload();
    return res.status(200).json(payload);
  } catch (err) {
    return handleApiError(res, err, 'data-topology');
  }
}
