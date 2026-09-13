/**
 * useAssistantConsole - aggregates everything the Assistant Console renders.
 *
 * Setup/brain/voice come from useAssistantSetup; the rest is fanned out in
 * parallel (Promise.allSettled) to existing services so one failing source never
 * blanks the page. Where a live source is empty (fresh account / no session) the
 * card shows an empty/zero state - real mode never falls back to the demo fixture
 * (that is reserved for the Demo toggle). Cards stay presentational - the page
 * wires mutations and calls refetch().
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAssistantSetup } from './useAssistantSetup';
import { getChannels, getLogs, getRecentAgentMessages } from '../services/communicatorService';
import { listContacts } from '../services/contactsService';
import { listOrganizations } from '../services/organizationService';
import { getCompanyBrief } from '../services/companyBriefService';
import { fetchUsage } from '../services/usageService';
import { fetchArenaScoreboard, fetchArenaDecision } from '../services/arenaService';
import { listDocuments, listTags } from '../services/knowledgeBaseService';
import {
  isAvailable as voiceboxAvailable,
  listProfiles as voiceboxProfiles,
  DEFAULT_BASE_URL,
} from '../services/voiceboxService';
import {
  groupThreads,
  mergeUsageSnapshots,
  buildKnowledgeData,
  shapeTeamChat,
  shapeContributions,
  buildActivitySeries,
} from '../pages/Assistant/format';
import { providerLabel, DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL } from '../config/assistantBrain';
import MOCK from '../pages/Assistant/mockAssistantConsole';

// Static UI copy for the Insights CTA (not user data - the card is a generate
// entry point, so this stays constant in both demo and live modes).
const INSIGHTS_COPY = {
  description:
    "Generate AI-powered insights about your assistant's performance, knowledge usage, and conversation trends.",
  privateNote: 'Insights are private to your team',
};

// Empty-safe Data & Knowledge shape so the card never reads undefined counts.
const EMPTY_KNOWLEDGE = {
  counts: { notes: 0, files: 0, links: 0 },
  connectors: [],
  tags: [],
  tagsMore: 0,
};

// llm_usage sources attributable to the assistant itself.
const ASSISTANT_USAGE_SOURCES = [
  'assistant-chat',
  'assistant-natural-reply',
  'tts',
  'company-brief',
  'assistant-first-steps',
];

function asArray(x) {
  if (Array.isArray(x)) return x;
  return x?.data || x?.organizations || x?.contacts || x?.channels || [];
}

function settled(result, fallback) {
  return result?.status === 'fulfilled' ? result.value : fallback;
}

/** assistant_setup.config.temperature (0-1.5) -> creativity slider (0-100). */
function creativityFromTemperature(t) {
  if (typeof t !== 'number') return null;
  return Math.round((Math.max(0, Math.min(1.5, t)) / 1.5) * 100);
}

const EMPTY_EXTRA = {
  channels: null,
  contacts: null,
  organizations: null,
  conversations: null,
  activity: null,
  brief: null,
  usage: null,
  voiceLive: null,
  data: null,
  teamChat: null,
  contributions: null,
  arena: null,
};

export function useAssistantConsole({ demo = false } = {}) {
  const setup = useAssistantSetup();
  const [extra, setExtra] = useState(EMPTY_EXTRA);
  const [loadingExtra, setLoadingExtra] = useState(true);
  // The full-page spinner fires on the FIRST load only. After that, refetches run
  // silently in the background and cards update in place - flipping `loading` true
  // again would unmount the whole grid (spinner + Reveal re-cascade = "refresh").
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const assistantName = setup.name || 'Assistant';
  const voiceCfg = setup.config?.voice || null;

  const loadExtra = useCallback(async () => {
    // Demo mode renders the fixture - no need to hit the network.
    if (demo) {
      setExtra(EMPTY_EXTRA);
      setLoadingExtra(false);
      setHasLoaded(true);
      return;
    }
    setLoadingExtra(true);
    setError(null);
    try {
      const usageCalls = ASSISTANT_USAGE_SOURCES.map((source) => fetchUsage('all', { source }));
      const [
        channelsR,
        contactsR,
        orgsR,
        logsR,
        briefR,
        docsR,
        tagsR,
        teamMsgsR,
        voiceOkR,
        voiceProfR,
        arenaBoardR,
        arenaDecisionR,
        ...usageR
      ] = await Promise.allSettled([
        getChannels(),
        listContacts(),
        listOrganizations(),
        getLogs({ limit: 1000 }),
        getCompanyBrief(),
        listDocuments({ limit: 200 }),
        listTags(),
        getRecentAgentMessages(8),
        voiceCfg?.provider === 'voicebox'
          ? voiceboxAvailable({ baseUrl: voiceCfg.baseUrl || DEFAULT_BASE_URL })
          : Promise.resolve(null),
        voiceCfg?.provider === 'voicebox'
          ? voiceboxProfiles({ baseUrl: voiceCfg.baseUrl || DEFAULT_BASE_URL }).catch(() => [])
          : Promise.resolve([]),
        fetchArenaScoreboard(),
        fetchArenaDecision(),
        ...usageCalls,
      ]);

      const channels = asArray(settled(channelsR, [])).map((c) => ({
        id: c.id,
        platform: c.platform,
        handle: c.name || c.handle || c.platform,
        status:
          c.status === 'active' || c.status === 'connected' ? 'connected' : c.status || 'unknown',
      }));

      const contactList = asArray(settled(contactsR, []));
      const orgs = asArray(settled(orgsR, []));
      const logs = asArray(settled(logsR, []));
      const briefRes = settled(briefR, null);

      const usageSnaps = usageR.map((r) => settled(r, null)).filter(Boolean);
      const usage = mergeUsageSnapshots(usageSnaps);

      const voiceOk = settled(voiceOkR, null);
      const voiceProfiles = asArray(settled(voiceProfR, []));

      const documents = asArray(settled(docsR, []));
      const tags = asArray(settled(tagsR, []));
      const teamMsgs = asArray(settled(teamMsgsR, []));

      if (!mounted.current) return;
      setExtra({
        channels: channels.length ? channels : null,
        contacts: contactList.length ? contactList : null,
        organizations: orgs.length ? orgs : null,
        conversations: logs.length ? groupThreads(logs, assistantName) : null,
        activity: logs.length ? buildActivitySeries(logs) : null,
        brief: briefRes
          ? {
              status: briefRes.brief?.status || briefRes.status || 'empty',
              summary: briefRes.brief?.summary || briefRes.summary || '',
              questionCount: (briefRes.answers || briefRes.brief?.answers || []).length || 0,
            }
          : null,
        usage: usage.totalTokens > 0 ? usage : null,
        arena: shapeArena(settled(arenaBoardR, null), settled(arenaDecisionR, null)),
        data: documents.length ? buildKnowledgeData(documents, tags) : null,
        teamChat: teamMsgs.length ? shapeTeamChat(teamMsgs) : null,
        contributions: documents.length ? shapeContributions(documents.slice(0, 8)) : null,
        voiceLive: voiceCfg
          ? {
              provider: voiceCfg.provider,
              status:
                voiceCfg.provider === 'voicebox'
                  ? voiceOk?.ok
                    ? 'reachable'
                    : 'unreachable'
                  : 'reachable',
              profileId: voiceCfg.profileId || '',
              profiles: voiceProfiles.map((p) => ({ id: p.id, name: p.name || p.id })),
            }
          : null,
      });
    } catch (err) {
      if (mounted.current) setError(err);
    } finally {
      if (mounted.current) {
        setLoadingExtra(false);
        setHasLoaded(true);
      }
    }
  }, [assistantName, voiceCfg, demo]);

  useEffect(() => {
    loadExtra();
  }, [loadExtra]);

  const refetch = useCallback(() => {
    setup.refresh?.();
    loadExtra();
  }, [setup, loadExtra]);

  // Real data. Every section shows live values, empty/zero when there is none -
  // never the demo fixture. Insights is the one exception: a static "generate"
  // CTA (INSIGHTS_COPY), not user data. Demo mode (below) overrides with MOCK.
  const realData = useMemo(() => {
    const cfg = setup.config || {};
    const brain = {
      provider: cfg.provider || DEFAULT_LLM_PROVIDER,
      model: cfg.model || DEFAULT_LLM_MODEL,
      tone: cfg.tone || 'professional',
      creativity: creativityFromTemperature(cfg.temperature) ?? 50,
    };

    const contactList = extra.contacts || [];
    const contacts = {
      list: contactList,
      total: contactList.length,
      mail: contactList.filter((c) => c.contact_type === 'mail').length,
      phone: contactList.filter((c) => c.contact_type !== 'mail').length,
    };

    const vc = cfg.voice || {};
    const voice = extra.voiceLive
      ? {
          name:
            extra.voiceLive.profiles?.find((p) => p.id === extra.voiceLive.profileId)?.name ||
            'Voice',
          provider: extra.voiceLive.provider,
          status: extra.voiceLive.status,
          profileId: extra.voiceLive.profileId || '',
          profiles: extra.voiceLive.profiles || [],
          language: vc.language || '',
          sampleText: '',
          positionLabel: '0:00',
          durationLabel: '0:06',
          audioUrl: null,
        }
      : {
          name: vc.provider === 'builtin' ? 'Built-in' : 'Not set',
          provider: vc.provider || 'builtin',
          status: 'reachable',
          profileId: vc.profileId || '',
          profiles: [],
          language: vc.language || '',
          sampleText: '',
          positionLabel: '0:00',
          durationLabel: '0:06',
          audioUrl: null,
        };

    return {
      assistant: { name: assistantName, activated: setup.activated ?? false },
      brain,
      providerLabel: providerLabel(brain.provider),
      channels: extra.channels || [],
      data: extra.data || EMPTY_KNOWLEDGE,
      organizations: extra.organizations || [],
      contacts,
      conversations: extra.conversations || [],
      activity: extra.activity || [],
      teamChat: extra.teamChat || [],
      contributions: extra.contributions || [],
      brief: extra.brief || { status: 'empty', summary: '', questionCount: 0 },
      voice,
      usage: extra.usage || { totalTokens: 0, totalCost: 0, models: [], timeseries: [] },
      arena: extra.arena || null,
      insights: INSIGHTS_COPY,
    };
  }, [setup.config, setup.activated, extra, assistantName]);

  const data = demo ? MOCK : realData;

  return {
    data,
    loading: demo ? false : !hasLoaded && (setup.loading || loadingExtra),
    error,
    refetch,
    demo,
    save: demo ? async () => ({}) : setup.save,
    config: demo ? {} : setup.config || {},
    // Multi-assistant: the list + current selection + CRUD come straight from
    // the underlying setup hook so the console and the switcher share one source.
    assistants: demo ? [] : setup.assistants,
    currentId: demo ? null : setup.currentId,
    currentName: demo ? null : setup.name,
    createAssistant: setup.createAssistant,
    switchAssistant: setup.switchAssistant,
    renameAssistant: setup.renameAssistant,
    removeAssistant: setup.removeAssistant,
  };
}

/**
 * Condense Arena down to what the console block shows: the week's tally, the
 * per-department lead, and the single most actionable headline.
 *
 * Returns null when nothing is set up, which is what makes the block render its
 * "Set up Arena" state rather than an empty scoreboard.
 */
function shapeArena(scoreboard, decision) {
  const departments = scoreboard?.departments || [];
  if (!departments.length) return null;

  const compared = departments.reduce((n, d) => n + (d.n || 0), 0);
  const wins = departments.reduce(
    (acc, d) => ({
      people: acc.people + (d.wins?.people || 0),
      agents: acc.agents + (d.wins?.agents || 0),
      tie: acc.tie + (d.wins?.tie || 0),
    }),
    { people: 0, agents: 0, tie: 0 }
  );

  const savedMoney = departments.reduce((sum, d) => {
    const delta = d.costDelta;
    return delta != null ? sum + delta * (d.n || 0) : sum;
  }, 0);
  const savedMinutes = departments.reduce((sum, d) => {
    const delta = d.timeDelta;
    return delta != null ? sum + delta * (d.n || 0) : sum;
  }, 0);

  const ready = (decision?.departments || []).find((d) => d.recommendation === 'hand_over');
  const risky = (decision?.departments || []).find(
    (d) => d.recommendation === 'keep_human' && d.stakes === 'high'
  );

  return {
    compared,
    wins,
    savedMoney: savedMoney || null,
    savedMinutes: savedMinutes || null,
    departments: departments.map((d) => ({
      id: d.id,
      label: d.label,
      people: d.wins?.people || 0,
      agents: d.wins?.agents || 0,
      n: d.n || 0,
    })),
    headline: ready ? `${ready.label} looks ready to hand over` : null,
    warning: risky ? `${risky.label} still needs people` : null,
  };
}
