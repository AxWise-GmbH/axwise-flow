import { describe, expect, it } from 'vitest';
import {
  assistantArtifactDownloadMarkdown,
  assistantMessageEvidence,
  assistantMessageHasVerifiableSources,
  assistantMessageStructuredSources,
  assistantVerifiableHttpsUrl,
  buildAssistantActivityView,
  buildAssistantMessageView,
  assistantRoutingProvenance,
  mergeAssistantActivityEvents,
  retryAvailability,
} from './assistant-view-model.js';

function message(turnId, role, retryOfTurnId = null) {
  return {
    id: `${turnId}:${role}`,
    turnId,
    role,
    retryOfTurnId,
    parts: [{ type: 'text', markdown: `${role} ${turnId}` }],
  };
}

describe('assistant routing provenance', () => {
  it.each([
    ['DIRECT_ANSWER', 'Auto → Assistant'],
    ['AXWISE_ONE_SHOT', 'Auto → Research'],
    ['START_GOAL', 'Auto → Agent'],
  ])('renders the resolved %s route without hiding Auto', (route, label) => {
    expect(
      assistantRoutingProvenance({
        id: 'persisted-message',
        requestedIntent: 'auto',
        resolvedRoute: route,
        route,
      })
    ).toMatchObject({ label, requestedIntent: 'auto' });
  });

  it('distinguishes an explicit mode selection and exposes safe routing details', () => {
    expect(
      assistantRoutingProvenance({
        id: 'persisted-message',
        requestedIntent: 'research',
        route: 'AXWISE_ONE_SHOT',
        routeReasonCode: 'requested_research',
        routePolicyVersion: 'orqaly.assistant-route-policy.v1',
      })
    ).toEqual({
      detail:
        'You selected Research for this message. Routing policy: orqaly.assistant-route-policy.v1.',
      label: 'Research selected',
      policyVersion: 'orqaly.assistant-route-policy.v1',
      reasonCode: 'requested_research',
      requestedIntent: 'research',
      resolvedIntent: 'research',
    });
  });

  it('shows when an explicit Assistant request resolves to delegated Agent work', () => {
    expect(
      assistantRoutingProvenance({
        id: 'persisted-message',
        requestedIntent: 'assistant',
        resolvedRoute: 'START_GOAL',
        route: 'START_GOAL',
        routeReasonCode: 'explicit_goal_start',
        routePolicyVersion: 'orqaly.assistant-route-policy.v1',
      })
    ).toMatchObject({
      detail:
        'The request explicitly asked to delegate work to an Agent. Routing policy: orqaly.assistant-route-policy.v1.',
      label: 'Assistant → Agent',
      requestedIntent: 'assistant',
      resolvedIntent: 'goal',
    });
  });

  it('does not guess the selection for a legacy message', () => {
    expect(
      assistantRoutingProvenance({ id: 'legacy-message', route: 'AXWISE_ONE_SHOT' })
    ).toMatchObject({
      detail: 'This earlier turn records the route, but not how the mode was selected.',
      label: 'Route · Research',
      requestedIntent: null,
      resolvedIntent: 'research',
    });
  });

  it('keeps optimistic Auto honest until the server resolves the route', () => {
    expect(
      assistantRoutingProvenance({
        id: 'optimistic:turn-1',
        requestedIntent: 'auto',
        route: 'DIRECT_ANSWER',
      })
    ).toMatchObject({
      label: 'Auto · routing',
      detail: 'Orqanix is choosing an action for this message.',
    });
  });
});

describe('assistant retry view model', () => {
  it('shows the root request once and labels retry responses as attempts', () => {
    const view = buildAssistantMessageView([
      message('root', 'user'),
      message('root', 'assistant'),
      message('retry', 'user', 'root'),
      message('retry', 'assistant'),
    ]);

    expect(view.entries.map(({ message: value }) => [value.turnId, value.role])).toEqual([
      ['root', 'user'],
      ['root', 'assistant'],
      ['retry', 'assistant'],
    ]);
    expect(
      view.entries.slice(1).map(({ attemptNumber, attemptCount }) => [attemptNumber, attemptCount])
    ).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(view.retriedTurns).toEqual(new Set(['root']));
  });

  it('keeps ordinary turns unchanged', () => {
    const messages = [message('root', 'user'), message('root', 'assistant')];
    expect(buildAssistantMessageView(messages).entries.map((entry) => entry.message)).toEqual(
      messages
    );
  });

  it('honors an optional provider retry time', () => {
    const part = {
      type: 'operation_status',
      status: 'failed',
      retryMode: 'new_attempt',
      retryAt: '2026-09-01T10:10:00.000Z',
    };
    expect(retryAvailability(part, Date.parse('2026-09-01T10:09:59.000Z')).available).toBe(false);
    expect(retryAvailability(part, Date.parse('2026-09-01T10:10:00.000Z')).available).toBe(true);
  });
});

describe('assistant activity view model', () => {
  it('labels completed Research as sourced only when evidence is present', () => {
    const sourced = buildAssistantActivityView({
      events: [],
      route: 'AXWISE_ONE_SHOT',
      status: 'completed',
      hasResearchEvidence: true,
    });
    const ungrounded = buildAssistantActivityView({
      events: [],
      route: 'AXWISE_ONE_SHOT',
      status: 'completed',
      hasResearchEvidence: false,
    });

    expect(sourced).toMatchObject({
      evidenceGap: false,
      headline: 'Research completed with sources',
    });
    expect(sourced.steps.at(-1).detail).toContain('sourced response');
    expect(ungrounded).toMatchObject({
      evidenceGap: true,
      headline: 'Research saved without verifiable sources',
    });
    expect(ungrounded.steps.at(-1).detail).toContain('no verifiable source URL');
    expect(JSON.stringify(ungrounded).toLocaleLowerCase()).not.toContain('grounded response');
  });

  it('merges event batches by identity, keeps the latest duplicate, and orders by sequence', () => {
    const events = mergeAssistantActivityEvents(
      [
        { id: 'event-2', turnId: 'turn-1', sequence: 2, type: 'running' },
        { turnId: 'turn-1', sequence: 4, type: 'failed' },
      ],
      [
        { id: 'event-1', turnId: 'turn-1', sequence: 1, type: 'routed' },
        { id: 'event-2', turnId: 'turn-1', sequence: 2, type: 'progress' },
        { turnId: 'turn-1', sequence: 3, type: 'tool_started' },
        { turnId: 'turn-1', sequence: 4, type: 'completed' },
      ]
    );

    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(events.map((event) => event.type)).toEqual([
      'routed',
      'progress',
      'tool_started',
      'completed',
    ]);
  });

  it.each([
    ['accepted', ['routed', 'submitted', 'accepted'], true, false, 'active'],
    ['running', ['routed', 'submitted', 'running'], true, false, 'active'],
    [
      'cancel_requested',
      ['routed', 'submitted', 'running', 'cancel_requested'],
      true,
      false,
      'active',
    ],
    ['completed', ['routed', 'submitted', 'completed'], false, true, 'completed'],
    ['failed', ['routed', 'submitted', 'failed'], false, true, 'failed'],
    ['cancelled', ['routed', 'submitted', 'cancelled'], false, true, 'cancelled'],
  ])(
    'builds a safe fallback lifecycle for %s when no events were retained',
    (status, expectedKeys, active, terminal, finalState) => {
      const view = buildAssistantActivityView({
        events: [],
        route: 'AXWISE_ONE_SHOT',
        status,
      });

      expect(view.mode.label).toBe('Research');
      expect(view.steps.map((step) => step.key)).toEqual(expectedKeys);
      expect(view.steps.at(-1).state).toBe(finalState);
      expect(view.active).toBe(active);
      expect(view.terminal).toBe(terminal);
    }
  );

  it.each([
    ['accepted', 'accepted', 'The reasoning service accepted your request'],
    ['running', 'running', 'Grounded research running'],
    ['heartbeat', 'heartbeat', 'The reasoning service is still working'],
    ['cancel_requested', 'cancel_requested', 'Stop requested'],
  ])('maps the allowlisted %s progress state to safe product copy', (eventType, key, label) => {
    const view = buildAssistantActivityView({
      events: [
        {
          id: `progress-${eventType}`,
          turnId: 'turn-1',
          sequence: 1,
          type: 'progress',
          payload: { eventType },
        },
      ],
      route: 'AXWISE_ONE_SHOT',
      status: 'running',
    });

    expect(view.steps).toContainEqual(expect.objectContaining({ key, label }));
  });

  it.each([
    ['PROPOSE_GOAL', 'Goal proposal ready'],
    ['START_GOAL', 'Goal created'],
    ['CONTINUE_GOAL', 'Goal continued'],
  ])(
    'keeps local %s activity route-accurate without inventing AxWise execution',
    (route, completedLabel) => {
      const view = buildAssistantActivityView({
        events: [
          { id: `${route}-routed`, turnId: 'turn-1', sequence: 1, type: 'routed' },
          { id: `${route}-submitted`, turnId: 'turn-1', sequence: 2, type: 'submitted' },
          { id: `${route}-running`, turnId: 'turn-1', sequence: 3, type: 'running' },
          { id: `${route}-completed`, turnId: 'turn-1', sequence: 4, type: 'completed' },
        ],
        route,
        status: 'completed',
      });

      expect(view.headline).toBe(completedLabel);
      expect(view.steps).toContainEqual(
        expect.objectContaining({ key: 'completed', label: completedLabel })
      );
      expect(JSON.stringify(view)).not.toContain('AxWise');
      expect(JSON.stringify(view)).not.toContain('Goal completed');
    }
  );

  it.each(['submitted', 'running'])(
    'does not present top-level %s as provider acceptance',
    (type) => {
      const view = buildAssistantActivityView({
        events: [{ id: type, turnId: 'turn-1', sequence: 1, type }],
        route: 'AXWISE_ONE_SHOT',
        status: 'running',
      });

      expect(view.steps.some((step) => step.key === 'accepted')).toBe(false);
      expect(JSON.stringify(view).toLocaleLowerCase()).not.toContain('accepted');
    }
  );

  it('shows provider acceptance only for the allowlisted upstream accepted event', () => {
    const view = buildAssistantActivityView({
      events: [
        {
          id: 'upstream-accepted',
          turnId: 'turn-1',
          sequence: 1,
          type: 'progress',
          payload: { eventType: 'accepted' },
        },
      ],
      route: 'AXWISE_ONE_SHOT',
      status: 'running',
    });

    expect(view.steps).toContainEqual(
      expect.objectContaining({ key: 'accepted', label: 'The reasoning service accepted your request' })
    );
  });

  it('never projects arbitrary event payloads or secret text into the returned view', () => {
    const secret = 'sk_live_do-not-render-this-value';
    const view = buildAssistantActivityView({
      events: [
        {
          id: 'heartbeat',
          turnId: 'turn-1',
          sequence: 1,
          type: 'progress',
          payload: {
            eventType: 'heartbeat',
            message: secret,
            nested: { authorization: secret },
          },
        },
        {
          id: 'tool',
          turnId: 'turn-1',
          sequence: 2,
          type: 'tool_started',
          payload: { toolName: secret, arguments: secret },
        },
        {
          id: 'unknown',
          turnId: 'turn-1',
          sequence: 3,
          type: 'progress',
          payload: { eventType: secret, label: secret },
        },
      ],
      route: 'AXWISE_ONE_SHOT',
      status: 'running',
    });

    expect(view.steps).toContainEqual(
      expect.objectContaining({
        key: 'heartbeat',
        label: 'The reasoning service is still working',
        detail: 'The worker lease is healthy.',
      })
    );
    expect(view.steps).toContainEqual(
      expect.objectContaining({
        key: 'tool_started',
        label: 'A tool started',
        detail: 'Tool details are kept private.',
      })
    );
    expect(JSON.stringify(view)).not.toContain(secret);
  });
});

describe('assistant research evidence', () => {
  it('separates three cited official sources from extra discovery and an uncited follow-up', () => {
    const officialSources = [
      {
        type: 'source',
        title: 'Exchange a foreign EU driving licence',
        url: 'https://www.service.bremen.de/dienstleistungen/exchange-driving-licence',
        sourceTypes: ['government', 'grounded_web'],
      },
      {
        type: 'source',
        title: 'Validity of foreign driving licences in Germany',
        url: 'https://bmv.de/driving-licences/validity',
        sourceTypes: ['official_documentation', 'grounded_web'],
      },
      {
        type: 'source',
        title: 'Driving licence exchange and recognition in the EU',
        url: 'https://europa.eu/youreurope/citizens/vehicles/driving-licence/',
        sourceTypes: ['government', 'grounded_web'],
      },
    ];
    const discoveredSources = Array.from({ length: 6 }, (_, index) => ({
      type: 'source',
      title: `Discovered page ${index + 1}`,
      url: `https://docs.example.com/discovered-${index + 1}`,
      sourceTypes: ['grounded_web'],
    }));
    const evidence = assistantMessageEvidence({
      parts: [
        ...discoveredSources.slice(0, 2),
        officialSources[0],
        ...discoveredSources.slice(2, 4),
        officialSources[1],
        ...discoveredSources.slice(4),
        officialSources[2],
        {
          type: 'fact',
          statement: '**Bremen** handles EU licence exchanges.',
          sourceUrls: [officialSources[0].url],
        },
        {
          type: 'fact',
          statement: 'EU licences are generally recognised.',
          sourceUrls: [officialSources[1].url, officialSources[2].url],
        },
        {
          type: 'fact',
          statement: 'A third supported claim.',
          sourceUrls: [officialSources[0].url, officialSources[2].url],
        },
      ],
    });
    const followUpEvidence = assistantMessageEvidence({
      parts: [
        {
          type: 'text',
          markdown: 'Latvian-side follow-up with no attached structured evidence.',
        },
      ],
    });

    expect(evidence).toMatchObject({
      supportedClaimCount: 3,
      uncitedClaimCount: 0,
      unmatchedClaimCount: 0,
    });
    expect(evidence.citedSources).toHaveLength(3);
    expect(evidence.discoveredSources).toHaveLength(6);
    expect(evidence.citedSources.map((source) => source.number)).toEqual([1, 2, 3]);
    expect(evidence.claims[1].citationSources.map((source) => source.number)).toEqual([2, 3]);
    expect(evidence.citedSources[0]).toMatchObject({
      hostname: 'www.service.bremen.de',
      sourceTypeLabels: ['Government', 'Web source'],
    });
    expect(JSON.stringify(evidence)).not.toContain('grounded_web');
    expect(followUpEvidence).toMatchObject({
      sources: [],
      claims: [],
      supportedClaimCount: 0,
    });
  });

  it('does not count a claim with unsafe or unmatched citations as supported', () => {
    const evidence = assistantMessageEvidence({
      parts: [
        {
          type: 'source',
          title: 'Returned source',
          url: 'https://example.com/returned',
          sourceTypes: ['primary'],
        },
        {
          type: 'fact',
          statement: 'Partly connected claim',
          sourceUrls: ['https://example.com/returned', 'https://example.com/not-returned'],
        },
        {
          type: 'fact',
          statement: 'Unsafe citation',
          sourceUrls: ['http://example.com/not-verifiable'],
        },
        {
          type: 'fact',
          statement: 'Explicitly uncited claim',
          sourceUrls: [],
        },
      ],
    });

    expect(evidence).toMatchObject({
      supportedClaimCount: 0,
      uncitedClaimCount: 1,
      unmatchedClaimCount: 2,
    });
    expect(evidence.claims[0]).toMatchObject({
      status: 'unmatched',
      unmatchedUrls: ['https://example.com/not-returned'],
    });
    expect(evidence.claims[1]).toMatchObject({ status: 'unmatched', unsafeCitationCount: 1 });
    expect(evidence.claims[2]).toMatchObject({ status: 'uncited', citationSources: [] });
  });

  it.each([
    'https://localhost/private',
    'https://127.0.0.1/private',
    'https://router.local/private',
    'https://example.com/source#unbound-fragment',
  ])('rejects non-public or non-canonical source URL %s', (url) => {
    expect(assistantVerifiableHttpsUrl(url)).toBeNull();
    expect(
      assistantMessageHasVerifiableSources({
        parts: [
          { type: 'source', title: 'Untrusted source', url },
          { type: 'fact', statement: 'Untrusted claim', sourceUrls: [url] },
        ],
      })
    ).toBe(false);
  });

  it('requires a valid HTTPS fact citation linked to a structured source', () => {
    expect(
      assistantMessageHasVerifiableSources({
        parts: [
          { type: 'source', title: 'Primary source', url: 'https://example.com/source' },
          {
            type: 'fact',
            statement: 'Supported claim',
            sourceUrls: ['https://example.com/source'],
          },
        ],
      })
    ).toBe(true);
    expect(
      assistantMessageHasVerifiableSources({
        parts: [{ type: 'fact', statement: 'Claim', sourceUrls: ['https://example.com/fact'] }],
      })
    ).toBe(false);
    expect(
      assistantMessageHasVerifiableSources({
        parts: [
          { type: 'source', title: 'Source', url: 'https://example.com/source' },
          {
            type: 'fact',
            statement: 'Disconnected claim',
            sourceUrls: ['https://example.com/other'],
          },
        ],
      })
    ).toBe(false);
    expect(
      assistantMessageHasVerifiableSources({
        parts: [
          { type: 'source', title: 'Unsafe source', url: 'http://example.com/source' },
          {
            type: 'fact',
            statement: 'Unsafe claim',
            sourceUrls: ['http://example.com/source'],
          },
        ],
      })
    ).toBe(false);
    expect(assistantMessageHasVerifiableSources()).toBe(false);
  });

  it('adds unique structured sources to downloaded artifact Markdown', () => {
    expect(
      assistantArtifactDownloadMarkdown('# Finding\n', [
        { title: 'European [Commission]', url: 'https://commission.europa.eu/guidance' },
        { title: 'Duplicate', url: 'https://commission.europa.eu/guidance' },
        { title: 'AI Office', url: 'https://digital-strategy.ec.europa.eu/' },
      ])
    ).toBe(
      '# Finding\n\n## Sources\n\n' +
        '- [European \\[Commission\\]](<https://commission.europa.eu/guidance>)\n' +
        '- [AI Office](<https://digital-strategy.ec.europa.eu/>)\n'
    );
  });

  it('keeps only unique HTTPS structured sources for rendering', () => {
    expect(
      assistantMessageStructuredSources({
        parts: [
          { type: 'source', title: 'Safe', url: 'https://example.com/source' },
          { type: 'source', title: 'Duplicate', url: 'https://example.com/source' },
          { type: 'source', title: 'Unsafe', url: 'javascript:alert(1)' },
          { type: 'text', markdown: 'Answer' },
        ],
      })
    ).toEqual([{ type: 'source', title: 'Safe', url: 'https://example.com/source' }]);
    expect(assistantMessageStructuredSources()).toEqual([]);
  });
});
