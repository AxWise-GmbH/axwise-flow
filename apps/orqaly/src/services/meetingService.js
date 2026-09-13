/**
 * Meeting Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages meeting recordings, transcription pipeline, and AI structuring.
 * Uses localStorage for persistence (swap to real API by replacing this file).
 *
 * Production Architecture:
 *   Backend:   NestJS / FastAPI endpoints → POST /meetings, GET /meetings/:id, etc.
 *   Queue:     BullMQ / SQS for async transcription jobs
 *   Storage:   S3-compatible (recordings encrypted at rest)
 *   AI:        OpenAI Whisper (transcription) + GPT-4 (structuring)
 *   DB:        PostgreSQL with indexes on user_id, datetime
 *
 * Database Schema (PostgreSQL):
 *   CREATE TABLE meetings (
 *     id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     user_id         VARCHAR(50) NOT NULL REFERENCES users(id),
 *     partner_id      VARCHAR(50) REFERENCES partners(id),
 *     title           VARCHAR(255),
 *     organizer       VARCHAR(255),
 *     participants    JSONB DEFAULT '[]',
 *     datetime        TIMESTAMPTZ NOT NULL,
 *     duration_seconds INTEGER DEFAULT 0,
 *     channel         VARCHAR(50),
 *     recording_url   TEXT,
 *     recording_blob_key TEXT,
 *     transcript_raw  TEXT,
 *     transcript_timestamped JSONB,
 *     transcript_structured JSONB,
 *     status          VARCHAR(20) DEFAULT 'pending',
 *     consent_log     JSONB,
 *     created_at      TIMESTAMPTZ DEFAULT NOW(),
 *     updated_at      TIMESTAMPTZ DEFAULT NOW()
 *   );
 *   CREATE INDEX idx_meetings_user_id ON meetings(user_id);
 *   CREATE INDEX idx_meetings_partner_id ON meetings(partner_id);
 *   CREATE INDEX idx_meetings_datetime ON meetings(datetime DESC);
 *   CREATE INDEX idx_meetings_status ON meetings(status);
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as meetingBackend from './meetingBackend';
import { supabase, hasSupabase } from '../lib/supabase';
import { maybeNotify } from './emailNotificationDispatcher';
import { edgeFunctionUrl, getAuthHeaders } from '../lib/supabaseEdge.js';

const STORAGE_KEY = 'orch_meetings_v1';
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const clone = (v) => JSON.parse(JSON.stringify(v));

// ─── Channel Options ────────────────────────────────────────────────────────
export const MEETING_CHANNELS = [
  'Google Meet',
  'Zoom',
  'Telegram',
  'Microsoft Teams',
  'Phone Call',
  'In Person',
  'Other',
];

// ─── Status Flow ────────────────────────────────────────────────────────────
export const MEETING_STATUSES = {
  planned: 'planned',
  recording: 'recording',
  uploading: 'uploading',
  transcribing: 'transcribing',
  structuring: 'structuring',
  completed: 'completed',
  failed: 'failed',
};

export const MEETING_STATUS_LABELS = {
  planned: 'Planned',
  recording: 'Recording…',
  uploading: 'Uploading…',
  transcribing: 'Transcribing…',
  structuring: 'AI Processing…',
  completed: 'Completed',
  failed: 'Failed',
};

export const MEETING_STATUS_COLORS = {
  planned: '#0EA5E9',
  recording: '#EF4444',
  uploading: '#F59E0B',
  transcribing: '#3B82F6',
  structuring: '#8B5CF6',
  completed: '#10B981',
  failed: '#EF4444',
};

// ─── LLM Prompt Template (production use) ───────────────────────────────────
export const TRANSCRIPT_STRUCTURING_PROMPT = `You are an expert meeting analyst. Analyze the following meeting transcript and extract structured metadata.

Return a JSON object with these fields:
{
  "participants": ["list of mentioned participants"],
  "organizer": "person who organized or led the meeting",
  "datetime": "ISO date/time if mentioned",
  "duration_minutes": estimated_duration_number,
  "channel": "communication channel if mentioned",
  "topics": ["key topics discussed"],
  "decisions": ["decisions made during the meeting"],
  "action_items": [
    { "task": "description", "assignee": "person", "deadline": "date if mentioned" }
  ],
  "agreements": ["agreements reached"],
  "tags": ["relevant category tags"],
  "summary": "2-3 sentence executive summary"
}

Be precise, extract only what is explicitly stated or strongly implied. If something is not mentioned, use an empty array or null.

TRANSCRIPT:
---
{TRANSCRIPT}
---`;

// ─── Mock Transcription Templates ───────────────────────────────────────────
const MOCK_TRANSCRIPTS = [
  {
    raw: `[00:00] Alex: Alright, let's kick off. Today we need to discuss the Q1 campaign performance and next steps.
[00:15] Sarah: Sure. Looking at the numbers, our Facebook campaigns hit 450 FTDs this month, up 12% from December.
[00:32] Alex: Great progress. What about the Google Ads side?
[00:38] Sarah: Google is underperforming — only 120 FTDs with a 1.8% CR. I think we need to revisit the landing pages.
[00:52] Mike: I agree. I've been testing new creatives and the A/B tests show variant B converts 30% better.
[01:05] Alex: Let's go with variant B across all Google campaigns then. Mike, can you roll that out by end of week?
[01:15] Mike: Absolutely. I'll also set up new tracking for the TikTok pilot.
[01:25] Sarah: One more thing — the partner requested a higher cap for the Casino offers. Compliance has approved it.
[01:38] Alex: Perfect. Let's raise the cap to 500 and monitor for a week. If quality holds, we can push to 750.
[01:50] Alex: Any other items? No? Great. Let's reconvene next Wednesday.`,
    structured: {
      participants: ['Alex', 'Sarah', 'Mike'],
      organizer: 'Alex',
      topics: [
        'Q1 campaign performance review',
        'Facebook campaign results — 450 FTDs (+12% MoM)',
        'Google Ads underperformance — 120 FTDs, 1.8% CR',
        'Landing page optimization',
        'A/B test results — Variant B +30% conversion',
        'TikTok pilot tracking setup',
        'Casino offer cap increase',
      ],
      decisions: [
        'Adopt variant B creatives for all Google campaigns',
        'Raise Casino offer cap to 500 (with potential increase to 750)',
        'Set up new tracking for TikTok pilot',
      ],
      action_items: [
        {
          task: 'Roll out variant B creatives across Google campaigns',
          assignee: 'Mike',
          deadline: 'End of week',
        },
        { task: 'Set up TikTok pilot tracking', assignee: 'Mike', deadline: null },
        { task: 'Monitor Casino offer quality at 500 cap', assignee: 'Sarah', deadline: '1 week' },
      ],
      agreements: [
        'Variant B is the winning creative for Google',
        'Casino cap raised to 500 pending quality review',
      ],
      tags: [
        'Campaign Performance',
        'Google Ads',
        'Facebook',
        'TikTok',
        'Compliance',
        'A/B Testing',
      ],
      summary:
        'The team reviewed Q1 campaign performance, with Facebook showing strong growth at 450 FTDs (+12%). Google Ads needs improvement, so variant B creatives will be rolled out. Casino offer cap increased to 500 with quality monitoring.',
    },
  },
  {
    raw: `[00:00] Jack: Hi everyone. Quick sync on the new partner onboarding.
[00:08] Lisa: We've got three new partners this week — all webmasters from Eastern Europe.
[00:18] Jack: What's their traffic profile?
[00:22] Lisa: Two are heavy on SEO organic, one does PPC on Google and Bing. Combined they could bring 200-300 FTDs monthly.
[00:35] Jack: Good. Have we set up their tracking?
[00:40] Dave: Working on it. Two partners are configured, the third needs a custom postback URL. Should be done tomorrow.
[00:55] Jack: Make sure we have proper consent forms signed before we go live.
[01:02] Lisa: Already collected from the first two. Waiting on the third.
[01:10] Jack: Alright. Let's plan the kickoff calls for next Monday. Lisa, can you coordinate with them?
[01:18] Lisa: Will do. I'll also prepare the welcome package with creatives and compliance docs.
[01:28] Jack: Perfect. Dave, any blockers on the technical side?
[01:34] Dave: Just the postback integration. Everything else is green.
[01:42] Jack: Great. Let's touch base on Friday for a status update.`,
    structured: {
      participants: ['Jack', 'Lisa', 'Dave'],
      organizer: 'Jack',
      topics: [
        'New partner onboarding — 3 Eastern European webmasters',
        'Traffic profiles — SEO organic and PPC (Google/Bing)',
        'Expected volume — 200-300 FTDs monthly',
        'Tracking setup progress',
        'Consent forms and compliance',
        'Kickoff call scheduling',
      ],
      decisions: [
        'Schedule kickoff calls for next Monday',
        'Prepare welcome package with creatives and compliance docs',
        'Status update meeting on Friday',
      ],
      action_items: [
        {
          task: 'Complete custom postback URL for third partner',
          assignee: 'Dave',
          deadline: 'Tomorrow',
        },
        { task: 'Coordinate kickoff calls with partners', assignee: 'Lisa', deadline: 'Monday' },
        { task: 'Prepare welcome package', assignee: 'Lisa', deadline: 'Before kickoff calls' },
        {
          task: 'Collect consent form from third partner',
          assignee: 'Lisa',
          deadline: 'Before go-live',
        },
      ],
      agreements: [
        'All consent forms must be signed before going live',
        'Friday status update meeting',
      ],
      tags: ['Onboarding', 'New Partners', 'Eastern Europe', 'Tracking', 'Compliance'],
      summary:
        'Quick sync on onboarding 3 new Eastern European webmasters with an estimated 200-300 FTDs/month. Tracking is nearly complete, kickoff calls planned for Monday. Consent forms still needed from one partner.',
    },
  },
  {
    raw: `[00:00] Manager: Let's review the financial reconciliation for January.
[00:10] Finance: Total revenue was $142,000. We've paid out $98,000 to partners. Outstanding debt is $12,500.
[00:25] Manager: Which partners have outstanding balances?
[00:30] Finance: Three partners — P-003 owes $5,200, P-007 owes $4,800, and P-012 owes $2,500.
[00:45] Manager: What's the reason for the delays?
[00:50] Finance: P-003 had a dispute on traffic quality that's now resolved. P-007 is waiting on wire transfer processing. P-012 is a new partner and their first payout is scheduled next week.
[01:08] Manager: OK. Let's prioritize P-003's payment since the dispute is resolved. And send a reminder to P-007's bank.
[01:20] Finance: Will do. Also, I noticed ROI dropped to 15% from 22% last month. Mainly due to increased spend on TikTok campaigns.
[01:35] Manager: That's concerning. Let's cap TikTok spend at current levels until we see better conversion data.
[01:45] Finance: Agreed. I'll update the budget allocation sheet.
[01:52] Manager: Good. Anything else?
[01:55] Finance: Just a reminder — tax documents are due by the 15th.
[02:00] Manager: Noted. Let's wrap up. Thanks everyone.`,
    structured: {
      participants: ['Manager', 'Finance Lead'],
      organizer: 'Manager',
      topics: [
        'January financial reconciliation',
        'Revenue: $142,000 | Payouts: $98,000 | Debt: $12,500',
        'Outstanding partner balances (P-003, P-007, P-012)',
        'ROI decline from 22% to 15%',
        'TikTok spend impact on ROI',
        'Tax document deadline',
      ],
      decisions: [
        'Prioritize P-003 payment (dispute resolved)',
        'Cap TikTok spend at current levels',
        'Send bank reminder for P-007',
      ],
      action_items: [
        { task: 'Process P-003 payment immediately', assignee: 'Finance Lead', deadline: 'ASAP' },
        {
          task: 'Send bank reminder for P-007 wire transfer',
          assignee: 'Finance Lead',
          deadline: 'Today',
        },
        {
          task: 'Update budget allocation — cap TikTok spend',
          assignee: 'Finance Lead',
          deadline: 'This week',
        },
        { task: 'Submit tax documents', assignee: 'Finance Lead', deadline: '15th' },
      ],
      agreements: ['TikTok spend frozen until conversion data improves', 'P-003 payment priority'],
      tags: ['Finance', 'Reconciliation', 'ROI', 'TikTok', 'Partner Payments', 'Tax'],
      summary:
        'January financial review showing $142K revenue with $12.5K outstanding. ROI dropped from 22% to 15% due to TikTok overspend. Decision to cap TikTok budget and prioritize outstanding partner payments.',
    },
  },
  {
    raw: `[00:00] Jack: Hi everyone. Let's go through what we need for the Germany campaigns.
[00:12] Lisa: Sure. We're asking partners for more traffic to Germany specifically.
[00:25] Jack: Exactly. And we need materials from them. Landing pages, links, creatives — everything.
[00:38] Dave: I've put together a checklist. We're requesting: landing page URLs, tracking links, and banner assets.
[00:52] Jack: Good. What about campaign specifics for Germany?
[01:00] Lisa: We're focusing on DACH region. Need their traffic sources and expected volume.
[01:12] Dave: I'll need the links in a spreadsheet by Friday.
[01:20] Jack: Perfect. So to recap: Germany campaigns, we need landing pages, links, and materials from each partner.`,
    structured: {
      participants: ['Jack', 'Lisa', 'Dave'],
      organizer: 'Jack',
      geographic_focus: ['Germany', 'DACH'],
      campaigns: ['Germany campaigns', 'DACH region traffic'],
      materials_requested: [
        'Landing pages',
        'Links',
        'Tracking links',
        'Banner assets',
        'Creatives',
      ],
      traffic_discussion: ['Traffic to Germany', 'Traffic sources', 'Expected volume'],
      topics: [
        'Germany campaigns',
        'Traffic to Germany',
        'Materials requested — landing pages, links, creatives',
        'DACH region focus',
        'Tracking links and banner assets',
      ],
      decisions: [
        'Request landing page URLs, tracking links, and banner assets from partners',
        'Links due in spreadsheet by Friday',
      ],
      action_items: [
        {
          task: 'Collect landing pages, links, and materials from partners',
          assignee: 'Lisa',
          deadline: 'Friday',
        },
        { task: 'Compile links in spreadsheet', assignee: 'Dave', deadline: 'Friday' },
      ],
      extracted_requests: [
        {
          title: 'Provide Germany landing pages and tracking links',
          description:
            'Partners were asked to provide landing page URLs, links, and creatives for Germany campaigns.',
          request_type: 'task',
          required_resources: ['Landing pages', 'Tracking links', 'Creatives', 'Banner assets'],
          context: 'Germany and DACH campaign launch prep.',
          owner: 'Lisa',
          priority: 'high',
        },
        {
          title: 'Build/adjust Germany campaign workflow',
          description:
            'Need a workflow that collects partner assets and tracks DACH traffic sources.',
          request_type: 'workflow',
          required_resources: ['Workflow template', 'Campaign settings', 'Partner source sheet'],
          context: 'To operationalize Germany campaign onboarding.',
          owner: 'Dave',
          priority: 'medium',
        },
      ],
      recommended_actions: [
        {
          action_type: 'create_task',
          title: 'Create task: collect Germany assets',
          description: 'Track partner delivery of landing pages, tracking links, and banners.',
          one_click: true,
          context: 'Germany campaign setup',
          payload: { task_title: 'Collect Germany assets from partners' },
        },
        {
          action_type: 'create_workflow',
          title: 'Create workflow: Germany campaign onboarding',
          description: 'Automate intake of links/materials and handoff to campaign launch.',
          one_click: true,
          context: 'DACH workflow setup',
          payload: {
            workflow_name: 'Germany Campaign Onboarding',
            traffic_sources: ['Google', 'FB', 'TikTok'],
          },
        },
        {
          action_type: 'grant_permission',
          title: 'Grant one-time permission for campaign edits',
          description: 'Temporary permission to update Germany campaign layout/settings.',
          one_click: true,
          context: 'Campaign launch',
          payload: { permission: 'campaign_edit', assignee: 'Dave' },
        },
      ],
      workflow_actions: [
        {
          mode: 'create',
          workflow_name: 'Germany Campaign Onboarding',
          description: 'Collect links/materials and move to launch-ready checklist.',
          project_context: 'Germany / DACH traffic expansion',
        },
      ],
      permission_actions: [
        {
          permission: 'campaign_edit',
          scope: 'Germany campaign configuration',
          reason: 'Need quick launch and layout adjustments',
          duration: 'one-time',
        },
      ],
      communication_mentions: {
        telegram: ['Follow up with partners in Telegram group for materials'],
        email: ['Send checklist by email with deadline Friday'],
      },
      partner_community_updates: [
        'Partner readiness for Germany campaigns depends on timely link/material delivery.',
        'Community vitality improves when onboarding turnaround is reduced.',
      ],
      tags: ['Germany', 'Campaigns', 'Traffic', 'Landing Pages', 'Materials', 'DACH'],
      summary:
        'Discussion of Germany-focused campaigns. Team requested materials from partners: landing pages, tracking links, and creatives. Focus on DACH region traffic with links due in a spreadsheet by Friday.',
    },
  },
];

const generateTimestampedTranscript = (rawText) => {
  const lines = rawText.split('\n').filter(Boolean);
  return lines.map((line) => {
    const match = line.match(/^\[(\d{2}:\d{2})\]\s*(\w+):\s*(.+)$/);
    if (match) {
      return { timestamp: match[1], speaker: match[2], text: match[3] };
    }
    return { timestamp: '00:00', speaker: 'Unknown', text: line };
  });
};

const normalizeStructuredOutput = (structured = {}) => {
  const safe = structured && typeof structured === 'object' ? structured : {};
  const normalized = {
    ...safe,
    dialogue_structured: Array.isArray(safe.dialogue_structured) ? safe.dialogue_structured : [],
    extracted_requests: Array.isArray(safe.extracted_requests) ? safe.extracted_requests : [],
    recommended_actions: Array.isArray(safe.recommended_actions) ? safe.recommended_actions : [],
    workflow_actions: Array.isArray(safe.workflow_actions) ? safe.workflow_actions : [],
    permission_actions: Array.isArray(safe.permission_actions) ? safe.permission_actions : [],
    communication_mentions: {
      telegram: Array.isArray(safe.communication_mentions?.telegram)
        ? safe.communication_mentions.telegram
        : [],
      email: Array.isArray(safe.communication_mentions?.email)
        ? safe.communication_mentions.email
        : [],
    },
    partner_community_updates: Array.isArray(safe.partner_community_updates)
      ? safe.partner_community_updates
      : [],
  };

  if (normalized.extracted_requests.length === 0 && Array.isArray(normalized.action_items)) {
    normalized.extracted_requests = normalized.action_items
      .map((item) => {
        const taskText = typeof item === 'string' ? item : item?.task || '';
        return {
          title: taskText || 'Meeting request',
          description: taskText || 'Request derived from action items.',
          request_type: 'task',
          required_resources: [],
          context: normalized.summary || '',
          owner: typeof item === 'object' ? item?.assignee || '' : '',
          priority: 'medium',
        };
      })
      .filter((r) => r.title);
  }

  if (normalized.recommended_actions.length === 0 && normalized.extracted_requests.length > 0) {
    normalized.recommended_actions = normalized.extracted_requests.map((req) => ({
      action_type: 'create_task',
      title: `Create task: ${req.title}`,
      description: req.description || 'Create task from extracted meeting request.',
      one_click: true,
      context: req.context || normalized.summary || '',
      payload: { task_title: req.title },
    }));
  }

  return normalized;
};

const buildAnalysisHistoryEntry = (structured, source = 'transcription') => {
  const normalized = normalizeStructuredOutput(structured);
  return {
    id: `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
    source,
    summary: normalized.summary || '',
    meeting_topic: normalized.meeting_topic || '',
    extracted_requests: normalized.extracted_requests || [],
    recommended_actions: normalized.recommended_actions || [],
    workflow_actions: normalized.workflow_actions || [],
    permission_actions: normalized.permission_actions || [],
    communication_mentions: normalized.communication_mentions || { telegram: [], email: [] },
    partner_community_updates: normalized.partner_community_updates || [],
  };
};

const appendAnalysisHistory = (meeting, structured, source = 'transcription') => {
  const existing = Array.isArray(meeting?.analysisLogHistory) ? meeting.analysisLogHistory : [];
  return [...existing, buildAnalysisHistoryEntry(structured, source)];
};

// ─── Real transcription (Supabase Edge Function) ─────────────────────────────

/** Convert recording to base64 and POST to Supabase Edge Function.
 * Accepts either a Blob/File (preferred) or a blob URL string (fallback). */
const callTranscribeApi = async (recordingInput, onStatusChange) => {
  const transcribeUrl = edgeFunctionUrl('transcribe');
  if (!transcribeUrl)
    return { error: 'Cannot reach transcription service. Supabase URL not configured.' };
  try {
    onStatusChange?.('uploading', 15);
    let blob = null;
    const isBlobLike = typeof Blob !== 'undefined' && recordingInput instanceof Blob;
    if (isBlobLike) {
      blob = recordingInput;
    } else if (typeof recordingInput === 'string') {
      const res = await fetch(recordingInput);
      if (!res.ok) return { error: 'Recording could not be read.' };
      blob = await res.blob();
    } else {
      return { error: 'Recording data is invalid.' };
    }

    if (!blob || !blob.size) return { error: 'Recording is empty.' };
    onStatusChange?.('transcribing', 30);
    const audioBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        resolve(typeof dataUrl === 'string' && dataUrl.includes(',') ? dataUrl.split(',')[1] : '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    if (!audioBase64) return { error: 'Recording is empty.' };

    onStatusChange?.('transcribing', 50);
    const headers = await getAuthHeaders();
    const apiRes = await fetch(transcribeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ audioBase64, mimeType: blob.type || 'audio/webm' }),
    });

    const errBody = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      const msg = errBody?.error || `Transcription failed (${apiRes.status})`;
      const detail = errBody?.detail;
      if (apiRes.status === 503) {
        return { error: 'Transcription not configured on server.', detail };
      }
      if (apiRes.status === 401) {
        return { error: 'Please sign in to use transcription.', detail };
      }
      return { error: msg, detail };
    }

    onStatusChange?.('structuring', 80);
    return {
      transcriptRaw: errBody.transcriptRaw ?? '',
      transcriptStructured: errBody.transcriptStructured ?? null,
    };
  } catch (e) {
    return { error: e?.message || 'Transcription service unavailable. Check your connection.' };
  }
};

// ─── Dummy Meeting Generator ────────────────────────────────────────────────
const generateDummyMeetings = (partnerId) => {
  const seed = String(partnerId)
    .split('')
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  const count = 2 + (seed % 3); // 2-4 meetings per partner
  const meetings = [];
  const channels = ['Google Meet', 'Zoom', 'Telegram', 'Phone Call'];
  const titles = [
    'Campaign Performance Review',
    'Partner Onboarding Kickoff',
    'Monthly Financial Sync',
    'Creative Strategy Session',
    'Traffic Quality Discussion',
    'Q1 Planning Meeting',
    'Technical Integration Call',
    'Compliance Review',
  ];

  for (let i = 0; i < count; i++) {
    const mockIdx = (seed + i) % MOCK_TRANSCRIPTS.length;
    const mock = MOCK_TRANSCRIPTS[mockIdx];
    const dayOffset = ((seed + i * 7) % 28) + 1;
    const month = (seed + i) % 2 === 0 ? 1 : 2;
    const year = 2026;
    const hour = 9 + ((seed + i * 3) % 9);
    const duration = 300 + ((seed + i * 11) % 3600); // 5 min to 1 hour

    const dt = new Date(year, month - 1, dayOffset > 28 ? 15 : dayOffset, hour, 0, 0);
    const timestamped = generateTimestampedTranscript(mock.raw);

    meetings.push({
      id: `MTG-${partnerId}-${String(i + 1).padStart(2, '0')}`,
      partnerId,
      title: titles[(seed + i) % titles.length],
      organizer: mock.structured.organizer,
      participants: mock.structured.participants,
      datetime: dt.toISOString(),
      durationSeconds: duration,
      channel: channels[(seed + i) % channels.length],
      recordingUrl: null, // No actual recording for dummy data
      recordingBlobUrl: null,
      transcriptRaw: mock.raw,
      transcriptTimestamped: timestamped,
      transcriptStructured: {
        ...mock.structured,
        datetime: dt.toISOString(),
        duration_minutes: Math.round(duration / 60),
      },
      status: 'completed',
      consentLog: {
        recordedAt: dt.toISOString(),
        consentGiven: true,
        participants: mock.structured.participants,
      },
      createdAt: dt.toISOString(),
      updatedAt: dt.toISOString(),
    });
  }

  return meetings.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
};

// ─── Mock Transcription Pipeline ────────────────────────────────────────────
/**
 * Simulates the transcription + AI structuring pipeline.
 * Recording audio is processed in-memory and not persisted.
 * For demo/partner dummy data, mock transcripts are still used.
 */
const simulateTranscriptionPipeline = async (meetingId, onStatusChange, recordingInput = null) => {
  const allMeetings = await meetingBackend.loadMeetings();
  const idx = allMeetings.findIndex((m) => m.id === meetingId);
  if (idx === -1) return null;

  const meeting = allMeetings[idx];
  const isRealRecording = !!recordingInput;

  // Phase 1: Uploading
  onStatusChange?.('uploading', 20);
  await meetingBackend.updateMeeting(meetingId, { status: 'uploading' });
  await delay(800);

  if (isRealRecording) {
    const apiResult = await callTranscribeApi(recordingInput, onStatusChange);
    const transcriptError = apiResult?.error;
    const transcriptRaw = apiResult?.transcriptRaw ?? '';
    const transcriptStructured = apiResult?.transcriptStructured;

    if (transcriptError && !transcriptRaw && !transcriptStructured) {
      // API failed — use sample fallback and store error for UI
      const mockIdx = Math.floor(Math.random() * MOCK_TRANSCRIPTS.length);
      const mock = MOCK_TRANSCRIPTS[mockIdx];
      onStatusChange?.('structuring', 60);
      await meetingBackend.updateMeeting(meetingId, { status: 'structuring' });
      await delay(1200);
      const structuredWithMeta = {
        ...normalizeStructuredOutput(mock.structured),
        datetime: meeting.datetime,
        duration_minutes: Math.round((meeting.durationSeconds || 0) / 60),
      };
      await meetingBackend.updateMeeting(meetingId, {
        transcriptRaw: mock.raw,
        transcriptTimestamped: generateTimestampedTranscript(mock.raw),
        transcriptStructured: structuredWithMeta,
        analysisLogHistory: appendAnalysisHistory(meeting, structuredWithMeta, 'fallback-sample'),
        transcriptSource: 'sample',
        transcriptError: transcriptError + (apiResult?.detail ? ` ${apiResult.detail}` : ''),
        status: 'completed',
        updatedAt: new Date().toISOString(),
      });
      onStatusChange?.('completed', 100);
      const updated = await meetingBackend.loadMeetings();
      const found = updated.find((x) => x.id === meetingId);
      return clone(found || meeting);
    }

    if (transcriptRaw || transcriptStructured) {
      const timestamped = transcriptRaw ? generateTimestampedTranscript(transcriptRaw) : [];
      const structured = transcriptStructured
        ? {
            ...normalizeStructuredOutput(transcriptStructured),
            datetime: meeting.datetime,
            duration_minutes: Math.round((meeting.durationSeconds || 0) / 60),
          }
        : null;

      onStatusChange?.('completed', 100);
      await meetingBackend.updateMeeting(meetingId, {
        transcriptRaw: transcriptRaw || null,
        transcriptTimestamped: timestamped.length ? timestamped : null,
        transcriptStructured: structured,
        analysisLogHistory: appendAnalysisHistory(meeting, structured, 'transcription'),
        status: 'completed',
        updatedAt: new Date().toISOString(),
      });
      maybeNotify('meeting_transcribed', {
        title: meeting.title || meetingId,
        partner: meeting.partnerId || '',
        summary: structured?.summary || '',
        actionItems: structured?.action_items || [],
      });
      const updated = await meetingBackend.loadMeetings();
      const found = updated.find((x) => x.id === meetingId);
      return clone(found || meeting);
    }

    // No transcript from API and no explicit error (edge case) — fallback to sample
    const mockIdx = Math.floor(Math.random() * MOCK_TRANSCRIPTS.length);
    const mock = MOCK_TRANSCRIPTS[mockIdx];
    onStatusChange?.('structuring', 60);
    await meetingBackend.updateMeeting(meetingId, { status: 'structuring' });
    await delay(1200);
    const structuredWithMeta = {
      ...normalizeStructuredOutput(mock.structured),
      datetime: meeting.datetime,
      duration_minutes: Math.round((meeting.durationSeconds || 0) / 60),
    };
    await meetingBackend.updateMeeting(meetingId, {
      transcriptRaw: mock.raw,
      transcriptTimestamped: generateTimestampedTranscript(mock.raw),
      transcriptStructured: structuredWithMeta,
      analysisLogHistory: appendAnalysisHistory(meeting, structuredWithMeta, 'fallback-empty'),
      transcriptSource: 'sample',
      transcriptError: 'Transcription returned no content.',
      status: 'completed',
      updatedAt: new Date().toISOString(),
    });
    onStatusChange?.('completed', 100);
    const updated = await meetingBackend.loadMeetings();
    const found = updated.find((x) => x.id === meetingId);
    return clone(found || meeting);
  }

  onStatusChange?.('transcribing', 50);
  await meetingBackend.updateMeeting(meetingId, { status: 'transcribing' });
  await delay(2000);

  const mockIdx = Math.floor(Math.random() * MOCK_TRANSCRIPTS.length);
  const mock = MOCK_TRANSCRIPTS[mockIdx];
  const timestamped = generateTimestampedTranscript(mock.raw);

  await meetingBackend.updateMeeting(meetingId, {
    transcriptRaw: mock.raw,
    transcriptTimestamped: timestamped,
  });

  onStatusChange?.('structuring', 80);
  await meetingBackend.updateMeeting(meetingId, { status: 'structuring' });
  await delay(1500);

  const structuredWithMeta = {
    ...normalizeStructuredOutput(mock.structured),
    datetime: meeting.datetime,
    duration_minutes: Math.round((meeting.durationSeconds || 0) / 60),
  };
  await meetingBackend.updateMeeting(meetingId, {
    transcriptStructured: structuredWithMeta,
    analysisLogHistory: appendAnalysisHistory(meeting, structuredWithMeta, 'mock'),
    status: 'completed',
    updatedAt: new Date().toISOString(),
  });
  onStatusChange?.('completed', 100);

  const updated = await meetingBackend.loadMeetings();
  const found = updated.find((x) => x.id === meetingId);
  return clone(found || meeting);
};

// ─── Public API ─────────────────────────────────────────────────────────────
export const meetingService = {
  /**
   * Get all meetings for a partner. Returns only real data (no dummy generation).
   */
  async getByPartnerId(partnerId) {
    await delay(200);
    const meetings = await meetingBackend.loadMeetings();
    const partnerMeetings = meetings.filter((m) => m.partnerId === partnerId);
    return clone(partnerMeetings.sort((a, b) => new Date(b.datetime) - new Date(a.datetime)));
  },

  /**
   * Get all meetings across all partners.
   */
  async getAll() {
    await delay(200);
    const meetings = await meetingBackend.loadMeetings();
    return clone(meetings.sort((a, b) => new Date(b.datetime) - new Date(a.datetime)));
  },

  /**
   * Get a single meeting by ID.
   */
  async getById(meetingId) {
    await delay(100);
    const meetings = await meetingBackend.loadMeetings();
    const meeting = meetings.find((m) => m.id === meetingId);
    if (!meeting) throw new Error(`Meeting ${meetingId} not found`);
    return clone(meeting);
  },

  /**
   * Create a new meeting (called when recording starts).
   */
  async create({ partnerId, title, channel, participants, organizer }) {
    await delay(100);
    const now = new Date();
    const id = `MTG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const meeting = {
      id,
      partnerId: partnerId || null,
      title: title || `Meeting ${now.toLocaleDateString()}`,
      organizer: organizer || 'Current User',
      participants: participants || [],
      datetime: now.toISOString(),
      durationSeconds: 0,
      channel: channel || 'Other',
      transcriptRaw: null,
      transcriptTimestamped: null,
      transcriptStructured: null,
      status: 'recording',
      consentLog: {
        recordedAt: now.toISOString(),
        consentGiven: true,
        participants: participants || [],
      },
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await meetingBackend.insertMeeting(meeting);
    maybeNotify('meeting_created', {
      title: meeting.title,
      partner: partnerId || '',
      channel: meeting.channel,
      datetime: meeting.datetime,
    });
    return clone(meeting);
  },

  /**
   * Create a planned meeting (future date/time, no recording).
   * @param {{ datetime: string, partnerId?: string, title?: string, channel?: string, participants?: string[], organizer?: string }}
   */
  async createPlanned({ datetime, partnerId, title, channel, participants, organizer }) {
    await delay(100);
    const id = `MTG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const meeting = {
      id,
      partnerId: partnerId || null,
      title: title || `Meeting ${new Date(datetime).toLocaleDateString()}`,
      organizer: organizer || 'Current User',
      participants: participants || [],
      datetime: datetime || nowIso,
      durationSeconds: 0,
      channel: channel || 'Other',
      transcriptRaw: null,
      transcriptTimestamped: null,
      transcriptStructured: null,
      status: 'planned',
      consentLog: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await meetingBackend.insertMeeting(meeting);
    maybeNotify('meeting_created', {
      title: meeting.title,
      partner: partnerId || '',
      channel: meeting.channel,
      datetime: meeting.datetime,
    });
    return clone(meeting);
  },

  /**
   * Update meeting fields (e.g., after recording stops, set duration).
   */
  async update(meetingId, data) {
    await delay(100);
    const result = await meetingBackend.updateMeeting(meetingId, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
    return clone(result);
  },

  /**
   * Process recording and trigger transcription pipeline.
   * Audio is intentionally transient and not persisted to storage.
   */
  async saveRecordingAndTranscribe(meetingId, recordingInput, onStatusChange) {
    const meetings = await meetingBackend.loadMeetings();
    const idx = meetings.findIndex((m) => m.id === meetingId);
    if (idx === -1) throw new Error(`Meeting ${meetingId} not found`);
    await meetingBackend.updateMeeting(meetingId, { status: 'uploading' });
    const result = await simulateTranscriptionPipeline(meetingId, onStatusChange, recordingInput);
    return result;
  },

  /**
   * Upload a recording file manually and trigger transcription.
   * In production: upload file to S3 → same pipeline.
   */
  async uploadAndTranscribe(partnerId, file, metadata, onStatusChange) {
    const meeting = await this.create({
      partnerId,
      title: metadata?.title || file.name.replace(/\.[^/.]+$/, ''),
      channel: metadata?.channel || 'Other',
      participants: metadata?.participants || [],
      organizer: metadata?.organizer || 'Current User',
    });

    // Update metadata before processing.
    await this.update(meeting.id, {
      durationSeconds: metadata?.durationSeconds || 0,
    });

    // Run pipeline
    const result = await this.saveRecordingAndTranscribe(meeting.id, file, onStatusChange);
    return result;
  },

  /**
   * Delete a meeting.
   */
  async delete(meetingId) {
    await delay(100);
    await meetingBackend.deleteMeeting(meetingId);
  },

  /**
   * Clear all meetings (e.g. remove dummy/demo data so you can add your own).
   */
  async clearAll() {
    await delay(100);
    await meetingBackend.clearAllMeetings();
  },
};

export default meetingService;
