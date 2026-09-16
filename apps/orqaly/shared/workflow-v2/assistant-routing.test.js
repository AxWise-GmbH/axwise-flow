import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_ROUTE_POLICY_VERSION,
  resolveAssistantTurnRoute,
  routeAssistantTurn,
} from './assistant-routing.js';

describe('assistant contextual route policy', () => {
  it('keeps a deictic follow-up conversational even when it repeats a bounded-work noun', () => {
    expect(
      routeAssistantTurn('perfect, can you tell me more about that plan', {
        hasPriorAssistantReply: true,
      })
    ).toBe('DIRECT_ANSWER');
  });

  it('keeps a deictic follow-up conversational even when prior wording sounds durable', () => {
    expect(
      routeAssistantTurn('Tell me more about that ongoing multi-step plan.', {
        hasPriorAssistantReply: true,
      })
    ).toBe('DIRECT_ANSWER');
  });

  it('does not treat the same standalone request as a contextual follow-up', () => {
    expect(routeAssistantTurn('perfect, can you tell me more about that plan')).toBe('DISCOVER');
  });

  it('keeps an explicit new bounded request in Research after an earlier answer', () => {
    expect(
      routeAssistantTurn('Research a new launch plan for Germany.', {
        hasPriorAssistantReply: true,
      })
    ).toBe('AXWISE_ONE_SHOT');
  });

  it('uses the typed composer intent instead of bounded-work keyword inference', () => {
    expect(
      routeAssistantTurn('Research a new launch plan for Germany.', {
        hasPriorAssistantReply: true,
        intent: 'assistant',
      })
    ).toBe('DIRECT_ANSWER');
    expect(routeAssistantTurn('Explain photosynthesis.', { intent: 'research' })).toBe(
      'AXWISE_ONE_SHOT'
    );
    expect(routeAssistantTurn('Explain photosynthesis.', { intent: 'goal' })).toBe('START_GOAL');
  });

  it('keeps explicit Goal actions ahead of conversational follow-up handling', () => {
    expect(
      routeAssistantTurn('Start a goal to expand on that plan.', {
        hasPriorAssistantReply: true,
      })
    ).toBe('START_GOAL');
  });

  it('routes a narrow real-world verification request to grounded research with provenance', () => {
    expect(resolveAssistantTurnRoute('can you check how it will really work')).toEqual({
      route: 'AXWISE_ONE_SHOT',
      policyVersion: ASSISTANT_ROUTE_POLICY_VERSION,
      reasonCode: 'verification_requested',
    });
    expect(resolveAssistantTurnRoute('Verify the current behavior in production.')).toMatchObject({
      route: 'AXWISE_ONE_SHOT',
      reasonCode: 'verification_requested',
    });
  });

  it('routes explicit official-source constraints to Research before contextual inference', () => {
    expect(
      resolveAssistantTurnRoute(
        'Using only official Google Cloud documentation, explain in two bullets what Cloud Run readiness checks do.'
      )
    ).toEqual({
      route: 'AXWISE_ONE_SHOT',
      policyVersion: 'orqaly.assistant-route-policy.v2',
      reasonCode: 'grounded_sources_requested',
    });
    expect(
      resolveAssistantTurnRoute('Tell me more about that plan using official sources.', {
        hasPriorAssistantReply: true,
      })
    ).toMatchObject({
      route: 'AXWISE_ONE_SHOT',
      reasonCode: 'grounded_sources_requested',
    });
  });

  it('does not turn a prohibition on external sources into a Research request', () => {
    expect(resolveAssistantTurnRoute('Explain this text without external sources.')).toMatchObject({
      route: 'DIRECT_ANSWER',
      reasonCode: 'auto_direct',
    });
    expect(resolveAssistantTurnRoute('Explain this and do not include sources.')).toMatchObject({
      route: 'DIRECT_ANSWER',
      reasonCode: 'auto_direct',
    });
    for (const message of [
      'Do not cite sources.',
      "Don't include links.",
      'No need to provide sources.',
      'Use the provided text, not official sources.',
      "Don't use official sources.",
      "Don't cite official sources.",
      'No need to use official documentation.',
      "Please don't provide authoritative sources.",
      'Include source code for the button component.',
      'Use primary source code from this repository.',
      'Provide source files for the component.',
      'Provide source-code files for the component.',
      'Use official source-code files.',
      'Include references to related database records.',
      'Use primary buttons and include links in the sidebar.',
      'Provide an answer without sources.',
      'Provide no sources.',
      'Include no citations.',
      'Cite no sources.',
      'Use everything except official sources.',
      'Use everything other than official sources.',
      'Provide no official sources.',
      'Use no official documentation.',
      'Include no authoritative citations.',
      'Cite no primary sources.',
      'Do not ever use official documentation.',
      'Never ever use official sources.',
      'Do not ever cite sources.',
    ]) {
      expect(resolveAssistantTurnRoute(message), message).toMatchObject({
        route: 'DIRECT_ANSWER',
      });
    }
    expect(
      resolveAssistantTurnRoute(
        'Do not include source links. Provide sources for the final claim.'
      )
    ).toMatchObject({
      route: 'AXWISE_ONE_SHOT',
      reasonCode: 'grounded_sources_requested',
    });
    for (const message of [
      "I'm not asking for speculation, cite sources.",
      "Don't rely on memory—use official sources.",
      "I'm not sure, so use official documentation.",
    ]) {
      expect(resolveAssistantTurnRoute(message), message).toMatchObject({
        route: 'AXWISE_ONE_SHOT',
        reasonCode: 'grounded_sources_requested',
      });
    }
  });

  it('keeps durable work ahead of one-shot grounded-source routing', () => {
    for (const message of [
      'Monitor official sources every week and provide links.',
      'Using official sources, run a multi-step investigation with approval gates.',
    ]) {
      expect(resolveAssistantTurnRoute(message), message).toMatchObject({
        route: 'PROPOSE_GOAL',
        reasonCode: 'durable_work',
      });
    }
  });

  it('does not treat bare check language as a grounded verification request', () => {
    expect(resolveAssistantTurnRoute('Can you check how it works?')).toMatchObject({
      route: 'DIRECT_ANSWER',
      reasonCode: 'auto_direct',
    });
  });

  it('keeps contextual tell-me-more precedence over verification signals', () => {
    expect(
      resolveAssistantTurnRoute('Tell me more about that plan and check how it really works.', {
        hasPriorAssistantReply: true,
      })
    ).toMatchObject({ route: 'DIRECT_ANSWER', reasonCode: 'contextual_follow_up' });
  });
});
