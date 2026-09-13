#!/usr/bin/env node
/**
 * Create (or refresh) the view-only DEMO account and seed it:
 *   - fabricated STRUCTURE + page fills (scripts/demo-data.js): 1 holding -> 4
 *     subsidiaries -> 11 teams -> 55 agents, 5 boards, and every side page.
 *   - GOALS cloned from a real executed account (scripts/demo-clone.js), carrying the
 *     rich tech_doc / proposal / retrospective / goal_log / goal_messages / tasks /
 *     llm_usage / KB detail the goal popups, Communicator, Tasks, Reports and KB read.
 *
 * The account is assigned role-viewer and its id must be added to DEMO_USER_IDS so the
 * backend demo-guard blocks writes (api/_lib/demo-guard.js). Every goal is inert
 * (completed/needs_human/cancelled) so no cron ever executes it (zero LLM cost).
 *
 * Requires .env(.local) with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Run from root:
 *   node scripts/create-demo-account.js            # create user + seed data
 *   node scripts/create-demo-account.js --dry-run  # validate + print counts, no writes
 * Idempotent: re-running wipes the demo user's prior rows and re-inserts.
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { buildDemoModel } from './demo-data.js';
import { buildClonedGoals } from './demo-clone.js';

config({ path: ['.env.local', '.env'] });

const DRY_RUN = process.argv.includes('--dry-run');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const email = process.env.DEMO_EMAIL || 'demo@orchestratori.app';
const password = process.env.DEMO_PASSWORD || 'Demo-View-2026!';

if (!url || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Run one labelled DB step; never abort the whole seed on a single failure. */
async function step(label, fn, opts = {}) {
  try {
    const { error } = (await fn()) || {};
    if (error) {
      console.warn(`  ! ${label}: ${error.message}`);
      return false;
    }
    if (!opts.quiet) console.log(`  ✓ ${label}`);
    return true;
  } catch (err) {
    console.warn(`  ! ${label}: ${err.message}`);
    return false;
  }
}

async function ensureDemoUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: 'Demo (View Only)', is_demo: true },
  });
  if (!error) return data.user.id;

  if (error.message?.toLowerCase().includes('already been registered')) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing?.id) throw new Error('Demo user exists but id not found');
    await admin.auth.admin.updateUserById(existing.id, {
      password,
      user_metadata: { display_name: 'Demo (View Only)', is_demo: true },
    });
    return existing.id;
  }
  throw new Error(`Create demo user failed: ${error.message}`);
}

async function wipe(userId) {
  console.log('Wiping prior demo data…');
  // Discover the demo user's existing goals so we can clear child rows that are
  // keyed by goal_id (not user_id) — including anything a prior run's worker made.
  const { data: existing } = await admin.from('goals').select('id').eq('user_id', userId);
  const priorGoalIds = (existing || []).map((g) => g.id);
  if (priorGoalIds.length) {
    for (const gid of priorGoalIds) {
      await step(
        `cancel agent_jobs (${gid.slice(0, 8)})`,
        () => admin.from('agent_jobs').delete().contains('payload', { goalId: gid }),
        { quiet: true }
      );
    }
    await step('clear team_tasks (by goal)', () =>
      admin.from('team_tasks').delete().in('goal_id', priorGoalIds)
    );
    await step('clear goal_messages (by goal)', () =>
      admin.from('goal_messages').delete().in('goal_id', priorGoalIds)
    );
  }
  const byUser = [
    'assistant_chat_messages',
    'assistant_setup',
    'assistants',
    'audit_log',
    'notification_log',
    'agent_ratings',
    'concilium_analytics',
    'concilium_evaluations',
    'concilium_criteria',
    'llm_usage',
    'deliverables',
    'financial_events',
    'leads',
    'contacts',
    'businesses',
    'human_tasks',
    'agent_blueprints',
    'investment_commitments',
    'investment_deals',
    'investment_investors',
    'projects',
    'knowledge_documents',
    'workflow_executions',
    'workflows',
    'goals', // cascades goal_log
    'concilium_agents',
    'org_agents',
    'org_teams',
    'agent_team_members',
    'agent_teams',
    'agents',
    'concilium_members',
    'concilium',
    'organizations',
  ];
  for (const table of byUser) {
    await step(`clear ${table}`, () => admin.from(table).delete().eq('user_id', userId));
  }
  // Tables scoped by a non-user_id column:
  await step('clear team_tasks (by id)', () =>
    admin.from('team_tasks').delete().like('id', 'demo-task-%')
  );
  await step('clear communication_logs', () =>
    admin.from('communication_logs').delete().eq('user_id', userId)
  );
  await step('clear communication_channels', () =>
    admin.from('communication_channels').delete().eq('connected_by', userId)
  );
  await step('clear marketplace_listings', () =>
    admin.from('marketplace_listings').delete().eq('creator_id', userId)
  ); // cascades reviews + purchases
  await step('clear partners', () => admin.from('partners').delete().like('id', 'demo-partner-%')); // cascades partner_history
  await step('clear saved_dashboards', () =>
    admin.from('saved_dashboards').delete().eq('owner_user_id', userId)
  );
}

async function seed(model, cloned) {
  console.log('Inserting demo data…');
  const knowledgeDocs = [...model.knowledgeDocs, ...cloned.knowledgeDocs];
  const order = [
    // Structure
    ['organizations', model.organizations],
    ['concilium', model.boards],
    ['concilium_members', model.members],
    ['concilium_criteria', model.criteria],
    ['agent_teams', model.teams],
    ['agents', model.agents],
    ['agent_team_members', model.teamMembers],
    ['concilium_agents', model.conciliumAgents],
    ['org_teams', model.orgTeams],
    ['org_agents', model.orgAgents],
    // Cloned goals + their rich children
    ['goals', cloned.goals],
    ['goal_log', cloned.goalLogs],
    ['team_tasks', cloned.tasks],
    ['llm_usage', cloned.llmUsage],
    ['goal_messages', cloned.goalMessages],
    ['deliverables', cloned.deliverables],
    ['knowledge_documents', knowledgeDocs],
    // Board evaluations + analytics
    ['concilium_evaluations', model.evaluations],
    ['concilium_analytics', model.analytics],
    ['agent_ratings', model.ratings],
    // Workflows / projects
    ['workflows', model.workflows],
    ['workflow_executions', model.workflowExecutions],
    ['projects', model.projects],
    // Communicator / activity / AI
    ['communication_logs', model.comms],
    ['communication_channels', model.channels],
    ['notification_log', model.notificationLog],
    ['audit_log', model.auditLog],
    ['assistants', model.assistants],
    ['assistant_setup', model.assistantSetup],
    ['assistant_chat_messages', model.assistantMessages],
    // Side pages
    ['partners', model.partners],
    ['partner_history', model.partnerHistory],
    ['businesses', model.businesses],
    ['marketplace_listings', model.marketplaceListings],
    ['marketplace_reviews', model.marketplaceReviews],
    ['marketplace_purchases', model.marketplacePurchases],
    ['leads', model.leads],
    ['financial_events', model.financialEvents],
    ['contacts', model.contacts],
    ['investment_investors', model.investors],
    ['investment_deals', model.deals],
    ['investment_commitments', model.commitments],
    ['human_tasks', model.humanTasks],
    ['agent_blueprints', model.blueprints],
    ['saved_dashboards', model.savedDashboards],
  ];
  for (const [table, rows] of order) {
    if (!rows?.length) continue;
    await step(`insert ${table} (${rows.length})`, () => admin.from(table).insert(rows));
  }
}

function summarize(model, cloned) {
  const orgs = model.organizations;
  const holding = orgs.filter((o) => o.org_type === 'holding').length;
  const subs = orgs.filter((o) => o.org_type === 'subsidiary').length;
  const byStatus = cloned.goals.reduce((m, g) => ((m[g.status] = (m[g.status] || 0) + 1), m), {});
  console.log('\nModel summary:');
  console.log(`  organizations: ${orgs.length} (${holding} holding, ${subs} subsidiaries)`);
  console.log(
    `  boards: ${model.boards.length}, members: ${model.members.length}, criteria: ${model.criteria.length}, evaluations: ${model.evaluations.length}`
  );
  console.log(`  teams: ${model.teams.length}, agents: ${model.agents.length}`);
  console.log(`  CLONED goals: ${cloned.goals.length} ${JSON.stringify(byStatus)}`);
  console.log(
    `    goal_log: ${cloned.goalLogs.length}, tasks: ${cloned.tasks.length}, llm_usage: ${cloned.llmUsage.length}, goal_messages: ${cloned.goalMessages.length}`
  );
  console.log(
    `    KB(cloned): ${cloned.knowledgeDocs.length} + KB(structural): ${model.knowledgeDocs.length}, deliverables: ${cloned.deliverables.length}`
  );
  console.log(
    `  channels: ${model.channels.length}, notifications: ${model.notificationLog.length}, assistant_setup: ${model.assistantSetup.length}`
  );
  console.log(
    `  partners: ${model.partners.length}, businesses: ${model.businesses.length}, marketplace: ${model.marketplaceListings.length}, finances: ${model.financialEvents.length}`
  );
  console.log(
    `  leads: ${model.leads.length}, contacts: ${model.contacts.length}, investors/deals: ${model.investors.length}/${model.deals.length}, human_tasks: ${model.humanTasks.length}, blueprints: ${model.blueprints.length}, dashboards: ${model.savedDashboards.length}`
  );
}

async function main() {
  if (DRY_RUN) {
    console.log('DRY RUN — no writes.\n');
    const { error } = await admin.from('organizations').select('id').limit(1);
    console.log(error ? `Connectivity check failed: ${error.message}` : 'Connectivity OK.');
    const placeholder = '00000000-0000-5000-8000-000000000000';
    const cloned = await buildClonedGoals(admin, { demoUserId: placeholder });
    const model = buildDemoModel({
      userId: placeholder,
      baseEpochMs: Date.now(),
      clonedGoals: cloned.goals,
    });
    summarize(model, cloned);
    console.log('\nDry run complete. Re-run without --dry-run to create + seed.');
    return;
  }

  console.log(`Ensuring demo user ${email}…`);
  const userId = await ensureDemoUser();
  console.log(`Demo user id: ${userId}`);

  await step('assign role-viewer', () =>
    admin.from('user_roles').upsert(
      {
        user_id: userId,
        role_id: 'role-viewer',
        assigned_at: new Date().toISOString(),
        linked_partner_id: null,
      },
      { onConflict: 'user_id' }
    )
  );

  console.log('Cloning success-case goals from source account…');
  const cloned = await buildClonedGoals(admin, { demoUserId: userId });
  const model = buildDemoModel({ userId, baseEpochMs: Date.now(), clonedGoals: cloned.goals });
  summarize(model, cloned);
  await wipe(userId);
  await seed(model, cloned);

  console.log('\nDone.');
  console.log(`  Login:    ${email} / ${password}`);
  console.log('  Add this to Vercel env (and .env.example) so the API blocks writes:');
  console.log(`    DEMO_USER_IDS=${userId}`);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
