/**
 * Voice Command Parser
 * Maps natural language (speech-to-text output) to app actions.
 * Returns array of { id, type, label, ...params } for confirmation/execution.
 * For questions about reports, formulas, or metrics, returns type: 'info' with topic for explanations.
 */
import { matchInfoTopics, INFO_TOPICS } from './askAnythingInfo.js';
import { AI_OPERATOR_MODES } from '../services/operatorOrchestratorService.js';
import { matchTemplateByKeywords } from '../pages/Reports/reportTemplates.js';

const NAV_MAP = [
  {
    patterns: [
      /go to dashboard|open dashboard|navigate to dashboard|show dashboard|dashboard page/i,
    ],
    path: '/dashboard',
    label: 'Dashboard',
  },
  {
    patterns: [
      /go to partners|open partners|navigate to partners|show partners|partners page|partner list/i,
    ],
    path: '/partners',
    label: 'Partners',
  },
  {
    patterns: [
      /go to task manager|open task manager|tasks? (?:page)?|task manager|show (?:my )?tasks/i,
    ],
    path: '/task-manager',
    label: 'Tasks',
  },
  {
    patterns: [
      /go to workflow|open workflow|workflows? (?:page)?|workflow|show (?:my )?workflows/i,
    ],
    path: '/workflow',
    label: 'Workflow',
  },
  {
    patterns: [/go to projects|open projects|projects? (?:page)?|show (?:my )?projects/i],
    path: '/projects',
    label: 'Projects',
  },
  {
    patterns: [/go to finances|open finances|finances? (?:page)?|show finances/i],
    path: '/finances',
    label: 'Finances',
  },
  {
    patterns: [/go to settings|open settings|settings page/i],
    path: '/settings',
    label: 'Settings',
  },
  {
    patterns: [/go to audit|audit log|activity log|open audit/i],
    path: '/audit-log',
    label: 'Activity Log',
  },
  {
    patterns: [/go to notification|notification center|ai notification|ai recomend|ai recommend/i],
    path: '/notification-center',
    label: 'AI Recommend',
  },
  {
    patterns: [/go to reports?|open reports?|reports? page|show reports?/i],
    path: '/reports',
    label: 'Reports',
  },
];

const GROUP_VARIANTS = { webmaster: 'Webmaster', partner: 'Partner', workmaster: 'Webmaster' };
const AGREEMENT_VARIANTS = { revshare: 'Revshare', cpl: 'CPL', hybrid: 'Hybrid' };
const GEO_CODES = new Set([
  'BR',
  'US',
  'GB',
  'DE',
  'FR',
  'ES',
  'IT',
  'CA',
  'AU',
  'JP',
  'MX',
  'IN',
  'PL',
  'TR',
  'NG',
  'ZA',
  'AR',
  'CL',
  'CO',
  'PE',
  'UA',
  'KZ',
  'RO',
  'PH',
  'TH',
  'VN',
  'ID',
  'EG',
  'KE',
  'BD',
]);

function parseCreatePartnerCriteria(text) {
  if (!text || typeof text !== 'string')
    return { name: '', group: '', team: '', agreement: '', geos: [] };
  const t = text.trim();
  let remainder = t
    .replace(/\b(?:create|add|register|set up|onboard)\s+(?:a\s+)?(?:new\s+)?partner\b/i, '')
    .trim();

  let agreement = '';
  let group = '';
  let team = '';
  const geos = [];

  const agreementMatch =
    remainder.match(/\bagreement\s+(revshare|cpl|hybrid)\b/i) ||
    remainder.match(/\b(revshare|cpl|hybrid)\b/i);
  if (agreementMatch) {
    agreement = AGREEMENT_VARIANTS[agreementMatch[1].toLowerCase()] || agreementMatch[1];
    remainder = remainder
      .replace(/\bagreement\s+(revshare|cpl|hybrid)\b/gi, '')
      .replace(/\b(revshare|cpl|hybrid)\b/gi, '')
      .trim();
  }

  const groupMatch =
    remainder.match(/\bgroup\s+(webmaster|partner|workmaster)\b/i) ||
    remainder.match(/\b(webmaster|partner|workmaster)\b/i);
  if (groupMatch) {
    group = GROUP_VARIANTS[groupMatch[1].toLowerCase()] || groupMatch[1];
    remainder = remainder
      .replace(/\bgroup\s+(webmaster|partner|workmaster)\b/gi, '')
      .replace(/\b(webmaster|partner|workmaster)\b/gi, '')
      .trim();
  }

  const teamMatch = remainder.match(
    /\bteam\s+([^,]+?)(?=\s+agreement|\s+group|\s+geo|\s+team\s|$)/i
  );
  if (teamMatch) {
    team = teamMatch[1].trim();
    remainder = remainder.replace(teamMatch[0], '').trim();
  }

  const geoMatch = remainder.match(/\bgeo(?:s)?\s+([A-Za-z]{2}(?:\s+[A-Za-z]{2})*)/i);
  if (geoMatch) {
    const codes = geoMatch[1]
      .toUpperCase()
      .split(/\s+/)
      .filter((c) => GEO_CODES.has(c) || c.length === 2);
    geos.push(...codes);
    remainder = remainder.replace(geoMatch[0], '').trim();
  }

  const quoted =
    remainder.match(/(?:called|named|")([^"]+)(?:"|$)/i) ||
    remainder.match(/(?:called|named)\s+([^,.]+)/i);
  let name = quoted ? quoted[1].trim() : remainder.replace(/\s+/g, ' ').trim();
  if (name) name = name.replace(/\b(?:with|and)\s*$/i, '').trim();
  return { name: name || '', group, team, agreement, geos };
}

function extractName(text, trigger) {
  const parsed = parseCreatePartnerCriteria(text);
  if (parsed.name) return parsed.name;
  const quoted =
    text.match(/(?:called|named|")([^"]+)(?:"|$)/i) || text.match(/(?:called|named)\s+([^.?!,]+)/i);
  if (quoted) return quoted[1].trim();
  const after = text
    .replace(trigger, '')
    .replace(/^(?:\s+(?:called|named))?\s*/i, '')
    .trim();
  const end = after.search(/\s+and\s+|\s+then\s+|\.|$/i);
  const name = (end > 0 ? after.slice(0, end) : after).trim();
  return name.length > 0 ? name : null;
}

function extractGenericName(text, trigger) {
  const after = text
    .replace(trigger, '')
    .replace(/^(?:\s+(?:called|named|for|to))?\s*/i, '')
    .trim();
  if (!after) return null;
  const end = after.search(/\s+and\s+|\s+then\s+|\.|$/i);
  const name = (end > 0 ? after.slice(0, end) : after).trim();
  return name.length > 0 ? name : null;
}

function extractPartnerHint(text) {
  if (!text || typeof text !== 'string') return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const sanitizeHint = (value) => {
    const candidate = String(value || '')
      .replace(/\b(?:meeting|meetings|recording|recordings|call|session)\b/gi, '')
      .trim();
    if (!candidate) return '';
    // Ignore temporal phrases often used in scheduling commands.
    if (
      /^(?:next|tomorrow|today|this|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
        candidate
      )
    ) {
      return '';
    }
    return candidate;
  };
  const fromWithOrFor = cleaned.match(/\b(?:with|for|of)\s+([^.?!,;]+)/i);
  if (fromWithOrFor?.[1]) {
    return sanitizeHint(fromWithOrFor[1]);
  }
  const fromPartnerKeyword = cleaned.match(/\bpartner\s+([^.?!,;]+)/i);
  if (fromPartnerKeyword?.[1]) {
    return sanitizeHint(fromPartnerKeyword[1]);
  }
  return '';
}

// ─── Regex banks for natural phrasing ───────────────────────────────────────

const RE_CREATE_PROJECT =
  /\b(?:create|add|start|launch|build|set up|open|init)\s+(?:a\s+)?(?:new\s+)?project\b/i;
const RE_CREATE_PARTNER =
  /\b(?:create|add|register|set up|onboard)\s+(?:a\s+)?(?:new\s+)?partner\b/i;
const RE_CREATE_TASK = /\b(?:create|add|set|make|assign)\s+(?:a\s+)?(?:new\s+)?task\b/i;
const RE_CREATE_WORKFLOW =
  /\b(?:create|add|build|set up|design|make)\s+(?:a\s+)?(?:new\s+)?workflow\b/i;
const RE_ASSIGN_PARTNER =
  /\b(?:assign|attach|link|connect|add)\s+(?:(?:a\s+)?partner\s+)?(.+?)\s+(?:to|into|for)\s+(?:(?:the\s+)?project\s+)?(.+)/i;
const RE_LINK_WORKFLOW =
  /\b(?:link|attach|connect|assign|bind)\s+(?:(?:a\s+)?workflow\s+)?(.+?)\s+(?:to|into|for|with)\s+(?:(?:the\s+)?project\s+)?(.+)/i;
const RE_SHOW_SUMMARY =
  /\b(?:show|give|display|get)\s+(?:me\s+)?(?:a\s+)?(?:summary|overview|status|report|stats|statistics|numbers|metrics|data)\b/i;
const RE_LIST_ITEMS =
  /\b(?:list|show|display|get)\s+(?:me\s+)?(?:all\s+)?(?:my\s+)?(partners?|projects?|tasks?|workflows?|meetings?)\b/i;
const RE_HOW_MANY =
  /\b(?:how many|count|total)\s+(partners?|projects?|tasks?|workflows?|meetings?)\b/i;
const RE_UPDATE_ITEM =
  /\b(?:update|change|modify|edit|rename)\s+(?:the\s+)?(?:partner|project|task|workflow)\b/i;
const RE_DELETE_ITEM =
  /\b(?:delete|remove|archive|discard)\s+(?:the\s+)?(?:partner|project|task|workflow)\b/i;
const RE_STATUS_QUERY =
  /\b(?:what(?:'s| is)\s+the\s+status|where (?:are|is)|progress|how (?:is|are))\b/i;
const RE_CONFIRM_YES =
  /^(?:yes|yeah|yep|sure|ok|okay|do it|go ahead|confirm|approved?|execute|proceed|absolutely|definitely|let's go|let's do it|please do)$/i;
const RE_CONFIRM_NO = /^(?:no|nope|cancel|stop|never mind|don't|abort|skip|forget it|not now)$/i;
const RE_SCHEDULE = /\b(?:schedule|plan|book|set up)\s+(?:a\s+)?(?:meeting|call|session)\b/i;
const RE_OPEN_PARTNER_MEETINGS =
  /\b(?:open|show|view|go to|list)\s+(?:the\s+)?(?:meeting|meetings|recordings)\b/i;
const RE_RECORD_MEETING =
  /\b(?:record|start\s+recording|start)\s+(?:a\s+)?(?:meeting|call|session)\b/i;
const RE_UPLOAD_MEETING = /\b(?:upload|import)\s+(?:a\s+)?(?:meeting|recording|audio|video)\b/i;
const RE_DEADLINE = /\b(?:set|change|move)\s+(?:the\s+)?(?:deadline|due date)\b/i;
const RE_GENERATE_REPORT =
  /\b(?:build|generate|show|create|make|run|open|give me)\s+(?:me\s+)?(?:a\s+)?(?:the\s+)?(?:[\w\s]*?)(?:report|summary)\b/i;
const RE_CONSILIUM =
  /\b(?:talk to|ask|consult|discuss with|what does)\s+(?:the\s+)?(?:consilium|board|council|ai board)\b|\b(?:board discussion|consilium)\b/i;
const RE_PREDICT =
  /\b(?:predict|forecast|what (?:will|might)|churn risk|revenue forecast|deadline risk|bottleneck prediction|who (?:will|might) (?:churn|leave))\b/i;

/**
 * Parse transcript into list of actionable items.
 * @param {string} transcript - Raw speech-to-text string
 * @returns {Array<{ id: string, type: string, label: string, ... }>}
 */
export function parseVoiceCommands(transcript) {
  if (!transcript || typeof transcript !== 'string') return [];
  const text = transcript.trim();
  if (!text.length) return [];

  const actions = [];
  let idSeq = 0;
  const nextId = () => `vc-${Date.now()}-${++idSeq}`;

  // ── Confirmation / follow-up ──────────────────────────────────────────────
  if (RE_CONFIRM_YES.test(text)) {
    actions.push({
      id: nextId(),
      type: 'confirm_yes',
      label: 'User confirmed: proceed with pending action',
    });
    return actions;
  }
  if (RE_CONFIRM_NO.test(text)) {
    actions.push({ id: nextId(), type: 'confirm_no', label: 'User cancelled pending action' });
    return actions;
  }

  // ── AI operator cycle ─────────────────────────────────────────────────────
  if (
    /\b(?:ask anything|ai operator|system operator|system check|health check|optimi[sz]e (?:the )?(?:system|platform)|cross[- ]module|structural integrity|autonomous mode|run (?:a )?(?:full )?(?:system )?check)\b/i.test(
      text
    )
  ) {
    actions.push({
      id: nextId(),
      type: 'ai_operator_cycle',
      autoFix: /\b(?:fix|repair|resolve|auto(?:\s|-)?fix|implement)\b/i.test(text),
      label: 'Run AI operator cycle (mapping, health checks, safe repairs, task automation)',
    });
  }

  // Split by sentence boundaries but preserve context across "and"/"then"
  const segments = text
    .split(/(?<=[.!?])\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const rawSegment of segments) {
    // Further split by "and then" / ", then" but NOT "and" inside names
    const subSegments = rawSegment
      .split(/\s+(?:and then|then)\s+|,\s*(?:then|also|plus)\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const t of subSegments) {
      const lowerT = t.toLowerCase();

      // ── Notification queries ────────────────────────────────────────────
      if (/\bshow me what's losing money\b|\bshow (?:revenue|profit) loss/i.test(t)) {
        actions.push({
          id: nextId(),
          type: 'notification_status_query',
          query: 'revenue_loss',
          requiresConfirmation: false,
          label: "Show what's losing money",
        });
      }
      if (
        /\bwhat needs my attention\b|\bpriori(?:ty|tized) (?:notification|alert)s?\b|\bshow (?:high |urgent )?(?:priority )?alerts?\b|\bwhat's urgent\b/i.test(
          t
        )
      ) {
        actions.push({
          id: nextId(),
          type: 'notification_status_query',
          query: 'priority',
          requiresConfirmation: false,
          label: 'Show prioritized alerts',
        });
      }
      if (/\bhow are partners? performing\b|\bpartner performance\b|\bpartner health\b/i.test(t)) {
        actions.push({
          id: nextId(),
          type: 'notification_status_query',
          query: 'partner_performance',
          requiresConfirmation: false,
          label: 'Partner performance status',
        });
      }
      if (/\bare we hitting\b.*\btargets?\b|\bkpi status\b|\bgap analysis\b|\bkpi\b/i.test(t)) {
        actions.push({
          id: nextId(),
          type: 'notification_status_query',
          query: 'kpi_targets',
          requiresConfirmation: false,
          label: 'KPI target status',
        });
      }

      // ── Analysis ────────────────────────────────────────────────────────
      if (
        /\bwhy is\b.+\bunderperforming\b|\bexplain notification\b|\bshow impact if i do nothing\b|\broot cause\b|\banalyze?\b.*\b(?:issue|problem|alert)\b/i.test(
          t
        )
      ) {
        actions.push({
          id: nextId(),
          type: 'notification_analysis',
          target: t,
          requiresConfirmation: false,
          label: 'Run root-cause analysis',
        });
      }

      // ── Fix actions ─────────────────────────────────────────────────────
      if (/\bfix all (?:safe )?issues?\b|\bfix everything\b|\bresolve all\b/i.test(t)) {
        actions.push({
          id: nextId(),
          type: 'notification_fix_all_safe',
          requiresConfirmation: true,
          riskLevel: 'medium',
          label: 'Fix all safe issues',
        });
      }
      if (/\bfix workflow\s+(.+)/i.test(t)) {
        const wfId = t.match(/\bfix workflow\s+(.+)/i)?.[1]?.trim() || '';
        actions.push({
          id: nextId(),
          type: 'notification_execute',
          actionType: 'workflow_optimization',
          entity: wfId || lowerT,
          requiresConfirmation: true,
          riskLevel: 'medium',
          label: `Fix workflow ${wfId}`.trim(),
        });
      }
      if (/\breallocate traffic\b/i.test(t)) {
        actions.push({
          id: nextId(),
          type: 'notification_execute',
          actionType: 'traffic_rebalancing',
          entity: t,
          requiresConfirmation: true,
          riskLevel: 'medium',
          label: 'Reallocate traffic',
        });
      }
      if (/\breassign task\s+(.+?)\s+to\s+(.+)/i.test(t)) {
        const m = t.match(/\breassign task\s+(.+?)\s+to\s+(.+)/i);
        actions.push({
          id: nextId(),
          type: 'notification_execute',
          actionType: 'task_reassignment',
          taskId: m?.[1] || '',
          assignee: (m?.[2] || '').trim(),
          entity: m?.[1] || '',
          requiresConfirmation: true,
          riskLevel: 'low',
          label: `Reassign task ${m?.[1] || ''} to ${(m?.[2] || '').trim()}`.trim(),
        });
      }

      // ── Create project ──────────────────────────────────────────────────
      if (RE_CREATE_PROJECT.test(t)) {
        const projectName = extractName(t, RE_CREATE_PROJECT) || 'AI Project';
        const workflowHintMatch =
          t.match(/\b(?:with|attach(?:ed)?|using)\s+(?:a\s+)?([^,.]+?)\s+workflow\b/i) ||
          t.match(/\bworkflow\s+(?:called|named)?\s*([^,.]+)\b/i);
        const workflowHint = workflowHintMatch ? workflowHintMatch[1].trim() : '';
        actions.push({
          id: nextId(),
          type: 'create_project',
          name: projectName,
          workflowHint: workflowHint || undefined,
          requiresConfirmation: false,
          label: workflowHint
            ? `Create project "${projectName}" with workflow "${workflowHint}"`
            : `Create project "${projectName}"`,
        });
      }

      // ── Create workflow ─────────────────────────────────────────────────
      if (RE_CREATE_WORKFLOW.test(t) && !RE_CREATE_PROJECT.test(t)) {
        const wfName = extractGenericName(t, RE_CREATE_WORKFLOW) || 'New Workflow';
        actions.push({
          id: nextId(),
          type: 'create_workflow',
          name: wfName,
          requiresConfirmation: false,
          label: `Create workflow "${wfName}"`,
        });
      }

      // ── Assign partner to project ───────────────────────────────────────
      if (RE_ASSIGN_PARTNER.test(t) && !/\btask\b/i.test(t) && !/\bworkflow\b/i.test(t)) {
        const m = t.match(RE_ASSIGN_PARTNER);
        actions.push({
          id: nextId(),
          type: 'assign_partner_to_project',
          partnerHint: (m?.[1] || '').trim(),
          projectHint: (m?.[2] || '').trim(),
          requiresConfirmation: false,
          label: `Assign partner "${(m?.[1] || '').trim()}" to project "${(m?.[2] || '').trim()}"`,
        });
      }

      // ── Link workflow to project ────────────────────────────────────────
      if (RE_LINK_WORKFLOW.test(t)) {
        const m = t.match(RE_LINK_WORKFLOW);
        actions.push({
          id: nextId(),
          type: 'link_workflow_to_project',
          workflowHint: (m?.[1] || '').trim(),
          projectHint: (m?.[2] || '').trim(),
          requiresConfirmation: false,
          label: `Link workflow "${(m?.[1] || '').trim()}" to project "${(m?.[2] || '').trim()}"`,
        });
      }

      // ── Optimize routing ────────────────────────────────────────────────
      if (
        /\boptimi[sz]e\s+(?:partner\s+)?routing\b|\breroute\s+traffic\b|\brebalance\s+traffic\b/i.test(
          t
        )
      ) {
        actions.push({
          id: nextId(),
          type: 'optimize_partner_routing',
          requiresConfirmation: true,
          riskLevel: 'high',
          label: 'Optimize partner routing',
        });
      }

      // ── Bottlenecks ─────────────────────────────────────────────────────
      if (
        /\b(?:show|find|detect|where are)\s+(?:the\s+)?(?:performance\s+)?bottlenecks?\b/i.test(t)
      ) {
        actions.push({
          id: nextId(),
          type: 'show_bottlenecks',
          requiresConfirmation: false,
          label: 'Show performance bottlenecks',
        });
      }

      // ── Fix broken workflows ────────────────────────────────────────────
      if (
        /\bfix\s+(?:the\s+)?broken\s+workflows?\b|\brepair\s+(?:the\s+)?workflows?\b|\bresolve\s+workflow\s+issues?\b/i.test(
          t
        )
      ) {
        actions.push({
          id: nextId(),
          type: 'fix_broken_workflows',
          requiresConfirmation: true,
          riskLevel: 'high',
          label: 'Fix broken workflows',
        });
      }

      // ── Continuous optimization toggle ──────────────────────────────────
      if (
        /\b(?:enable|start|turn on|activate)\s+(?:continuous|autonomous)\s+optimi[sz]ation\b/i.test(
          t
        )
      ) {
        actions.push({
          id: nextId(),
          type: 'toggle_continuous_optimization',
          enabled: true,
          requiresConfirmation: false,
          label: 'Enable continuous optimization',
        });
      } else if (
        /\b(?:disable|stop|turn off|deactivate)\s+(?:continuous|autonomous)\s+optimi[sz]ation\b/i.test(
          t
        )
      ) {
        actions.push({
          id: nextId(),
          type: 'toggle_continuous_optimization',
          enabled: false,
          requiresConfirmation: false,
          label: 'Disable continuous optimization',
        });
      }

      // ── AI mode switch ──────────────────────────────────────────────────
      if (/\btraffic\s+(?:optimi[sz]ation\s+)?mode\b/i.test(t)) {
        actions.push({
          id: nextId(),
          type: 'switch_ai_mode',
          mode: AI_OPERATOR_MODES.traffic,
          requiresConfirmation: false,
          label: `Switch to ${AI_OPERATOR_MODES.traffic}`,
        });
      } else if (/\bpartner\s+(?:strategy\s+)?mode\b/i.test(t)) {
        actions.push({
          id: nextId(),
          type: 'switch_ai_mode',
          mode: AI_OPERATOR_MODES.partner,
          requiresConfirmation: false,
          label: `Switch to ${AI_OPERATOR_MODES.partner}`,
        });
      } else if (/\bproject\s+(?:management\s+)?mode\b/i.test(t)) {
        actions.push({
          id: nextId(),
          type: 'switch_ai_mode',
          mode: AI_OPERATOR_MODES.project,
          requiresConfirmation: false,
          label: `Switch to ${AI_OPERATOR_MODES.project}`,
        });
      } else if (/\binfrastructure\s+(?:integrity\s+)?mode\b/i.test(t)) {
        actions.push({
          id: nextId(),
          type: 'switch_ai_mode',
          mode: AI_OPERATOR_MODES.infrastructure,
          requiresConfirmation: false,
          label: `Switch to ${AI_OPERATOR_MODES.infrastructure}`,
        });
      } else if (/\bexecutive\s+(?:insight\s+)?mode\b/i.test(t)) {
        actions.push({
          id: nextId(),
          type: 'switch_ai_mode',
          mode: AI_OPERATOR_MODES.executive,
          requiresConfirmation: false,
          label: `Switch to ${AI_OPERATOR_MODES.executive}`,
        });
      }

      // ── Meetings: open / record / upload ────────────────────────────────
      if (RE_OPEN_PARTNER_MEETINGS.test(t)) {
        const partnerHint = extractPartnerHint(t);
        actions.push({
          id: nextId(),
          type: 'open_partner_meetings',
          partnerHint: partnerHint || undefined,
          requiresConfirmation: false,
          label: partnerHint ? `Open meetings for "${partnerHint}"` : 'Open partner meetings',
        });
      }
      if (RE_RECORD_MEETING.test(t)) {
        const partnerHint = extractPartnerHint(t);
        actions.push({
          id: nextId(),
          type: 'record_meeting_for_partner',
          partnerHint: partnerHint || undefined,
          requiresConfirmation: false,
          label: partnerHint
            ? `Start meeting recording for "${partnerHint}"`
            : 'Start meeting recording',
        });
      }
      if (RE_UPLOAD_MEETING.test(t)) {
        const partnerHint = extractPartnerHint(t);
        actions.push({
          id: nextId(),
          type: 'upload_meeting_for_partner',
          partnerHint: partnerHint || undefined,
          requiresConfirmation: false,
          label: partnerHint ? `Upload meeting for "${partnerHint}"` : 'Upload meeting recording',
        });
      }

      // ── Navigation ──────────────────────────────────────────────────────
      for (const { patterns, path, label } of NAV_MAP) {
        if (patterns.some((p) => p.test(t))) {
          actions.push({ id: nextId(), type: 'navigate', path, label: `Navigate to ${label}` });
          break;
        }
      }

      // ── Create partner ──────────────────────────────────────────────────
      if (RE_CREATE_PARTNER.test(t)) {
        const criteria = parseCreatePartnerCriteria(t);
        const name = (criteria.name || '').trim();
        const parts = [];
        if (name) parts.push(`"${name}"`);
        if (criteria.group) parts.push(`group ${criteria.group}`);
        if (criteria.team) parts.push(`team ${criteria.team}`);
        if (criteria.agreement) parts.push(`agreement ${criteria.agreement}`);
        if (criteria.geos.length) parts.push(`geo ${criteria.geos.join(', ')}`);
        actions.push({
          id: nextId(),
          type: 'create_partner',
          name,
          group: criteria.group || undefined,
          team: criteria.team || undefined,
          agreement: criteria.agreement || undefined,
          geos: criteria.geos.length ? criteria.geos : undefined,
          label:
            parts.length > 0
              ? `Create partner: ${parts.join(', ')}`
              : 'Create new partner (name required)',
        });
      }

      // ── Create task ─────────────────────────────────────────────────────
      if (RE_CREATE_TASK.test(t)) {
        const after = t
          .replace(RE_CREATE_TASK, '')
          .replace(/^(?:\s+(?:called|named|for|to))?\s*/i, '')
          .trim();
        const description = after || 'New task';
        const title = description.length > 50 ? description.slice(0, 47) + '...' : description;
        actions.push({
          id: nextId(),
          type: 'create_task',
          title: title.charAt(0).toUpperCase() + title.slice(1),
          description,
          label: `Create task: ${description.slice(0, 50)}${description.length > 50 ? '...' : ''}`,
        });
      }

      // ── Show summary / overview ─────────────────────────────────────────
      if (RE_SHOW_SUMMARY.test(t)) {
        actions.push({
          id: nextId(),
          type: 'show_summary',
          target: t,
          requiresConfirmation: false,
          label: 'Show platform summary',
        });
      }

      // ── List items ──────────────────────────────────────────────────────
      if (RE_LIST_ITEMS.test(t)) {
        const entity = (t.match(RE_LIST_ITEMS)?.[1] || '').toLowerCase().replace(/s$/, '');
        const pathMap = {
          partner: '/partners',
          project: '/projects',
          task: '/task-manager',
          workflow: '/workflow',
          meeting: '/partners',
        };
        const targetPath = pathMap[entity] || '/dashboard';
        actions.push({
          id: nextId(),
          type: 'navigate',
          path: targetPath,
          label: `Show ${entity}s`,
        });
      }

      // ── How many ────────────────────────────────────────────────────────
      if (RE_HOW_MANY.test(t)) {
        const entity = (t.match(RE_HOW_MANY)?.[1] || '').toLowerCase().replace(/s$/, '');
        actions.push({
          id: nextId(),
          type: 'count_entities',
          entity,
          requiresConfirmation: false,
          label: `Count ${entity}s`,
        });
      }

      // ── Update / edit ───────────────────────────────────────────────────
      if (RE_UPDATE_ITEM.test(t)) {
        actions.push({
          id: nextId(),
          type: 'update_entity',
          target: t,
          requiresConfirmation: false,
          label: `Update: ${t.slice(0, 60)}`,
        });
      }

      // ── Delete / archive ────────────────────────────────────────────────
      if (RE_DELETE_ITEM.test(t)) {
        actions.push({
          id: nextId(),
          type: 'delete_entity',
          target: t,
          requiresConfirmation: true,
          riskLevel: 'high',
          label: `Delete/archive: ${t.slice(0, 60)}`,
        });
      }

      // ── Status query ────────────────────────────────────────────────────
      if (RE_STATUS_QUERY.test(t) && !RE_SHOW_SUMMARY.test(t)) {
        actions.push({
          id: nextId(),
          type: 'status_query',
          target: t,
          requiresConfirmation: false,
          label: `Status: ${t.slice(0, 60)}`,
        });
      }

      // ── Schedule ────────────────────────────────────────────────────────
      if (RE_SCHEDULE.test(t)) {
        const meetingName = extractGenericName(t, RE_SCHEDULE) || 'Meeting';
        const partnerHint = extractPartnerHint(t);
        actions.push({
          id: nextId(),
          type: 'schedule_meeting',
          name: meetingName,
          partnerHint: partnerHint || undefined,
          requiresConfirmation: false,
          label: partnerHint
            ? `Schedule "${meetingName}" with "${partnerHint}"`
            : `Schedule: ${meetingName}`,
        });
      }

      // ── Deadline ────────────────────────────────────────────────────────
      if (RE_DEADLINE.test(t)) {
        actions.push({
          id: nextId(),
          type: 'set_deadline',
          target: t,
          requiresConfirmation: false,
          label: `Set deadline: ${t.slice(0, 60)}`,
        });
      }

      // ── Generate report (universal report builder) ────────────────────
      if (
        RE_GENERATE_REPORT.test(t) &&
        !RE_SHOW_SUMMARY.test(t) &&
        !/\b(?:export|download)\b/i.test(t)
      ) {
        const matchedTemplate = matchTemplateByKeywords(t);
        const tplId = matchedTemplate?.id || 'tpl-finance-growth';
        const tplName = matchedTemplate?.name || 'Finance & Growth';
        const extractedFilters = {};
        const periodMatch2 = t.match(/\b(?:for|in|of)\s+(\w+\s*\d{0,4})\b/i);
        if (periodMatch2) extractedFilters.period = periodMatch2[1].trim();
        const geoMatch2 = t.match(/\b(?:for|in)\s+([A-Z]{2})\b/);
        if (geoMatch2) extractedFilters.geo = geoMatch2[1];
        const teamMatch2 = t.match(/\bteam\s+([\w\s]+?)(?:\s+report|\s+for|$)/i);
        if (teamMatch2) extractedFilters.team = teamMatch2[1].trim();
        const filterDesc = Object.entries(extractedFilters)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        actions.push({
          id: nextId(),
          type: 'generate_report',
          templateId: tplId,
          templateName: tplName,
          filters: extractedFilters,
          requiresConfirmation: false,
          label: filterDesc
            ? `Generate ${tplName} report (${filterDesc})`
            : `Generate ${tplName} report`,
        });
      }

      // ── Export report ───────────────────────────────────────────────────
      if (/\b(?:export|download)\s+(?:the\s+)?(?:monthly\s+)?report\b/i.test(t)) {
        actions.push({ id: nextId(), type: 'export_report', label: 'Export report' });
      }

      // ── Consilium / Board discussion ──────────────────────────────────
      if (RE_CONSILIUM.test(t)) {
        const topicMatch = t.match(/\b(?:about|regarding|on|discuss)\s+(.+)/i);
        const topic = topicMatch ? topicMatch[1].replace(/[.?!]+$/, '').trim() : t;
        actions.push({
          id: nextId(),
          type: 'consilium_discuss',
          topic,
          requiresConfirmation: false,
          label: `Board discussion: "${topic.slice(0, 50)}"`,
        });
      }

      // ── Predictive analysis ───────────────────────────────────────────
      if (RE_PREDICT.test(t)) {
        let scope = 'all';
        if (/\bpartner|churn\b/i.test(t)) scope = 'partners';
        else if (/\bproject|deadline\b/i.test(t)) scope = 'projects';
        else if (/\bworkflow|bottleneck\b/i.test(t)) scope = 'workflows';
        else if (/\brevenue|forecast\b/i.test(t)) scope = 'revenue';
        actions.push({
          id: nextId(),
          type: 'predict',
          scope,
          context: t,
          requiresConfirmation: false,
          label: `Predict: ${scope} analysis`,
        });
      }
    }
  }

  // Info questions
  const infoTopics = matchInfoTopics(text);
  if (infoTopics.length > 0) {
    infoTopics.forEach((topic) => {
      const label =
        topic === INFO_TOPICS.formulas
          ? 'Explain key formulas'
          : topic === INFO_TOPICS.reports
            ? 'About reports'
            : topic === INFO_TOPICS.dashboard
              ? 'About Dashboard metrics'
              : `About ${topic.toUpperCase()}`;
      actions.push({ id: nextId(), type: 'info', topic, label: `Info: ${label}` });
    });
  }

  // Dedupe
  const seen = new Set();
  return actions.filter((a) => {
    const key =
      a.type === 'info'
        ? `info:${a.topic}`
        : a.type === 'navigate'
          ? a.path
          : a.type === 'create_partner'
            ? `partner:${a.name}:${a.group}:${a.agreement}`
            : a.type === 'create_task'
              ? `task:${a.description || a.title}`
              : a.type === 'create_project'
                ? `project:${a.name}:${a.workflowHint || ''}`
                : a.type === 'create_workflow'
                  ? `workflow:${a.name}`
                  : a.type === 'switch_ai_mode'
                    ? `mode:${a.mode}`
                    : a.type === 'toggle_continuous_optimization'
                      ? `contopt:${a.enabled ? 'on' : 'off'}`
                      : a.type === 'generate_report'
                        ? `report:${a.templateId}`
                        : `${a.type}:${a.label || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export { parseCreatePartnerCriteria };
