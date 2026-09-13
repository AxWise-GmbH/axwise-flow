import * as workflowBackend from './workflowBackend';
import { hasSupabase } from '../lib/supabase';
import { maybeNotify } from './emailNotificationDispatcher';

const STORAGE_KEY = 'orch_workflows';

export const ACTION_TYPES = [
  { id: 'sms', label: 'Send SMS', description: 'Send an SMS when postback is received' },
  { id: 'email', label: 'Send Email', description: 'Send an email when postback is received' },
  {
    id: 'webhook',
    label: 'Call Webhook',
    description: 'Trigger an external webhook with postback data',
  },
];

/** Options for the Actions block: what to do with postback data */
export const POSTBACK_ACTIONS = [
  { id: 'sms', label: 'Send SMS', description: 'Send SMS with postback data (lead info, phone)' },
  {
    id: 'email',
    label: 'Send Email',
    description: 'Send email with postback data (lead info, address)',
  },
  { id: 'webhook', label: 'Call Webhook', description: 'POST postback data to an external URL' },
  {
    id: 'add-to-crm',
    label: 'Add to CRM',
    description: 'Store postback as partner / lead in database',
  },
  {
    id: 'log-event',
    label: 'Log Event',
    description: 'Save postback for analytics and audit trail',
  },
  {
    id: 'trigger-workflow',
    label: 'Trigger Workflow',
    description: 'Run another workflow with postback data',
  },
];

export const SMS_PROVIDERS = [
  { id: 'twilio', label: 'Twilio' },
  { id: 'nexmo', label: 'Nexmo (Vonage)' },
  { id: 'other', label: 'Other (API URL)' },
];

export const EMAIL_PROVIDERS = [
  { id: 'sendgrid', label: 'SendGrid' },
  { id: 'mailgun', label: 'Mailgun' },
  { id: 'smtp', label: 'SMTP' },
  { id: 'other', label: 'Other (API URL)' },
];

export const TRAFFIC_SOURCE_OPTIONS = [
  { id: 'adexium', label: 'Adexium' },
  { id: 'custom-solution', label: 'Custom solution' },
];

function generateId() {
  return `wf-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DUMMY_WORKFLOWS = [
  {
    id: 'wf-dummy-1',
    name: 'FB Lead → SMS + Email',
    landingPageUrl: 'https://landing.example.com/offer/fb-lead',
    trafficSources: ['FB'],
    trackingCampaign: { id: 'camp_fb_lead_01', name: 'FB Lead Gen' },
    smsService: {
      provider: 'twilio',
      apiKey: 'AC••••••••',
      apiSecret: '',
      fromNumber: '+1234567890',
      apiUrl: '',
    },
    emailService: {
      provider: 'sendgrid',
      apiKey: 'SG.••••••••',
      fromEmail: 'noreply@example.com',
      apiUrl: '',
    },
    actions: [
      { type: 'sms', config: { templateId: 'lead-notify' } },
      { type: 'email', config: { templateId: 'welcome-lead' } },
    ],
    enabled: true,
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-10T14:30:00.000Z',
  },
  {
    id: 'wf-dummy-2',
    name: 'Google PPC Postback → Webhook',
    landingPageUrl: 'https://track.example.com/conv?source=google',
    trafficSources: ['Google', 'PPC'],
    actions: [{ type: 'webhook', config: { url: 'https://api.example.com/postback' } }],
    enabled: true,
    createdAt: '2026-02-05T09:00:00.000Z',
    updatedAt: '2026-02-09T11:00:00.000Z',
  },
  {
    id: 'wf-dummy-3',
    name: 'TikTok / Native → SMS',
    landingPageUrl: 'https://promo.example.com/landing/tiktok',
    trafficSources: ['TikTok', 'Native'],
    actions: [{ type: 'sms', config: {} }],
    enabled: false,
    createdAt: '2026-02-08T16:00:00.000Z',
    updatedAt: '2026-02-08T16:00:00.000Z',
  },
  {
    id: 'wf-dummy-4',
    name: 'Scheduled follow-up SMS',
    landingPageUrl: 'https://landing.example.com/lead-form',
    trafficSources: ['FB', 'Google'],
    actions: [
      { type: 'email', config: { scheduleType: 'immediate' } },
      {
        type: 'sms',
        config: { scheduleType: 'scheduled', scheduledAt: '2026-02-15T14:00:00.000Z' },
      },
    ],
    enabled: true,
    createdAt: '2026-02-10T08:00:00.000Z',
    updatedAt: '2026-02-10T08:00:00.000Z',
  },
];

async function seedDummyWorkflows() {
  if (hasSupabase()) return DUMMY_WORKFLOWS;
  workflowBackend.saveWorkflows(DUMMY_WORKFLOWS);
  return DUMMY_WORKFLOWS;
}

function buildWorkflow(data) {
  const category = (data.category && String(data.category).trim()) || null;
  return {
    id: generateId(),
    name: data.name || 'Untitled Workflow',
    category: category || null,
    landingPageUrl: data.landingPageUrl || '',
    trafficSources: Array.isArray(data.trafficSources) ? data.trafficSources : [],
    actions: Array.isArray(data.actions) ? data.actions : [],
    enabled: data.enabled !== false,
    trackingCampaign:
      data.trackingCampaign && (data.trackingCampaign.id || data.trackingCampaign.name)
        ? {
            id: String(data.trackingCampaign.id || ''),
            name: String(data.trackingCampaign.name || ''),
          }
        : null,
    smsService:
      data.smsService && (data.smsService.apiKey || data.smsService.apiUrl)
        ? {
            provider: data.smsService.provider || 'twilio',
            apiKey: data.smsService.apiKey || '',
            apiSecret: data.smsService.apiSecret || '',
            fromNumber: data.smsService.fromNumber || '',
            apiUrl: data.smsService.apiUrl || '',
          }
        : null,
    emailService:
      data.emailService && (data.emailService.apiKey || data.emailService.apiUrl)
        ? {
            provider: data.emailService.provider || 'sendgrid',
            apiKey: data.emailService.apiKey || '',
            fromEmail: data.emailService.fromEmail || '',
            apiUrl: data.emailService.apiUrl || '',
          }
        : null,
    visibility: data.visibility || 'public',
    description: data.description || '',
    createdBy: data.createdBy || '',
    // Last editor identity (email). Supabase backend will also stamp this.
    updatedByEmail: data.updatedByEmail || '',
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
    edges: Array.isArray(data.edges) ? data.edges : [],
    // User-created text-only blocks for this workflow.
    customBlocks: Array.isArray(data.customBlocks) ? data.customBlocks : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function getAllWorkflows() {
  const list = await workflowBackend.loadWorkflows();
  if (!hasSupabase() && list.length === 0) {
    return await seedDummyWorkflows();
  }
  return list;
}

export async function getWorkflowById(id) {
  const list = await workflowBackend.loadWorkflows();
  return list.find((w) => w.id === id) || null;
}

export async function createWorkflow(data, agentContext = null) {
  const workflow = buildWorkflow(data);
  const persisted = await workflowBackend.createWorkflow(workflow, agentContext);
  maybeNotify('workflow_created', { name: workflow.name || workflow.id });
  return persisted;
}

export async function updateWorkflow(id, data, agentContext = null) {
  const list = await workflowBackend.loadWorkflows();
  const idx = list.findIndex((w) => w.id === id);
  if (idx < 0) return null;
  const existing = list[idx];
  const updated = {
    ...existing,
    name: data.name !== undefined ? data.name : existing.name,
    category: data.category !== undefined ? data.category : existing.category,
    landingPageUrl:
      data.landingPageUrl !== undefined ? data.landingPageUrl : existing.landingPageUrl,
    trafficSources: Array.isArray(data.trafficSources)
      ? data.trafficSources
      : existing.trafficSources,
    actions: Array.isArray(data.actions) ? data.actions : existing.actions,
    enabled: data.enabled !== undefined ? data.enabled : existing.enabled,
    trackingCampaign:
      data.trackingCampaign !== undefined
        ? data.trackingCampaign && (data.trackingCampaign.id || data.trackingCampaign.name)
          ? {
              id: String(data.trackingCampaign.id || ''),
              name: String(data.trackingCampaign.name || ''),
            }
          : null
        : existing.trackingCampaign,
    smsService:
      data.smsService !== undefined
        ? data.smsService && (data.smsService.apiKey || data.smsService.apiUrl)
          ? {
              provider: data.smsService.provider || 'twilio',
              apiKey: data.smsService.apiKey || '',
              apiSecret: data.smsService.apiSecret || '',
              fromNumber: data.smsService.fromNumber || '',
              apiUrl: data.smsService.apiUrl || '',
            }
          : null
        : existing.smsService,
    emailService:
      data.emailService !== undefined
        ? data.emailService && (data.emailService.apiKey || data.emailService.apiUrl)
          ? {
              provider: data.emailService.provider || 'sendgrid',
              apiKey: data.emailService.apiKey || '',
              fromEmail: data.emailService.fromEmail || '',
              apiUrl: data.emailService.apiUrl || '',
            }
          : null
        : existing.emailService,
    description: data.description !== undefined ? data.description : existing.description,
    createdBy: data.createdBy !== undefined ? data.createdBy : existing.createdBy,
    updatedByEmail:
      data.updatedByEmail !== undefined ? data.updatedByEmail : existing.updatedByEmail,
    nodes: data.nodes !== undefined ? data.nodes : existing.nodes,
    edges: data.edges !== undefined ? data.edges : existing.edges,
    customBlocks: data.customBlocks !== undefined ? data.customBlocks : existing.customBlocks,
    updatedAt: new Date().toISOString(),
  };
  const persisted = await workflowBackend.updateWorkflowById(id, updated, agentContext);
  maybeNotify('workflow_updated', {
    name: updated.name || id,
    changes: Object.keys(data)
      .filter((k) => data[k] !== undefined)
      .join(', '),
  });
  return persisted;
}

export async function deleteWorkflow(id, agentContext = null) {
  const w = await getWorkflowById(id);
  await workflowBackend.deleteWorkflowById(id, agentContext);
  maybeNotify('workflow_deleted', { name: w?.name || id });
  return true;
}

export async function toggleWorkflowEnabled(id) {
  const w = await getWorkflowById(id);
  if (!w) return null;
  const result = await updateWorkflow(id, { enabled: !w.enabled });
  maybeNotify('workflow_toggled', { name: w.name || id, enabled: !w.enabled });
  return result;
}
