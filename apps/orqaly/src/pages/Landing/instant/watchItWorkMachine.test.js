import { describe, expect, it } from 'vitest';
import {
  BUILD_MS,
  INTRO_ASK_MS,
  INTRO_MS,
  INTRO_PLAN_MS,
  INTRO_TYPED_MS,
  NODE_MS,
  QUESTION_MS,
  RESULTS_MS,
  STEP_COUNT,
  TICK_MS,
  activeStep,
  answeredCount,
  fileStatus,
  initialState,
  introBeat,
  reducer,
  typedCount,
  workspaceStatus,
} from './watchItWorkMachine';

const run = (state, ...actions) => actions.reduce(reducer, state);
const tick = (node, elapsed, requestLength = 80) => ({
  type: 'TICK',
  node,
  elapsed,
  requestLength,
});
const start = (choice, reducedMotion = false) => ({ type: 'START', choice, reducedMotion });
const answer = (question, option) => ({ type: 'ANSWER', question, option });

const first = initialState('business');
const awaitingAnswers = run(first, start('ask'), tick('question', QUESTION_MS));

describe('watchItWorkMachine', () => {
  it('keeps the agreed durations', () => {
    expect([TICK_MS, INTRO_MS, QUESTION_MS, BUILD_MS, RESULTS_MS]).toEqual([
      80, 5200, 600, 4200, 1800,
    ]);
    expect(NODE_MS).toEqual({ intro: 5200, question: 600, build: 4200, results: 1800 });
    expect(INTRO_TYPED_MS).toBeLessThan(INTRO_PLAN_MS);
    expect(INTRO_PLAN_MS).toBeLessThan(INTRO_ASK_MS);
    expect(INTRO_ASK_MS).toBeLessThan(INTRO_MS);
  });

  it('opens on the gate, idle, with step 1 in progress and the visitor needed', () => {
    expect(first).toEqual({
      sceneId: 'business',
      node: 'gate',
      elapsed: 0,
      playback: 'idle',
      choice: null,
      answers: [null, null, null],
      assumptions: false,
    });
    expect(activeStep(first)).toBe(0);
    expect(workspaceStatus(first)).toBe('waiting');
    expect(introBeat(first)).toBe(3);
    expect(typedCount(first, 80)).toBe(80);
  });

  it('walks the ask path: question, answer, build, results, complete', () => {
    const question = reducer(first, start('ask'));
    expect(question).toMatchObject({
      node: 'question',
      playback: 'playing',
      elapsed: 0,
      choice: 'ask',
      assumptions: false,
    });
    expect(workspaceStatus(question)).toBe('working');

    expect(awaitingAnswers).toMatchObject({ node: 'answer', playback: 'awaiting', elapsed: 0 });
    expect(workspaceStatus(awaitingAnswers)).toBe('waiting');

    const build = run(awaitingAnswers, answer(0, 0), { type: 'SEND' });
    expect(build).toMatchObject({
      node: 'build',
      playback: 'playing',
      elapsed: 0,
      answers: [0, null, null],
      assumptions: false,
    });
    expect(workspaceStatus(build)).toBe('working');

    const results = reducer(build, tick('build', BUILD_MS));
    expect(results).toMatchObject({ node: 'results', playback: 'playing', elapsed: 0 });
    expect(activeStep(results)).toBe(STEP_COUNT);

    const complete = reducer(results, tick('results', RESULTS_MS));
    expect(complete).toMatchObject({ node: 'complete', playback: 'complete', elapsed: 0 });
    expect(workspaceStatus(complete)).toBe('done');
    expect(complete.answers).toEqual([0, null, null]);
  });

  it('jumps from the gate straight to build, with assumptions, on "proceed"', () => {
    const build = reducer(first, start('proceed'));
    expect(build).toMatchObject({
      node: 'build',
      playback: 'playing',
      choice: 'proceed',
      assumptions: true,
    });
    const complete = run(build, tick('build', BUILD_MS), tick('results', RESULTS_MS));
    expect(complete).toMatchObject({ node: 'complete', assumptions: true });
  });

  it('starts only from the gate and only with a known choice', () => {
    expect(reducer(first, start())).toBe(first);
    expect(reducer(first, start('later'))).toBe(first);
    expect(reducer(awaitingAnswers, start('proceed'))).toBe(awaitingAnswers);
  });

  it('never answers for the visitor: gates ignore the clock, pause and resume', () => {
    for (const gate of [first, awaitingAnswers]) {
      expect(reducer(gate, tick(gate.node, 120_000))).toBe(gate);
      expect(reducer(gate, { type: 'PAUSE', elapsed: 10 })).toBe(gate);
      expect(reducer(gate, { type: 'RESUME' })).toBe(gate);
    }
    expect(reducer(awaitingAnswers, { type: 'SEND' })).toBe(awaitingAnswers);
  });

  it('records one choice per question and lets the visitor take it back', () => {
    const picked = run(awaitingAnswers, answer(0, 1), answer(0, 2), answer(2, 0));
    expect(picked.answers).toEqual([2, null, 0]);
    expect(answeredCount(picked)).toBe(2);
    expect(reducer(picked, answer(0, 2)).answers).toEqual([null, null, 0]);

    expect(reducer(awaitingAnswers, answer(3, 0))).toBe(awaitingAnswers);
    expect(reducer(awaitingAnswers, answer('length', 0))).toBe(awaitingAnswers);
    expect(reducer(first, answer(0, 0))).toBe(first);
  });

  it('returns the same object from TICK until the visible frame changes', () => {
    const build = reducer(first, start('proceed'));
    const stepMs = BUILD_MS / STEP_COUNT;

    expect(reducer(build, tick('build', TICK_MS))).toBe(build);
    expect(reducer(build, tick('build', stepMs - 1))).toBe(build);

    const second = reducer(build, tick('build', stepMs));
    expect(second).not.toBe(build);
    expect(second.elapsed).toBe(stepMs);
    expect(activeStep(second)).toBe(1);
    expect(reducer(second, tick('build', stepMs + TICK_MS))).toBe(second);

    const question = reducer(first, start('ask'));
    expect(reducer(question, tick('question', QUESTION_MS - 1))).toBe(question);
  });

  it('ticks the five roadmap steps one by one during build', () => {
    const build = reducer(first, start('proceed'));
    const seen = [];
    let state = build;
    for (let elapsed = 0; elapsed < BUILD_MS; elapsed += TICK_MS) {
      state = reducer(state, tick('build', elapsed));
      if (seen.at(-1) !== activeStep(state)) seen.push(activeStep(state));
    }
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    expect(state.node).toBe('build');
  });

  it('fills each Workspace file in with the roadmap step that writes it', () => {
    const statuses = (state) => [0, 1, 2, 3, 4].map((step) => fileStatus(step, state));
    const waiting = Array(STEP_COUNT).fill('waiting');
    // Before the build nothing is written, not even step 1's file on the gate.
    expect(statuses(first)).toEqual(waiting);
    expect(statuses(run(first, { type: 'PLAY_INTRO' }, tick('intro', INTRO_ASK_MS)))).toEqual(
      waiting
    );
    expect(statuses(awaitingAnswers)).toEqual(waiting);

    const build = reducer(first, start('proceed'));
    expect(statuses(build)).toEqual(['writing', 'waiting', 'waiting', 'waiting', 'waiting']);
    expect(statuses(reducer(build, tick('build', BUILD_MS / 2)))).toEqual([
      'done',
      'done',
      'writing',
      'waiting',
      'waiting',
    ]);
    // A pause keeps the file being written as it was.
    const paused = run(build, tick('build', BUILD_MS / 2), { type: 'PAUSE' });
    expect(fileStatus(2, paused)).toBe('writing');

    const results = run(build, tick('build', BUILD_MS));
    expect(statuses(results)).toEqual(Array(STEP_COUNT).fill('done'));
    expect(statuses(run(results, tick('results', RESULTS_MS)))).toEqual(
      Array(STEP_COUNT).fill('done')
    );
    expect(statuses(reducer(results, { type: 'REPLAY' }))).toEqual(waiting);
  });

  it('ignores a tick left over from the previous node', () => {
    const results = run(first, start('proceed'), tick('build', BUILD_MS));
    expect(reducer(results, tick('build', BUILD_MS + TICK_MS))).toBe(results);
    expect(reducer(results, { type: 'TICK', elapsed: RESULTS_MS })).toBe(results);
  });

  it('keeps elapsed across pause and resume, and stays still while paused', () => {
    const build = reducer(first, start('proceed'));
    const paused = reducer(build, { type: 'PAUSE', elapsed: 1234 });
    expect(paused).toMatchObject({ node: 'build', playback: 'paused', elapsed: 1234 });
    expect(activeStep(paused)).toBe(1);
    expect(reducer(paused, tick('build', 4000))).toBe(paused);
    expect(reducer(paused, { type: 'PAUSE', elapsed: 2000 })).toBe(paused);

    const resumed = reducer(paused, { type: 'RESUME' });
    expect(resumed).toMatchObject({ node: 'build', playback: 'playing', elapsed: 1234 });
    expect(reducer(build, { type: 'RESUME' })).toBe(build);

    expect(reducer(build, { type: 'PAUSE' }).elapsed).toBe(0);
    expect(reducer(build, { type: 'PAUSE', elapsed: 99_999 }).elapsed).toBe(BUILD_MS);
    expect(reducer(build, { type: 'PAUSE', elapsed: -5 }).elapsed).toBe(0);
  });

  it('skips to the results, keeping answers when there are any', () => {
    expect(reducer(first, { type: 'SKIP' })).toMatchObject({
      node: 'results',
      playback: 'playing',
      assumptions: true,
    });
    expect(reducer(awaitingAnswers, { type: 'SKIP' })).toMatchObject({
      node: 'results',
      assumptions: true,
    });
    const answered = run(awaitingAnswers, answer(1, 1), { type: 'SKIP' });
    expect(answered).toMatchObject({ node: 'results', assumptions: false });
    expect(answered.answers).toEqual([null, 1, null]);

    const complete = reducer(answered, { type: 'SKIP' });
    expect(complete).toMatchObject({ node: 'complete', playback: 'complete' });
    expect(reducer(complete, { type: 'SKIP' })).toBe(complete);
  });

  it('replays the same scene and resets to another one from any node', () => {
    const complete = run(
      awaitingAnswers,
      answer(0, 0),
      { type: 'SEND' },
      tick('build', BUILD_MS),
      tick('results', RESULTS_MS)
    );
    expect(reducer(complete, { type: 'REPLAY' })).toEqual(first);

    const building = reducer(first, start('proceed'));
    expect(reducer(building, { type: 'RESET', sceneId: 'campaign' })).toEqual(
      initialState('campaign')
    );
    expect(reducer(building, { type: 'RESET' })).toEqual(first);
  });

  it('plays the typed intro only from the idle first frame, and ends it on the gate', () => {
    const intro = reducer(first, { type: 'PLAY_INTRO' });
    expect(intro).toMatchObject({ node: 'intro', playback: 'playing', elapsed: 0 });
    expect(introBeat(intro)).toBe(0);
    expect(typedCount(intro, 80)).toBe(0);

    // 10 characters over the typing beat: one new character every 300 ms.
    const charMs = INTRO_TYPED_MS / 10;
    expect(reducer(intro, tick('intro', charMs - 1, 10))).toBe(intro);
    const oneTyped = reducer(intro, tick('intro', charMs, 10));
    expect(typedCount(oneTyped, 10)).toBe(1);
    expect(reducer(oneTyped, tick('intro', charMs + TICK_MS, 10))).toBe(oneTyped);

    const beats = [INTRO_TYPED_MS, INTRO_PLAN_MS, INTRO_ASK_MS].map((elapsed) =>
      introBeat(reducer(intro, tick('intro', elapsed, 10)))
    );
    expect(beats).toEqual([1, 2, 3]);
    expect(typedCount(reducer(intro, tick('intro', INTRO_PLAN_MS, 10)), 10)).toBe(10);

    const gate = reducer(intro, tick('intro', INTRO_MS, 10));
    expect(gate).toMatchObject({ node: 'gate', playback: 'awaiting', choice: null });
    expect(reducer(gate, { type: 'PLAY_INTRO' })).toBe(gate);
    expect(reducer(awaitingAnswers, { type: 'PLAY_INTRO' })).toBe(awaitingAnswers);
  });

  it('never plays under reduced motion: every action lands on a gate or on complete', () => {
    const asked = reducer(first, start('ask', true));
    expect(asked).toMatchObject({ node: 'answer', playback: 'awaiting', choice: 'ask' });

    const sent = run(asked, answer(2, 1), { type: 'SEND', reducedMotion: true });
    expect(sent).toMatchObject({ node: 'complete', playback: 'complete', assumptions: false });

    expect(reducer(first, start('proceed', true))).toMatchObject({
      node: 'complete',
      playback: 'complete',
      assumptions: true,
    });
    expect(reducer(first, { type: 'SKIP', reducedMotion: true })).toMatchObject({
      node: 'complete',
      assumptions: true,
    });
    expect(reducer(first, { type: 'PLAY_INTRO', reducedMotion: true })).toMatchObject({
      node: 'gate',
      playback: 'awaiting',
    });

    const paused = run(first, start('proceed'), { type: 'PAUSE', elapsed: 900 });
    expect(reducer(paused, { type: 'RESUME', reducedMotion: true })).toMatchObject({
      node: 'complete',
      playback: 'complete',
    });
  });

  it('returns the same state for an unknown action', () => {
    expect(reducer(first, { type: 'NOPE' })).toBe(first);
  });
});
