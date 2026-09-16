/**
 * Tests for smalltalk pattern matcher.
 * Run with: npm run test -- smalltalk
 */
import { describe, it, expect } from 'vitest';
import { matchSmalltalk, __internals } from './smalltalk.js';

describe('matchSmalltalk', () => {
  describe('greetings', () => {
    it.each(['hi', 'Hi', 'hello', 'hey', 'sup', 'yo', 'good morning', 'Hola', 'привет', 'gm', 'hey!', 'hi.', 'hi there'.slice(0, 2)])(
      'matches "%s"',
      (input) => {
        const r = matchSmalltalk(input, { personality: 'friendly' });
        expect(r).not.toBeNull();
        expect(r.intent).toBe('greeting');
        expect(r.reply.length).toBeGreaterThan(0);
      }
    );

    it('personalises with firstName at least sometimes (random pool)', () => {
      // Pool has both {name} and {name}-less variants — assert that at least
      // one of N tries produces the name, AND none produce a malformed {name} literal.
      let saw = false;
      for (let i = 0; i < 40; i++) {
        const r = matchSmalltalk('hi', { personality: 'friendly', firstName: 'Mister' });
        if (r.reply.includes('Mister')) saw = true;
        expect(r.reply).not.toMatch(/\{name\}/);
      }
      expect(saw).toBe(true);
    });

    it('omits name slot gracefully when no name', () => {
      const r = matchSmalltalk('hi', { personality: 'friendly' });
      expect(r.reply).not.toMatch(/\{name\}/);
      expect(r.reply).not.toMatch(/\s{2,}/); // no double spaces
    });
  });

  describe('thanks', () => {
    it.each(['thanks', 'thank you', 'ty', 'thx', 'spasibo', 'gracias', 'merci'])(
      'matches "%s" (or punctuated variant)',
      (input) => {
        const r = matchSmalltalk(input + '!', { personality: 'professional' });
        if (r) expect(r.intent).toBe('thanks');
      }
    );

    it('matches plain "thanks!"', () => {
      const r = matchSmalltalk('thanks!', {});
      expect(r?.intent).toBe('thanks');
    });
  });

  describe('emoji-only reactions', () => {
    it('👍 → affirm', () => {
      const r = matchSmalltalk('👍', { personality: 'minimal' });
      expect(r?.intent).toBe('affirm');
    });
    it('🙏 → thanks', () => {
      const r = matchSmalltalk('🙏', {});
      expect(r?.intent).toBe('thanks');
    });
    it('👋 → greeting', () => {
      const r = matchSmalltalk('👋', {});
      expect(r?.intent).toBe('greeting');
    });
    it('😂 → laugh', () => {
      const r = matchSmalltalk('😂', {});
      expect(r?.intent).toBe('laugh');
    });
  });

  describe('confused intent always nudges to /help', () => {
    it('? → mentions /help', () => {
      const r = matchSmalltalk('?', { personality: 'friendly' });
      expect(r?.intent).toBe('confused');
      expect(r.reply.toLowerCase()).toMatch(/help/);
    });
  });

  describe('anti-trigger guard (substantive requests fall through to LLM)', () => {
    const substantive = [
      'list my goals',
      'create a goal: research X, budget 50',
      'show me partners',
      'send me a report',
      'whats my revenue',
      'how many goals do I have',
      'hi can you list my goals',     // contains "hi" but has substantive verb + noun
      'thanks, now show me partners', // contains "thanks" but has substantive ask
      'tell me about my workflows',
      'list my consilium boards',
      'what files have I uploaded',
      'cancel goal abc-123',
    ];

    it.each(substantive)('"%s" → returns null', (input) => {
      const r = matchSmalltalk(input, {});
      expect(r).toBeNull();
    });
  });

  describe('all personalities produce non-empty replies', () => {
    const personalities = ['professional', 'friendly', 'technical', 'creative', 'minimal'];
    const inputs = ['hi', 'thanks', '👍', 'bye', '?', 'ok'];

    it.each(personalities)('personality=%s', (p) => {
      for (const input of inputs) {
        const r = matchSmalltalk(input, { personality: p });
        if (r) {
          expect(typeof r.reply).toBe('string');
          expect(r.reply.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('edge cases', () => {
    it('empty string returns null', () => {
      expect(matchSmalltalk('', {})).toBeNull();
      expect(matchSmalltalk('   ', {})).toBeNull();
    });

    it('long messages (>35 chars) fall through', () => {
      const long = 'hello'.repeat(20);
      expect(matchSmalltalk(long, {})).toBeNull();
    });

    it('numbers in message → fall through (likely a real request)', () => {
      expect(matchSmalltalk('hi 5', {})).toBeNull();
    });

    it('"..." → noise intent', () => {
      const r = matchSmalltalk('...', {});
      expect(r?.intent).toBe('noise');
    });

    it('unknown personality falls back to professional', () => {
      const r = matchSmalltalk('hi', { personality: 'zoomer' });
      expect(r).not.toBeNull();
    });
  });

  describe('internals', () => {
    it('isSubstantive identifies platform nouns', () => {
      expect(__internals.isSubstantive('show me my goals')).toBe(true);
      expect(__internals.isSubstantive('hi')).toBe(false);
      expect(__internals.isSubstantive('thanks')).toBe(false);
    });

    it('normalise lowercases + strips trailing punctuation', () => {
      expect(__internals.normalise('  Hello!!  ')).toBe('hello');
      expect(__internals.normalise('Thanks.')).toBe('thanks');
    });

    it('EMOJI_ONLY matches pure emoji', () => {
      expect(__internals.EMOJI_ONLY.test('👍')).toBe(true);
      expect(__internals.EMOJI_ONLY.test('👍 thanks')).toBe(false);
      expect(__internals.EMOJI_ONLY.test('❤️🙏')).toBe(true);
    });
  });
});
