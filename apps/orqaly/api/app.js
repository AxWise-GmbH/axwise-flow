/**
 * App core: single serverless function for app/auth/public and deprecated routes.
 * Dispatches by path. Vercel rewrites route /api/health, /api/invite-user, etc. to /api/app?path=...
 * Static imports so Vercel bundler includes all handlers (dynamic import can omit files at deploy).
 */
import { jsonError } from './_lib/errors.js';
import { applySecurityHeaders } from './_lib/security-headers.js';
import { stripRouteKey } from './_lib/route-key.js';
import { enforceDemoWriteGuard } from './_lib/demo-guard.js';
import { createLogger } from './_lib/logger.js';

const log = createLogger('app');
import health from '../lib/api-handlers/health.js';
import sendEmail from '../lib/api-handlers/send-email.js';
import sendNotification from '../lib/api-handlers/send-notification.js';
import requestPasswordReset from '../lib/api-handlers/request-password-reset.js';
import inviteUser from '../lib/api-handlers/invite-user.js';
import publicBook from '../lib/api-handlers/public-book.js';
import publicAvailability from '../lib/api-handlers/public-availability.js';
import transcribe from '../lib/api-handlers/transcribe.js';
import aiAnalyzePartners from '../lib/api-handlers/ai-analyze-partners.js';
import backupDatabase from '../lib/api-handlers/backup-database.js';
import deleteMfaFactor from '../lib/api-handlers/delete-mfa-factor.js';
import loginGuard from '../lib/api-handlers/login-guard.js';
import executeTool from '../lib/api-handlers/execute-tool.js';
import testToolConnection from '../lib/api-handlers/test-tool-connection.js';
import knowledgeBase from '../lib/api-handlers/knowledge-base.js';
import contacts from '../lib/api-handlers/contacts.js';
import dashboardTemplates from '../lib/api-handlers/dashboard-templates.js';
import instrumentCounts from '../lib/api-handlers/instrument-counts.js';
import stripeConnect from '../lib/api-handlers/stripe-connect.js';
import verifyPin from '../lib/api-handlers/verify-pin.js';
import setupPin from '../lib/api-handlers/setup-pin.js';
import speechToken from '../lib/api-handlers/speech-token.js';
import translate from '../lib/api-handlers/translate.js';
import teamTasks from '../lib/api-handlers/team-tasks.js';
import workflows from '../lib/api-handlers/workflows.js';
import projects from '../lib/api-handlers/projects.js';
import pipeline from '../lib/api-handlers/pipeline.js';
import assistantChat from '../lib/api-handlers/assistant-chat.js';
import assistantStream from '../lib/api-handlers/assistant-stream.js';
import assistantHomeSummary from '../lib/api-handlers/assistant-home-summary.js';
import assistantTools from '../lib/api-handlers/assistant-tools.js';
import toolSetup from '../lib/api-handlers/tool-setup.js';
import composioConnect from '../lib/api-handlers/composio-connect.js';
import marketplace from '../lib/api-handlers/marketplace.js';
import goals from '../lib/api-handlers/goals.js';
import financial from '../lib/api-handlers/financial.js';
import budgetRequests from '../lib/api-handlers/budget-requests.js';
import tts from '../lib/api-handlers/tts.js';
import agentSkills from '../lib/api-handlers/agent-skills.js';
import skillForge from '../lib/api-handlers/skill-forge.js';
import ratings from '../lib/api-handlers/ratings.js';
import organizations from '../lib/api-handlers/organizations.js';
import teamChat from '../lib/api-handlers/team-chat.js';
import renderDeck from '../lib/api-handlers/render-deck.js';
import agentProfiles from '../lib/api-handlers/agent-profiles.js';
import generateAgentAvatar from '../lib/api-handlers/generate-agent-avatar.js';
import seedAgentProfiles from '../lib/api-handlers/seed-agent-profiles.js';
import agentChat from '../lib/api-handlers/agent-chat.js';
import orgVault from '../lib/api-handlers/org-vault.js';
import agentEnhancements from '../lib/api-handlers/agent-enhancements.js';
import goalLeadChat from '../lib/api-handlers/goal-lead-chat.js';
import agentLibraries from '../lib/api-handlers/agent-libraries.js';
import landingPages from '../lib/api-handlers/landing-pages.js';
import designComments from '../lib/api-handlers/design-comments.js';
import brandKit from '../lib/api-handlers/brand-kit.js';
import deliverableRefine from '../lib/api-handlers/deliverable-refine.js';
import replicators from '../lib/api-handlers/replicators.js';
import userApiKeys from '../lib/api-handlers/user-api-keys.js';
import userApiKeysTest from '../lib/api-handlers/user-api-keys-test.js';
import userApiKeysProviders from '../lib/api-handlers/user-api-keys-providers.js';
import userPrefs from '../lib/api-handlers/user-prefs.js';
import marketplaceImports from '../lib/api-handlers/marketplace-imports.js';
import marketplaceLibraryItems from '../lib/api-handlers/marketplace-library-items.js';
import githubAgentsImport from '../lib/api-handlers/github-agents-import.js';
import storageConnections from '../lib/api-handlers/storage-connections.js';
import assistantSetup from '../lib/api-handlers/assistant-setup.js';
import assistants from '../lib/api-handlers/assistants.js';
import assistantHistory from '../lib/api-handlers/assistant-history.js';
import companyBrief from '../lib/api-handlers/company-brief.js';
import kbBulkUpload from '../lib/api-handlers/kb-bulk-upload.js';
import obsidianSync from '../lib/api-handlers/obsidian-sync.js';
import assistantChatSync from '../lib/api-handlers/assistant-chat-sync.js';
import aiChatImport from '../lib/api-handlers/ai-chat-import.js';
import kbConnections from '../lib/api-handlers/kb-connections.js';
import kbOauth from '../lib/api-handlers/kb-oauth.js';
import storageMonitor from '../lib/api-handlers/storage-monitor.js';
import assistantFirstSteps from '../lib/api-handlers/assistant-first-steps.js';
import importKeysPreview from '../lib/api-handlers/import-keys-preview.js';
import importKeysApply from '../lib/api-handlers/import-keys-apply.js';
import importKeysCancel from '../lib/api-handlers/import-keys-cancel.js';
import cleanupImports from '../lib/api-handlers/cleanup-imports.js';
import humanTaskComplete from '../lib/api-handlers/human-task-complete.js';
import humanTasksEscalate from '../lib/api-handlers/human-tasks-escalate.js';
import notifications from '../lib/api-handlers/notifications.js';
import businesses from '../lib/api-handlers/businesses.js';
import partnerEntities from '../lib/api-handlers/partner-entities.js';
import businessModules from '../lib/api-handlers/business-modules.js';
import dashboards from '../lib/api-handlers/dashboards.js';
import dashboardQuery from '../lib/api-handlers/dashboard-query.js';
import dashboardAuto from '../lib/api-handlers/dashboard-auto.js';
import pulses from '../lib/api-handlers/pulses.js';
import { handleLocalLlmModels } from '../lib/api-handlers/local-llm-models.js';
import notionSync from '../lib/api-handlers/notion-sync.js';
import providerCatalog from '../lib/api-handlers/provider-catalog.js';
import huggingfaceModels from '../lib/api-handlers/huggingface-models.js';
import arena from '../lib/api-handlers/arena.js';
import libraryCalibration from '../lib/api-handlers/library-calibration.js';

const HANDLERS = {
  health,
  'send-email': sendEmail,
  'send-notification': sendNotification,
  'request-password-reset': requestPasswordReset,
  'invite-user': inviteUser,
  'public-book': publicBook,
  'public-availability': publicAvailability,
  transcribe,
  'ai-analyze-partners': aiAnalyzePartners,
  'backup-database': backupDatabase,
  'delete-mfa-factor': deleteMfaFactor,
  'login-guard': loginGuard,
  'execute-tool': executeTool,
  'test-tool-connection': testToolConnection,
  'knowledge-base': knowledgeBase,
  contacts: contacts,
  'dashboard-templates': dashboardTemplates,
  'instrument-counts': instrumentCounts,
  'stripe-connect': stripeConnect,
  'verify-pin': verifyPin,
  'setup-pin': setupPin,
  'speech-token': speechToken,
  translate,
  'team-tasks': teamTasks,
  workflows,
  projects,
  pipeline,
  'assistant-chat': assistantChat,
  'assistant-stream': assistantStream,
  'assistant-home-summary': assistantHomeSummary,
  'assistant-tools': assistantTools,
  'tool-setup': toolSetup,
  'composio-connect': composioConnect,
  marketplace,
  goals,
  financial,
  'budget-requests': budgetRequests,
  tts,
  'agent-skills': agentSkills,
  'skill-forge': skillForge,
  ratings,
  organizations,
  'team-chat': teamChat,
  'render-deck': renderDeck,
  'agent-profiles': agentProfiles,
  'generate-agent-avatar': generateAgentAvatar,
  'seed-agent-profiles': seedAgentProfiles,
  'agent-chat': agentChat,
  'org-vault': orgVault,
  'agent-enhancements': agentEnhancements,
  'goal-lead-chat': goalLeadChat,
  'agent-libraries': agentLibraries,
  'landing-pages': landingPages,
  'design-comments': designComments,
  'brand-kit': brandKit,
  'deliverable-refine': deliverableRefine,
  replicators,
  'user-api-keys': userApiKeys,
  'user-api-keys-test': userApiKeysTest,
  'user-api-keys-providers': userApiKeysProviders,
  'user-prefs': userPrefs,
  'marketplace-imports': marketplaceImports,
  'marketplace-library-items': marketplaceLibraryItems,
  'github-agents-import': githubAgentsImport,
  'storage-connections': storageConnections,
  'assistant-setup': assistantSetup,
  assistants: assistants,
  'assistant-history': assistantHistory,
  'company-brief': companyBrief,
  'kb-bulk-upload': kbBulkUpload,
  'obsidian-sync': obsidianSync,
  'assistant-chat-sync': assistantChatSync,
  'ai-chat-import': aiChatImport,
  'kb-connections': kbConnections,
  'kb-oauth': kbOauth,
  'storage-monitor': storageMonitor,
  'assistant-first-steps': assistantFirstSteps,
  'import-keys-preview': importKeysPreview,
  'import-keys-apply': importKeysApply,
  'import-keys-cancel': importKeysCancel,
  'cleanup-imports': cleanupImports,
  'human-task-complete': humanTaskComplete,
  'human-tasks-escalate': humanTasksEscalate,
  notifications,
  businesses,
  'partner-entities': partnerEntities,
  'business-modules': businessModules,
  dashboards,
  'dashboard-query': dashboardQuery,
  'dashboard-auto': dashboardAuto,
  pulses,
  'local-llm-models': handleLocalLlmModels,
  'notion-sync': notionSync,
  'provider-catalog': providerCatalog,
  'huggingface-models': huggingfaceModels,
  arena,
  'library-calibration': libraryCalibration,
};

export default async function handler(req, res) {
  applySecurityHeaders(res);
  const path = (req.query?.path || '').trim().toLowerCase();
  stripRouteKey(req);
  const fn = HANDLERS[path];
  if (!fn) {
    log.warn(req, 'route.not_found', { path });
    return jsonError(res, 404, 'Not found');
  }
  if (await enforceDemoWriteGuard(req, res)) return;
  const done = log.startTimer(req, 'request', { method: req.method, path });
  try {
    const result = await fn(req, res);
    done({ status: res.statusCode });
    return result;
  } catch (err) {
    done({ status: 500, error: err?.message });
    return jsonError(res, 500, err?.message || 'Handler error');
  }
}
