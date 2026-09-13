import { describe, it, expect } from 'vitest';
import {
  buildTranscript,
  composerRole,
  composerCopy,
  composerTalksToLead,
  TRANSCRIPT_KINDS,
  INTRO_TEXT,
} from './newGoalTranscript';

const kinds = (state) => buildTranscript(state).map((m) => m.kind);
const byKind = (state, kind) => buildTranscript(state).find((m) => m.kind === kind);

describe('buildTranscript', () => {
  it('opens with the intro and the goal setup before anything is typed', () => {
    const t = buildTranscript();
    expect(t[0]).toMatchObject({ kind: 'intro', role: 'assistant', text: INTRO_TEXT });
    expect(kinds()).toEqual(['intro', 'setup', 'approve']);
  });

  it('adds the request as a user message once something is typed', () => {
    const t = buildTranscript({ simpleInput: '  Design a landing page  ' });
    expect(t[1]).toMatchObject({ kind: 'request', role: 'user', text: 'Design a landing page' });
  });

  it('ignores whitespace-only input', () => {
    expect(kinds({ simpleInput: '   \n  ' })).not.toContain('request');
  });

  it('keeps every message assistant-authored except the request', () => {
    const t = buildTranscript({
      simpleInput: 'x',
      structuredResult: { title: 'T' },
      createdGoal: { id: 'g1' },
    });
    const users = t.filter((m) => m.role === 'user');
    expect(users).toHaveLength(1);
    expect(users[0].kind).toBe('request');
  });

  // Materials, Tools and Destination are the goal's own configuration, so they
  // ride on the Setup card that governs them rather than trailing it as a
  // separate message. Auto shows them locked, Manual unlocks the same three.
  it('carries the setup on one message in both Auto and Manual', () => {
    expect(kinds({ setupManual: false })).toEqual(['intro', 'setup', 'approve']);
    expect(byKind({ setupManual: false }, 'setup').manual).toBe(false);
    expect(byKind({ setupManual: true }, 'setup').manual).toBe(true);
  });

  // Auto cannot pick a workspace that does not exist. Mirrors Step1Blocks,
  // which unlocks Destination for the same reason.
  it('forces the blocks open in Auto when no workspace could be loaded', () => {
    const setup = byKind({ setupManual: false, organizationLoadError: 'boom' }, 'setup');
    expect(setup.forced).toBe(true);
  });

  it('does not mark the blocks forced when the user chose Manual', () => {
    expect(byKind({ setupManual: true, organizationLoadError: 'boom' }, 'setup').forced).toBe(
      false
    );
  });

  it('carries the switch positions so the cards render the live value', () => {
    expect(byKind({ setupManual: true }, 'setup').manual).toBe(true);
    expect(byKind({ humanApprove: true }, 'approve').enabled).toBe(true);
  });

  it('shows thinking only while analysis is in flight', () => {
    expect(kinds({ simplePhase: 'processing' })).toContain('thinking');
    expect(kinds({ simplePhase: 'input' })).not.toContain('thinking');
    expect(kinds({ simplePhase: 'result' })).not.toContain('thinking');
  });

  it('renders the brief with everything the analysis produced', () => {
    const brief = byKind(
      {
        structuredResult: { title: 'Sunglasses page', category: 'design', priority: 'high' },
        complexity: 'complex',
        budgetUsd: 6,
        expectedResults: 'A responsive page',
        extracted: { goal: 'landing page' },
        suggestions: ['Which brand?'],
      },
      'brief'
    );
    expect(brief).toMatchObject({
      title: 'Sunglasses page',
      category: 'design',
      priority: 'high',
      complexity: 'complex',
      budgetUsd: 6,
      expectedResults: 'A responsive page',
      suggestions: ['Which brand?'],
    });
  });

  it('falls back to sane defaults for a partial brief', () => {
    const brief = byKind({ structuredResult: {} }, 'brief');
    expect(brief).toMatchObject({ title: '', category: 'other', priority: 'medium' });
    expect(brief.suggestions).toEqual([]);
  });

  it('tolerates suggestions arriving as a non-array', () => {
    const brief = byKind({ structuredResult: {}, suggestions: 'nope' }, 'brief');
    expect(brief.suggestions).toEqual([]);
  });

  it('surfaces an analysis error as its own message', () => {
    expect(byKind({ aiError: 'LLM unavailable' }, 'error').message).toBe('LLM unavailable');
  });

  it('shows the error alongside the brief when analysis half-failed', () => {
    const k = kinds({ structuredResult: { title: 'T' }, aiError: 'partial' });
    expect(k).toContain('brief');
    expect(k).toContain('error');
    expect(k.indexOf('brief')).toBeLessThan(k.indexOf('error'));
  });

  it('closes with the launch message once the goal exists', () => {
    const t = buildTranscript({ simpleInput: 'x', createdGoal: { id: 'g1', title: 'Made' } });
    expect(t[t.length - 1]).toMatchObject({ kind: 'launched', goalId: 'g1', title: 'Made' });
  });

  it('names the launch from the brief when the goal row has no title', () => {
    const m = byKind(
      { createdGoal: { id: 'g1' }, structuredResult: { title: 'From brief' } },
      'launched'
    );
    expect(m.title).toBe('From brief');
  });

  it('names the launch from the typed text when nothing else is available', () => {
    const m = byKind({ simpleInput: 'Just this', createdGoal: { id: 'g1' } }, 'launched');
    expect(m.title).toBe('Just this');
  });

  it('holds the thread in order through a whole step 1', () => {
    expect(
      kinds({
        simpleInput: 'Design a landing page',
        simplePhase: 'result',
        setupManual: true,
        humanApprove: true,
        structuredResult: { title: 'T' },
        createdGoal: { id: 'g1' },
      })
    ).toEqual(['intro', 'request', 'setup', 'approve', 'brief', 'launched']);
  });

  it('only ever emits known kinds', () => {
    const everything = buildTranscript({
      simpleInput: 'x',
      simplePhase: 'processing',
      setupManual: true,
      structuredResult: { title: 'T' },
      aiError: 'e',
      createdGoal: { id: 'g' },
    });
    everything.forEach((m) => expect(TRANSCRIPT_KINDS).toContain(m.kind));
  });

  // Unstable ids would remount the live controls these messages carry, and
  // KbPicker refetches on mount — a network call per keystroke.
  it('derives stable ids, so equal state yields equal keys', () => {
    const state = { simpleInput: 'x', setupManual: true, structuredResult: { title: 'T' } };
    expect(buildTranscript(state).map((m) => m.id)).toEqual(
      buildTranscript(state).map((m) => m.id)
    );
  });

  it('gives every message a unique id', () => {
    const ids = buildTranscript({
      simpleInput: 'x',
      simplePhase: 'processing',
      setupManual: true,
      structuredResult: { title: 'T' },
      aiError: 'e',
      createdGoal: { id: 'g' },
    }).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('composerRole', () => {
  it('describes the goal before one exists', () => {
    expect(composerRole(undefined, { hasGoal: false })).toBe('describe');
    expect(composerRole('active', { hasGoal: false })).toBe('describe');
  });

  it('is sent, with nowhere to send to, between the send and the goal', () => {
    expect(composerRole(undefined, { hasGoal: false, sent: true })).toBe('sent');
    // Once the goal exists, sent no longer matters: the lead is the destination.
    expect(composerRole('planning', { hasGoal: true, sent: true })).toBe('lead');
    expect(composerTalksToLead('sent')).toBe(false);
    expect(composerTalksToLead('describe')).toBe(false);
  });

  it('routes every role with a goal behind it to the team lead', () => {
    ['lead', 'revise', 'answer', 'done'].forEach((r) => expect(composerTalksToLead(r)).toBe(true));
  });

  it('talks to the team lead while the goal runs', () => {
    ['feasibility', 'planning', 'forming_team', 'active'].forEach((s) =>
      expect(composerRole(s, { hasGoal: true })).toBe('lead')
    );
  });

  it('takes revision feedback at either approval gate', () => {
    expect(composerRole('awaiting_context_approval', { hasGoal: true })).toBe('revise');
    expect(composerRole('awaiting_approval', { hasGoal: true })).toBe('revise');
  });

  it('answers the product owner when it is asking', () => {
    expect(composerRole('awaiting_po_input', { hasGoal: true })).toBe('answer');
  });

  it('offers a follow-up once the run is over', () => {
    ['completed', 'failed', 'cancelled'].forEach((s) =>
      expect(composerRole(s, { hasGoal: true })).toBe('done')
    );
  });

  // The composer is permanent, so every role it can take must have copy.
  it('has copy for every role it can return', () => {
    const roles = ['describe', 'sent', 'lead', 'revise', 'answer', 'done'];
    roles.forEach((r) => {
      expect(composerCopy(r).state).toBeTruthy();
      expect(composerCopy(r).placeholder).toBeTruthy();
      // House style: a plain hyphen, never an em or en dash.
      expect(composerCopy(r).state).not.toMatch(/[\u2013\u2014]/);
      expect(composerCopy(r).placeholder).not.toMatch(/[\u2013\u2014]/);
    });
  });

  // Before the send there is no thread to read the state from, so the label is
  // the only thing saying what the box is for.
  it('draws its state above the box only while describing the goal', () => {
    expect(composerCopy('describe').line).toBe('Describing your goal');
  });

  // After it, everything the label would say is already on screen: the request
  // is in the thread, the run reports underneath it, the gates are their own
  // cards. A label restating that sits where the eye lands before typing.
  it('draws nothing above the box once the request is sent', () => {
    ['sent', 'lead', 'revise', 'answer', 'done'].forEach((r) =>
      expect(composerCopy(r).line).toBeNull()
    );
  });

  // Gone from the screen, not gone: it is what a screen reader announces when
  // the box takes focus.
  it('keeps every role named for anything that is not a pair of eyes', () => {
    expect(composerCopy('sent').state).toBe('Sent - preparing your brief');
    expect(composerCopy('lead').state).toBe('Running - messages go to your team lead');
    ['describe', 'sent', 'lead', 'revise', 'answer', 'done'].forEach((r) =>
      expect(composerCopy(r).state).toBeTruthy()
    );
  });

  it('falls back to describe copy for an unknown role', () => {
    expect(composerCopy('nonsense')).toEqual(composerCopy('describe'));
  });
});

describe('buildTranscript - reopening an existing goal', () => {
  // The goal already made these choices. Replaying the intro and the Setup card
  // would offer them again, on a goal that has already run.
  it('draws no creation form when resumed', () => {
    expect(buildTranscript({ resumed: true })).toEqual([]);
  });

  it('ignores the form state entirely when resumed', () => {
    expect(
      buildTranscript({
        resumed: true,
        simpleInput: 'still typing',
        submittedText: 'already sent',
        simplePhase: 'result',
        createdGoal: { id: 'g1', title: 'Ship it' },
      })
    ).toEqual([]);
  });

  it('still builds the form when not resumed', () => {
    expect(buildTranscript({ simpleInput: 'do a thing' }).length).toBeGreaterThan(0);
  });
});
