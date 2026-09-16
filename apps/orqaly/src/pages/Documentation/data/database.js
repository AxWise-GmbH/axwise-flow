/**
 * Current Postgres schema (Supabase). Grouped by domain. Every table has Row
 * Level Security enabled; `rls` shows the owning policy shape:
 *   User    -> auth.uid() = user_id (+ a service_role bypass for backend workers)
 *   Shared  -> auth.role() = 'authenticated'
 *   Service -> service_role / backend-only writes
 */
export const MIGRATION_COUNT = 176;

export const DB_TABLES = [
  // Consilium / governance
  { name: 'concilium', domain: 'Consilium', rls: 'Shared', description: 'AI boards (chairman, members, consensus config).' },
  { name: 'concilium_members', domain: 'Consilium', rls: 'Shared', description: 'Board members with per-member role and LLM.' },
  { name: 'concilium_criteria', domain: 'Consilium', rls: 'Shared', description: 'Evaluation criteria with rubric auto-versioning.' },
  { name: 'concilium_consensus_rules', domain: 'Consilium', rls: 'Shared', description: 'Consensus mode + quorum per board (1:1).' },
  { name: 'concilium_agents', domain: 'Consilium', rls: 'Shared', description: 'Agent lifecycle + tracking tokens under a board.' },
  { name: 'concilium_agent_reports', domain: 'Consilium', rls: 'Shared', description: 'Agent activity, completion, and error reports.' },
  { name: 'concilium_teams', domain: 'Consilium', rls: 'Shared', description: 'Teams formed by a board, with a team lead.' },
  { name: 'agent_blueprints', domain: 'Consilium', rls: 'Shared', description: 'Reusable agent archetypes and presets.' },
  { name: 'agent_tool_whitelist', domain: 'Consilium', rls: 'Shared', description: 'Tools an agent/board is permitted to call.' },

  // Goals
  { name: 'goals', domain: 'Goals', rls: 'User', description: 'Goal records + pipeline status and loop control.' },
  { name: 'goal_log', domain: 'Goals', rls: 'User', description: 'Append-only trace of a goal run (via parent goal).' },
  { name: 'goal_messages', domain: 'Goals', rls: 'User', description: 'Messages exchanged during goal execution.' },
  { name: 'goal_kpis', domain: 'Goals', rls: 'User', description: 'KPIs and projections attached to a goal.' },
  { name: 'goal_artifacts', domain: 'Goals', rls: 'User', description: 'Outputs and deliverables produced for a goal.' },
  { name: 'agent_decisions', domain: 'Goals', rls: 'User', description: 'Decisions made by agents during a run.' },

  // Agents / platform
  { name: 'agents', domain: 'Agents', rls: 'User', description: 'Agent instances with config and capabilities.' },
  { name: 'agent_jobs', domain: 'Agents', rls: 'Shared', description: 'Queued AI/agent jobs (status, payload, result).' },
  { name: 'agent_teams', domain: 'Agents', rls: 'User', description: 'Persistent teams and their members.' },
  { name: 'agent_ratings', domain: 'Agents', rls: 'User', description: '5-star ratings and rating events per agent.' },
  { name: 'agent_profiles', domain: 'Agents', rls: 'User', description: 'Public agent profiles and metadata.' },

  // Workflows
  { name: 'workflows', domain: 'Workflows', rls: 'User', description: 'Workflow definitions (nodes and edges).' },
  { name: 'workflow_executions', domain: 'Workflows', rls: 'User', description: 'Execution runs with status and timing.' },
  { name: 'workflow_step_results', domain: 'Workflows', rls: 'User', description: 'Per-node results within an execution.' },

  // Knowledge base
  { name: 'knowledge_documents', domain: 'Knowledge Base', rls: 'User', description: 'Documents with pgvector embeddings for RAG.' },
  { name: 'kb_connections', domain: 'Knowledge Base', rls: 'User', description: 'Cloud source connections (Dropbox, OneDrive, Drive).' },

  // Communication
  { name: 'communication_logs', domain: 'Communication', rls: 'Shared', description: 'Append-only feed of agent activity and messages.' },
  { name: 'communication_channels', domain: 'Communication', rls: 'Shared', description: 'Rooms and channels for agent/human comms.' },
  { name: 'agent_personas', domain: 'Communication', rls: 'Shared', description: 'Personas agents present in the Communicator.' },

  // Tasks
  { name: 'team_tasks', domain: 'Tasks', rls: 'User', description: 'Team task queue tied to goals and workflows.' },
  { name: 'human_tasks', domain: 'Tasks', rls: 'User', description: 'Tasks that require human approval or input.' },

  // Assistants
  { name: 'assistants', domain: 'Assistants', rls: 'User', description: 'Conversational assistants (one current per user).' },
  { name: 'company_brief', domain: 'Assistants', rls: 'User', description: 'Company context used to ground assistants.' },

  // Marketplace
  { name: 'marketplace_listings', domain: 'Marketplace', rls: 'User', description: 'Published agents, skills, tools, and templates.' },
  { name: 'marketplace_reviews', domain: 'Marketplace', rls: 'User', description: 'Reviews and ratings for listings.' },
  { name: 'marketplace_imported_libraries', domain: 'Marketplace', rls: 'User', description: 'External catalogs imported into a workspace.' },

  // Investments
  { name: 'investment_deals', domain: 'Investments', rls: 'User', description: 'Deals for AI and human investors.' },
  { name: 'investment_commitments', domain: 'Investments', rls: 'User', description: 'Commitments and pool membership.' },

  // Usage / LLM
  { name: 'llm_usage', domain: 'Usage', rls: 'User', description: 'Per-call tokens, cost, provider, and entity links.' },
  { name: 'tool_executions', domain: 'Usage', rls: 'User', description: 'Tool call records with duration and status.' },

  // Security / keys
  { name: 'user_api_keys', domain: 'Security', rls: 'User', description: 'BYOK provider keys (envelope-encrypted at rest).' },
  { name: 'user_storage_connections', domain: 'Security', rls: 'User', description: 'Connected cloud storage credentials.' },

  // Organizations
  { name: 'organizations', domain: 'Organizations', rls: 'User', description: 'Holding hierarchy: holdings, subsidiaries, divisions.' },
  { name: 'businesses', domain: 'Organizations', rls: 'User', description: 'Business units and directions.' },

  // Audit
  { name: 'audit_log', domain: 'Audit', rls: 'Shared', description: 'Immutable, append-only platform action log.' },
];

/** Distinct domains in listing order (for grouped rendering). */
export const DB_DOMAINS = [...new Set(DB_TABLES.map((t) => t.domain))];
