import { describe, expect, it } from 'vitest';
import { buildActionSummaryReply, buildConversationalReply } from './assistantConversationService';

describe('assistantConversationService', () => {
  // ── Conversational replies ──────────────────────────────────────────
  describe('buildConversationalReply', () => {
    it('produces a non-empty reply for greetings', () => {
      const reply = buildConversationalReply({
        text: 'hello',
        chatHistory: [],
        mode: 'Executive Insight Mode',
      });
      expect(reply.length).toBeGreaterThan(10);
    });

    it('produces different replies for repeated greetings', () => {
      const first = buildConversationalReply({
        text: 'hello',
        chatHistory: [],
        mode: 'Executive Insight Mode',
      });
      const second = buildConversationalReply({
        text: 'hello',
        chatHistory: [{ role: 'assistant', message: first }],
        mode: 'Executive Insight Mode',
      });
      expect(second).not.toBe(first);
    });

    it('never repeats the same reply back-to-back on generic input', () => {
      const history = [];
      const replies = new Set();
      for (let i = 0; i < 5; i++) {
        const reply = buildConversationalReply({
          text: 'do something',
          chatHistory: history,
          mode: 'Executive Insight Mode',
        });
        replies.add(reply);
        history.push({ role: 'user', message: 'do something' });
        history.push({ role: 'assistant', message: reply });
      }
      // Should have at least 2 unique replies across 5 attempts
      expect(replies.size).toBeGreaterThanOrEqual(2);
    });

    it('references user topic in fallback replies', () => {
      const reply = buildConversationalReply({
        text: 'website migration',
        chatHistory: [],
        mode: 'Executive Insight Mode',
      });
      expect(reply.toLowerCase()).toContain('website migration');
    });

    it('handles empty input without crashing', () => {
      const reply = buildConversationalReply({
        text: '',
        chatHistory: [],
        mode: 'Executive Insight Mode',
      });
      expect(reply.length).toBeGreaterThan(0);
    });

    it('provides help-specific content', () => {
      const reply = buildConversationalReply({
        text: 'what can you do',
        chatHistory: [],
        mode: 'Executive Insight Mode',
      });
      expect(reply).toMatch(/create|project|partner|workflow/i);
    });

    it('acknowledges problems', () => {
      const reply = buildConversationalReply({
        text: 'something is broken',
        chatHistory: [],
        mode: 'Executive Insight Mode',
      });
      expect(reply).toMatch(/troubleshoot|diagnos|fix|issue|wrong/i);
    });

    it('handles thanks', () => {
      const reply = buildConversationalReply({
        text: 'thank you',
        chatHistory: [],
        mode: 'Executive Insight Mode',
      });
      expect(reply).toMatch(/welcome|glad|next|ready/i);
    });

    it('adapts personality to mode', () => {
      const traffic = buildConversationalReply({
        text: 'hello',
        chatHistory: [],
        mode: 'Traffic Optimization Mode',
      });
      expect(traffic.toLowerCase()).toMatch(/traffic|routing|performance/i);
    });

    it('handles deeper conversations differently', () => {
      const history = [
        { role: 'user', message: 'hello' },
        { role: 'assistant', message: 'Hi!' },
        { role: 'user', message: 'hello again' },
      ];
      const reply = buildConversationalReply({
        text: 'hello',
        chatHistory: history,
        mode: 'Executive Insight Mode',
      });
      expect(reply).toMatch(/back|again|next|continue|where/i);
    });
  });

  // ── Action summaries ────────────────────────────────────────────────
  describe('buildActionSummaryReply', () => {
    it('lists actions with bullet points', () => {
      const summary = buildActionSummaryReply(
        [
          { type: 'create_project', label: 'Create project "Alpha"' },
          { type: 'create_task', label: 'Create task: review contract' },
        ],
        'Executive Insight Mode'
      );
      expect(summary).toContain('Create project "Alpha"');
      expect(summary).toContain('Create task: review contract');
    });

    it('mentions confirmation when needed', () => {
      const summary = buildActionSummaryReply(
        [{ type: 'fix_broken_workflows', label: 'Fix workflows', requiresConfirmation: true }],
        'Executive Insight Mode'
      );
      expect(summary).toMatch(/confirm/i);
    });

    it('handles empty actions gracefully', () => {
      const summary = buildActionSummaryReply([], 'Executive Insight Mode');
      expect(summary).toMatch(/didn.t detect|rephrase/i);
    });

    it('handles info-only actions', () => {
      const summary = buildActionSummaryReply(
        [{ type: 'info', label: 'About Dashboard metrics' }],
        'Executive Insight Mode'
      );
      expect(summary).toMatch(/insight/i);
    });
  });
});
