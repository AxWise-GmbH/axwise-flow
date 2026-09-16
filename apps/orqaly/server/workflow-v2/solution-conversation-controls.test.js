import { describe, expect, it } from 'vitest';
import {
  conversationControlGuidance,
  conversationControlState,
  explanationNodeParameters,
} from './solution-conversation-controls.js';

const candidate = (status, values = {}) => ({
  id: 'draft-id',
  version: 2,
  status,
  workflow_hash: 'a'.repeat(64),
  spec: { acceptanceCases: [{ id: 'one' }, { id: 'two' }] },
  ...values,
});

describe('server-owned customer control explanation', () => {
  it('does not invent a version, action or acceptance proof without evidence', () => {
    expect(conversationControlState()).toMatchObject({
      kind: 'unknown',
      version: null,
      status: 'unknown',
      nextControl: null,
      testCoverage: { status: 'not_checked' },
      approved: false,
    });
  });
  it('keeps a selected undeployed draft separate from an active release', () => {
    expect(
      conversationControlState({ selected: candidate('draft'), isDraft: true, coverage: false })
    ).toMatchObject({
      kind: 'selected_draft',
      revisionId: 'draft-id',
      version: 2,
      status: 'draft',
      approved: false,
      deployment: 'not_deployed',
      nextControl: 'Review changes',
      testCoverage: { status: 'missing', agreedCaseCount: 2 },
    });
  });
  it('does not recommend approval for a failed review', () => {
    expect(
      conversationControlState({
        selected: candidate('reviewed', { review: { valid: false } }),
        isDraft: true,
      })
    ).toMatchObject({ reviewValid: false, nextControl: 'Review changes', approved: false });
  });
  it('names the exact existing version approval control after a valid review', () => {
    expect(
      conversationControlState({
        selected: candidate('reviewed', { review: { valid: true } }),
        isDraft: true,
      }).nextControl
    ).toBe('Approve v2');
  });
  it('distinguishes approved from deployed', () => {
    expect(
      conversationControlState({
        selected: candidate('approved', { approved_at: '2026-09-07T00:00:00Z' }),
        isDraft: true,
      })
    ).toMatchObject({
      approved: true,
      deployment: 'not_deployed',
      nextControl: 'Deploy approved version',
    });
  });
  it('uses Test all agreed cases for an inactive staged version without full coverage', () => {
    expect(
      conversationControlState({
        selected: candidate('ready', {
          deployment: { workflowId: 'private' },
          tested_at: '2026-09-07T00:00:00Z',
        }),
        coverage: false,
      })
    ).toMatchObject({
      deployment: 'deployed',
      nextControl: 'Test all agreed cases',
      testCoverage: { status: 'missing' },
    });
  });
  it('suggests the separate activation control only with exact coverage and a saved test marker', () => {
    expect(
      conversationControlState({
        selected: candidate('ready', { deployment: {}, tested_at: '2026-09-07T00:00:00Z' }),
        coverage: true,
      }).nextControl
    ).toBe('Activate v2');
    expect(
      conversationControlState({ selected: candidate('ready', { deployment: {} }), coverage: true })
        .nextControl
    ).toBe('Test all agreed cases');
  });
  it.each(['deploying', 'deployment_unknown'])(
    'does not recommend a fresh effect for %s',
    (status) => {
      expect(
        conversationControlState({
          selected: candidate(status, { deployment: {} }),
          coverage: true,
        })
      ).toMatchObject({
        unresolvedOutcome: true,
        nextControl: null,
        deployment: 'unknown',
        testCoverage: { status: 'unknown' },
      });
    }
  );
  it('does not infer safe activation from earlier coverage when a result is unresolved', () => {
    expect(
      conversationControlState({
        selected: candidate('ready', { deployment: {}, tested_at: 'old' }),
        coverage: true,
        unresolved: true,
      })
    ).toMatchObject({
      nextControl: null,
      unresolvedOutcome: true,
      testCoverage: { status: 'unknown' },
    });
  });
  it('describes current live evidence without inventing a new action or endpoint', () => {
    const result = conversationControlState({
      selected: candidate('active', {
        revision_id: 'active-id',
        deployment: { webhookUrl: 'private-host' },
      }),
      coverage: true,
    });
    expect(result).toMatchObject({
      kind: 'current_release',
      revisionId: 'active-id',
      status: 'active',
      deployment: 'deployed',
      nextControl: null,
    });
    expect(JSON.stringify(result)).not.toContain('private-host');
  });
  it('does not infer provider unpublication from Orqaly paused status', () => {
    expect(
      conversationControlState({
        selected: candidate('paused', { deployment: { active: true } }),
        coverage: true,
      })
    ).toMatchObject({ status: 'paused', deployment: 'deployed', nextControl: null });
  });
  it('omits only native webhook path and leaves canonical artifacts and outbound scope intact', () => {
    const webhook = {
      type: 'n8n-nodes-base.webhook',
      parameters: { path: 'private-draft-id', httpMethod: 'POST', responseMode: 'responseNode' },
    };
    const outbound = {
      type: 'CUSTOM.boundedHttp',
      parameters: { url: 'https://example.com/events', method: 'POST' },
    };
    expect(explanationNodeParameters(webhook)).toEqual({
      httpMethod: 'POST',
      responseMode: 'responseNode',
    });
    expect(webhook.parameters.path).toBe('private-draft-id');
    expect(explanationNodeParameters(outbound)).toEqual(outbound.parameters);
  });
  it('uses the actual existing UI labels and never equates chat with permission', () => {
    for (const label of [
      'Review changes',
      'Approve vN',
      'Deploy approved version',
      'Test all agreed cases',
      'Activate vN',
      'Set up required connections',
      'Review saved changes',
    ])
      expect(conversationControlGuidance).toContain(label);
    expect(conversationControlGuidance).toContain('not customer invocation URLs');
    expect(conversationControlGuidance).toContain('Unknown outcomes');
    expect(conversationControlGuidance).toContain('separate explicit customer decision');
  });
});
