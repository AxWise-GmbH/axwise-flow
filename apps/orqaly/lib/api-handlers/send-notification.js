/**
 * Vercel serverless: send email notification.
 * POST /api/send-notification
 *
 * Modes:
 * 1) User notification send (JWT auth):
 *    Headers: Authorization: Bearer <Supabase access_token>
 *    Body: { action, data, idempotencyKey? }
 *
 * 2) Google Stitch template sync (shared secret):
 *    Headers: x-stitch-token: <STITCH_TEMPLATE_SYNC_TOKEN>
 *    Body: { provider?, templates: [{ actionKey, subject, html, text?, version?, variables? }] }
 *
 * 3) Resend delivery webhook ingest (shared secret):
 *    Headers: x-resend-webhook-secret: <RESEND_WEBHOOK_SECRET>
 *    Body: webhook payload from Resend
 *
 * Note:
 * This consolidation keeps function count under Hobby plan limits.
 */
const RESEND_API = 'https://api.resend.com/emails';

import { createHash } from 'node:crypto';
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { sendNotificationBodySchema, stitchTemplateSyncSchema } from '../../api/_lib/validate.js';
import {
  buildSupabaseUserClient,
  buildSupabaseAdminClient,
} from '../../api/_lib/supabase-server.js';
import { TEMPLATE_MAP } from '../../src/services/emailTemplates.js';
import {
  getDefaultEmailPreferences,
  isValidEmailAction,
  normalizeEmailPreferences,
  getChannelPrefs,
  getActionLabel,
} from '../../shared/notificationCatalog.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPathValue(obj, path) {
  if (!obj || !path) return '';
  return path.split('.').reduce((acc, part) => (acc == null ? '' : acc[part]), obj);
}

function renderTemplateString(template, data, { html = false } = {}) {
  const input = String(template || '');
  return input.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_token, key) => {
    const value = getPathValue(data, key);
    if (value == null) return '';
    const normalized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return html ? escapeHtml(normalized) : normalized;
  });
}

function deriveIdempotencyKey({ userId, action, data, incomingKey }) {
  if (incomingKey) return incomingKey.slice(0, 256);
  const minuteWindow = new Date().toISOString().slice(0, 16);
  const payloadHash = createHash('sha1')
    .update(JSON.stringify(data || {}))
    .digest('hex')
    .slice(0, 24);
  return `${action}/${userId}/${minuteWindow}/${payloadHash}`.slice(0, 256);
}

async function loadUserPreferences(userClient, userId) {
  const { data, error } = await userClient
    .from('email_notification_preferences')
    .select('preferences')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    const msg = String(error.message || '').toLowerCase();
    if (
      msg.includes('relation') ||
      msg.includes('does not exist') ||
      msg.includes('could not find the table') ||
      msg.includes('schema cache')
    ) {
      return normalizeEmailPreferences(getDefaultEmailPreferences());
    }
    throw new Error(error.message || 'Failed to load notification preferences');
  }
  return normalizeEmailPreferences(data?.preferences || getDefaultEmailPreferences());
}

async function loadActiveTemplate(userClient, action) {
  const { data, error } = await userClient
    .from('email_templates')
    .select('provider, version, subject_template, html_template, text_template')
    .eq('action_key', action)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function buildLocalTemplate(action, templateData) {
  const fallbackFn = TEMPLATE_MAP[action];
  if (!fallbackFn) return null;
  return fallbackFn(templateData || {});
}

function resolveNotificationContent({ dbTemplate, localTemplate, legacyTemplate, templateData }) {
  if (dbTemplate?.subject_template && dbTemplate?.html_template) {
    return {
      source: 'stitch',
      provider: dbTemplate.provider || 'stitch_google',
      version: dbTemplate.version || null,
      subject: renderTemplateString(dbTemplate.subject_template, templateData, { html: false }),
      html: renderTemplateString(dbTemplate.html_template, templateData, { html: true }),
      text: dbTemplate.text_template
        ? renderTemplateString(dbTemplate.text_template, templateData, { html: false })
        : '',
    };
  }

  if (localTemplate?.subject && (localTemplate?.html || localTemplate?.text)) {
    return {
      source: 'local',
      provider: 'built_in',
      version: null,
      subject: localTemplate.subject,
      html: localTemplate.html || '',
      text: localTemplate.text || '',
    };
  }

  return {
    source: 'legacy-client',
    provider: 'client_rendered',
    version: null,
    subject: legacyTemplate?.subject || '',
    html: legacyTemplate?.html || '',
    text: legacyTemplate?.text || '',
  };
}

async function insertNotificationEvent(userClient, payload) {
  if (!userClient) return;
  try {
    await userClient.from('email_notification_events').insert(payload);
  } catch {
    // Non-blocking: delivery logging should never break core flow.
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * In-app channel: write a `notification_log` row (channel 'in_app') with the
 * service-role admin client. The Notification drawer/toast in MainLayout polls
 * this table and renders it generically from subject/body/metadata, so no UI
 * change is needed. Never throws - in-app delivery must not break the request.
 */
async function deliverInAppNotification({ action, userId, subject, body, priority = 'medium' }) {
  try {
    const admin = buildSupabaseAdminClient();
    if (!admin) return false;
    const { error } = await admin.from('notification_log').insert({
      user_id: userId,
      channel: 'in_app',
      event_type: action,
      subject: String(subject || getActionLabel(action) || action).slice(0, 300),
      body: String(body || '').slice(0, 2000),
      status: 'sent',
      sent_at: new Date().toISOString(),
      metadata: { action, priority, source: 'catalog' },
    });
    return !error;
  } catch {
    return false;
  }
}

function extractTemplateVariables(template = '') {
  const tokens = new Set();
  const regex = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  let match;
  while ((match = regex.exec(String(template)))) {
    tokens.add(match[1]);
  }
  return [...tokens];
}

function validateTemplateVariables(payloadTemplate) {
  const tokens = new Set([
    ...extractTemplateVariables(payloadTemplate.subject),
    ...extractTemplateVariables(payloadTemplate.html),
    ...extractTemplateVariables(payloadTemplate.text || ''),
  ]);

  const declared = Array.isArray(payloadTemplate.variables) ? payloadTemplate.variables : [];
  if (declared.length === 0) return { ok: true, tokens: [...tokens] };

  const declaredSet = new Set(declared);
  const missing = [...tokens].filter((token) => !declaredSet.has(token));
  if (missing.length > 0) {
    return { ok: false, tokens: [...tokens], missing };
  }
  return { ok: true, tokens: [...tokens] };
}

function getStitchToken(req) {
  return req.headers['x-stitch-token'] || req.headers['x-template-sync-token'] || '';
}

function getWebhookSecret(req) {
  // Accept webhook secret via header only (never query string — URLs are logged)
  return String(req.headers['x-resend-webhook-secret'] || '');
}

function mapResendEventToStatus(eventType) {
  const type = String(eventType || '').toLowerCase();
  if (type === 'email.sent') return 'sent';
  if (type === 'email.delivered') return 'delivered';
  if (type === 'email.delivery_delayed') return 'delivery_delayed';
  if (type === 'email.opened') return 'opened';
  if (type === 'email.clicked') return 'clicked';
  if (type === 'email.bounced') return 'bounced';
  if (type === 'email.complained') return 'complained';
  if (type === 'email.failed') return 'failed';
  if (type === 'email.suppressed') return 'suppressed';
  return 'event_received';
}

function getResendId(payload) {
  return payload?.data?.email_id || payload?.data?.id || payload?.email_id || payload?.id || null;
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    body = JSON.parse(body);
  }
  return body || {};
}

async function handleTemplateSync(req, res, body) {
  const expectedToken = process.env.STITCH_TEMPLATE_SYNC_TOKEN || '';
  if (!expectedToken) {
    return jsonError(res, 500, 'STITCH_TEMPLATE_SYNC_TOKEN is not configured');
  }
  if (getStitchToken(req) !== expectedToken) {
    return jsonError(res, 401, 'Unauthorized template sync request');
  }

  const admin = buildSupabaseAdminClient();
  if (!admin) {
    return jsonError(res, 500, 'SUPABASE_SERVICE_ROLE_KEY is required for template sync');
  }

  const parsed = stitchTemplateSyncSchema.safeParse(body || {});
  if (!parsed.success) {
    const message =
      parsed.error.issues?.[0]?.message ||
      parsed.error.errors?.[0]?.message ||
      'Invalid template sync payload';
    return jsonError(res, 400, message);
  }

  const { provider, templates } = parsed.data;
  const unsupported = templates
    .map((tpl) => tpl.actionKey)
    .filter((actionKey) => !isValidEmailAction(actionKey));
  if (unsupported.length > 0) {
    return jsonError(res, 400, `Unsupported action keys: ${unsupported.join(', ')}`);
  }

  const results = [];

  for (const tpl of templates) {
    const varValidation = validateTemplateVariables(tpl);
    if (!varValidation.ok) {
      return jsonError(
        res,
        400,
        `Template for action "${tpl.actionKey}" declares missing variables: ${varValidation.missing.join(', ')}`
      );
    }

    const { data: latestVersionRow, error: latestErr } = await admin
      .from('email_templates')
      .select('version')
      .eq('action_key', tpl.actionKey)
      .eq('provider', provider)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) {
      return jsonError(res, 500, latestErr.message || 'Failed reading latest template version');
    }

    const nextVersion = tpl.version || (latestVersionRow?.version || 0) + 1;
    const now = new Date().toISOString();

    const { error: deactivateErr } = await admin
      .from('email_templates')
      .update({ is_active: false, updated_at: now })
      .eq('action_key', tpl.actionKey)
      .eq('provider', provider)
      .eq('is_active', true);
    if (deactivateErr) {
      return jsonError(
        res,
        500,
        deactivateErr.message || 'Failed deactivating previous template version'
      );
    }

    const { data: existingRow, error: existingErr } = await admin
      .from('email_templates')
      .select('id')
      .eq('action_key', tpl.actionKey)
      .eq('provider', provider)
      .eq('version', nextVersion)
      .maybeSingle();
    if (existingErr) {
      return jsonError(res, 500, existingErr.message || 'Failed checking existing version');
    }

    if (existingRow?.id) {
      const { error: updateErr } = await admin
        .from('email_templates')
        .update({
          subject_template: tpl.subject,
          html_template: tpl.html,
          text_template: tpl.text || '',
          variables: varValidation.tokens,
          is_active: true,
          updated_at: now,
          created_by: 'stitch_sync',
        })
        .eq('id', existingRow.id);
      if (updateErr) {
        return jsonError(res, 500, updateErr.message || 'Failed updating template');
      }
    } else {
      const { error: insertErr } = await admin.from('email_templates').insert({
        action_key: tpl.actionKey,
        provider,
        version: nextVersion,
        subject_template: tpl.subject,
        html_template: tpl.html,
        text_template: tpl.text || '',
        variables: varValidation.tokens,
        is_active: true,
        created_by: 'stitch_sync',
        updated_at: now,
      });
      if (insertErr) {
        return jsonError(res, 500, insertErr.message || 'Failed inserting template');
      }
    }

    results.push({
      actionKey: tpl.actionKey,
      provider,
      version: nextVersion,
      variables: varValidation.tokens,
      status: 'active',
    });
  }

  return res.status(200).json({
    success: true,
    provider,
    synced: results.length,
    templates: results,
  });
}

async function handleResendWebhook(req, res, body) {
  const expectedSecret = process.env.RESEND_WEBHOOK_SECRET || '';
  if (!expectedSecret) {
    return jsonError(res, 500, 'RESEND_WEBHOOK_SECRET is not configured');
  }
  if (getWebhookSecret(req) !== expectedSecret) {
    return jsonError(res, 401, 'Unauthorized webhook request');
  }

  const admin = buildSupabaseAdminClient();
  if (!admin) {
    return jsonError(res, 500, 'SUPABASE_SERVICE_ROLE_KEY is required for webhook ingest');
  }

  const payload = body || {};
  const eventType = payload?.type || payload?.event || 'unknown';
  const resendId = getResendId(payload);
  if (!resendId) {
    return jsonError(res, 400, 'Missing resend email id in payload');
  }

  const status = mapResendEventToStatus(eventType);
  const now = new Date().toISOString();
  const deliveredAt = status === 'delivered' ? now : null;

  const { data: existingRow, error: existingErr } = await admin
    .from('email_notification_events')
    .select('id, payload_meta')
    .eq('resend_id', resendId)
    .maybeSingle();
  if (existingErr) {
    return jsonError(res, 500, existingErr.message || 'Failed reading notification event');
  }

  if (existingRow?.id) {
    const nextMeta = { ...(existingRow.payload_meta || {}), resendWebhook: payload };
    const { error: updateErr } = await admin
      .from('email_notification_events')
      .update({
        status,
        delivered_at: deliveredAt,
        error_message:
          status === 'failed'
            ? payload?.data?.message || payload?.message || 'Resend send failure'
            : null,
        payload_meta: nextMeta,
        updated_at: now,
      })
      .eq('id', existingRow.id);
    if (updateErr) {
      return jsonError(res, 500, updateErr.message || 'Failed updating notification event');
    }
  } else {
    const { error: insertErr } = await admin.from('email_notification_events').insert({
      user_id: null,
      action_key: 'unknown',
      recipient_email: payload?.data?.to?.[0] || payload?.to || null,
      status,
      resend_id: resendId,
      template_source: 'unknown',
      template_provider: 'resend_webhook',
      payload_meta: { resendWebhook: payload },
      error_message:
        status === 'failed'
          ? payload?.data?.message || payload?.message || 'Resend send failure'
          : null,
      delivered_at: deliveredAt,
      updated_at: now,
    });
    if (insertErr) {
      return jsonError(res, 500, insertErr.message || 'Failed inserting webhook event');
    }
  }

  return res.status(200).json({ success: true, status, resendId });
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return jsonError(res, 405, 'Method not allowed');
  }

  try {
    let body = {};
    try {
      body = parseBody(req);
    } catch {
      return jsonError(res, 400, 'Invalid JSON body');
    }

    if (getStitchToken(req)) {
      return await handleTemplateSync(req, res, body);
    }

    if (getWebhookSecret(req)) {
      return await handleResendWebhook(req, res, body);
    }

    /* ---- Auth ---- */
    const token = getBearerToken(req);
    const user = await verifySupabaseToken(token);
    if (!user) {
      return jsonError(res, 401, 'Unauthorized. Sign in and retry.');
    }

    /* ---- Rate limit ---- */
    const rl = checkRateLimit({
      key: `send-notification:${getRateLimitIdentifier(req, user.id)}`,
      limit: Number(process.env.SEND_NOTIFICATION_RATE_LIMIT_PER_MIN || 20),
      windowMs: 60_000,
    });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) {
      return jsonError(res, 429, 'Rate limit exceeded. Please retry shortly.');
    }

    /* ---- Resend key ---- */
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      return jsonError(res, 500, 'RESEND_API_KEY is not configured');
    }

    const parsed = sendNotificationBodySchema.safeParse(body);
    if (!parsed.success) {
      const msg =
        parsed.error.issues?.[0]?.message ||
        parsed.error.errors?.[0]?.message ||
        'Invalid request body';
      return jsonError(res, 400, msg);
    }

    const {
      action,
      data: templateData,
      subject: legacySubject,
      html: legacyHtml,
      text: legacyText,
      idempotencyKey: incomingIdempotencyKey,
    } = parsed.data;

    if (!isValidEmailAction(action)) {
      return jsonError(res, 400, `Unsupported notification action: ${action}`);
    }

    const userClient = buildSupabaseUserClient(token);
    if (!userClient) {
      return jsonError(
        res,
        500,
        'Supabase client is not configured for notification preference checks'
      );
    }

    /* ---- Recipient: authenticated user's email ---- */
    const to = user.email;
    if (!to) {
      return jsonError(res, 400, 'User email not available');
    }

    /* ---- Server-side preference enforcement ---- */
    const prefs = await loadUserPreferences(userClient, user.id);
    const isEnabled = !!prefs[action];

    if (!isEnabled) {
      await insertNotificationEvent(userClient, {
        user_id: user.id,
        action_key: action,
        recipient_email: to,
        status: 'skipped',
        template_source: 'none',
        template_provider: null,
        template_version: null,
        payload_meta: { reason: 'action_disabled', action },
      });
      return res
        .status(200)
        .json({ success: true, skipped: true, reason: 'disabled_by_preferences' });
    }

    const channels = getChannelPrefs(prefs);

    const dbTemplate = await loadActiveTemplate(userClient, action);
    const localTemplate = buildLocalTemplate(action, templateData);
    const resolved = resolveNotificationContent({
      dbTemplate,
      localTemplate,
      legacyTemplate: { subject: legacySubject, html: legacyHtml, text: legacyText },
      templateData,
    });
    const hasContent = !!resolved.subject && (!!resolved.html || !!resolved.text);

    /* ---- In-app channel: notification_log row drives the drawer/toast ---- */
    let inAppSent = false;
    if (channels.inapp) {
      inAppSent = await deliverInAppNotification({
        action,
        userId: user.id,
        subject: resolved.subject,
        body: resolved.text || stripHtml(resolved.html),
      });
    }

    /* ---- Email channel ---- */
    if (!channels.email) {
      return res.status(200).json({
        success: true,
        action,
        emailSent: false,
        inAppSent,
        ...(channels.inapp ? {} : { skipped: true, reason: 'channels_disabled' }),
      });
    }

    if (!hasContent) {
      // Email is on but there's no renderable content. If in-app already
      // delivered, succeed gracefully; otherwise surface the template gap.
      if (inAppSent) {
        return res.status(200).json({ success: true, action, emailSent: false, inAppSent });
      }
      return jsonError(
        res,
        400,
        `Could not resolve template for action "${action}". Provide a Stitch template or local fallback template.`
      );
    }

    const idempotencyKey = deriveIdempotencyKey({
      userId: user.id,
      action,
      data: templateData,
      incomingKey: incomingIdempotencyKey,
    });

    const fromServer = process.env.RESEND_FROM_EMAIL || 'Orqaly <noreply@orqaly.com>';
    const payload = {
      from: fromServer,
      to: [to],
      subject: String(resolved.subject).slice(0, 500),
      ...(resolved.html ? { html: String(resolved.html).slice(0, 50_000) } : {}),
      ...(resolved.text && !resolved.html ? { text: String(resolved.text).slice(0, 50_000) } : {}),
    };

    const response = await fetchWithRetry(RESEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    const resData = await response.json().catch(() => ({}));
    if (!response.ok) {
      await insertNotificationEvent(userClient, {
        user_id: user.id,
        action_key: action,
        recipient_email: to,
        status: 'failed',
        resend_id: resData?.id || null,
        template_source: resolved.source,
        template_provider: resolved.provider,
        template_version: resolved.version,
        error_message: resData?.message || 'Failed to send via Resend',
        payload_meta: { detail: resData?.detail || null, action },
      });
      return jsonError(
        res,
        response.status,
        resData.message || 'Failed to send notification email',
        resData.detail
      );
    }

    await insertNotificationEvent(userClient, {
      user_id: user.id,
      action_key: action,
      recipient_email: to,
      status: 'sent',
      resend_id: resData?.id || null,
      template_source: resolved.source,
      template_provider: resolved.provider,
      template_version: resolved.version,
      payload_meta: { action, idempotencyKey },
    });

    return res.status(200).json({
      success: true,
      id: resData.id,
      action,
      emailSent: true,
      inAppSent,
      templateSource: resolved.source,
    });
  } catch (err) {
    return handleApiError(res, err, 'send-notification');
  }
}
