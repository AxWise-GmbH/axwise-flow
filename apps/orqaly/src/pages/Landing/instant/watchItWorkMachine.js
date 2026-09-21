/*
 * The "Watch it work" demo as a pure state machine.
 *
 *   gate -> [START ask] -> question (timed) -> answer -> [SEND] -> build (timed)
 *        -> results (timed) -> complete
 *   gate -> [START proceed] -> build, with assumptions
 *   gate -> [PLAY_INTRO] -> intro (timed) -> gate
 *
 * Only timed nodes play. 'gate' and 'answer' wait for the visitor, so the machine can never
 * answer for them: no action other than START and SEND leaves those nodes forwards.
 */

export const TICK_MS = 80;
export const INTRO_MS = 5200;
export const QUESTION_MS = 600;
export const BUILD_MS = 4200;
export const RESULTS_MS = 1800;

export const STEP_COUNT = 5;
export const QUESTION_COUNT = 3;

// Beats inside the intro: the request finishes typing, then each reply line lands.
export const INTRO_TYPED_MS = 3000;
export const INTRO_PLAN_MS = 3700;
export const INTRO_ASK_MS = 4400;

export const NODE_MS = {
  intro: INTRO_MS,
  question: QUESTION_MS,
  build: BUILD_MS,
  results: RESULTS_MS,
};

const NEXT_NODE = { intro: 'gate', question: 'answer', build: 'results', results: 'complete' };

export function initialState(sceneId) {
  return {
    sceneId,
    node: 'gate',
    elapsed: 0,
    playback: 'idle',
    choice: null,
    answers: Array(QUESTION_COUNT).fill(null),
    assumptions: false,
  };
}

export function answeredCount(state) {
  return state.answers.filter((answer) => answer !== null).length;
}

/** 0 typing · 1 request sent · 2 plan reply shown · 3 ask line shown */
export function introBeat(state) {
  if (state.node !== 'intro') return 3;
  if (state.elapsed < INTRO_TYPED_MS) return 0;
  if (state.elapsed < INTRO_PLAN_MS) return 1;
  return state.elapsed < INTRO_ASK_MS ? 2 : 3;
}

export function typedCount(state, requestLength) {
  if (state.node !== 'intro') return requestLength;
  return Math.floor(Math.min(state.elapsed / INTRO_TYPED_MS, 1) * requestLength);
}

/** Index of the roadmap step in progress; STEP_COUNT once every step is done. */
export function activeStep(state) {
  if (state.node === 'results' || state.node === 'complete') return STEP_COUNT;
  if (state.node !== 'build') return 0;
  return Math.min(STEP_COUNT - 1, Math.floor(state.elapsed / (BUILD_MS / STEP_COUNT)));
}

/**
 * Where a Workspace file stands, from the roadmap step that writes it: 'done' once that step
 * is behind the run, 'writing' while the build is on it, 'waiting' before either.
 */
export function fileStatus(step, state) {
  const current = activeStep(state);
  if (step < current) return 'done';
  return step === current && state.node === 'build' ? 'writing' : 'waiting';
}

export function workspaceStatus(state) {
  if (state.node === 'gate' || state.node === 'answer') return 'waiting';
  return state.node === 'results' || state.node === 'complete' ? 'done' : 'working';
}

function frameOf(state, requestLength) {
  if (state.node === 'intro') return `${introBeat(state)}:${typedCount(state, requestLength)}`;
  return activeStep(state);
}

function enter(state, node, reducedMotion = false) {
  let target = node;
  // Reduced motion never rests on a timed node; it lands where the visitor acts next.
  while (reducedMotion && target in NODE_MS) target = NEXT_NODE[target];
  const playback = target in NODE_MS ? 'playing' : target === 'complete' ? 'complete' : 'awaiting';
  return { ...state, node: target, elapsed: 0, playback };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'PLAY_INTRO':
      if (state.node !== 'gate' || state.playback !== 'idle') return state;
      return enter(state, 'intro', action.reducedMotion);

    case 'START':
      if (state.node !== 'gate') return state;
      if (action.choice === 'ask') {
        return enter({ ...state, choice: 'ask' }, 'question', action.reducedMotion);
      }
      if (action.choice === 'proceed') {
        return enter(
          { ...state, choice: 'proceed', assumptions: true },
          'build',
          action.reducedMotion
        );
      }
      return state;

    case 'ANSWER': {
      const known = Number.isInteger(action.question) && action.question in state.answers;
      if (state.node !== 'answer' || !known) return state;
      const answers = state.answers.map((answer, index) => {
        if (index !== action.question) return answer;
        return answer === action.option ? null : action.option;
      });
      return { ...state, answers };
    }

    case 'SEND':
      if (state.node !== 'answer' || answeredCount(state) === 0) return state;
      return enter(state, 'build', action.reducedMotion);

    case 'TICK': {
      // A tick that was queued by the previous node's interval must not age this one.
      if (state.playback !== 'playing' || action.node !== state.node) return state;
      if (action.elapsed >= NODE_MS[state.node]) return enter(state, NEXT_NODE[state.node]);
      const next = { ...state, elapsed: action.elapsed };
      // Same frame, same object: React skips the render for most of the 12 ticks a second.
      return frameOf(next, action.requestLength) === frameOf(state, action.requestLength)
        ? state
        : next;
    }

    case 'PAUSE': {
      if (state.playback !== 'playing') return state;
      // state.elapsed only moves on frame changes, so the caller passes the clock's real value.
      const elapsed = Math.min(Math.max(action.elapsed ?? state.elapsed, 0), NODE_MS[state.node]);
      return { ...state, playback: 'paused', elapsed };
    }

    case 'RESUME':
      if (state.playback !== 'paused') return state;
      if (action.reducedMotion) return enter(state, state.node, true);
      return { ...state, playback: 'playing' };

    case 'SKIP':
      if (state.node === 'complete') return state;
      if (state.node === 'results') return enter(state, 'complete');
      return enter(
        { ...state, assumptions: state.assumptions || answeredCount(state) === 0 },
        'results',
        action.reducedMotion
      );

    case 'REPLAY':
      return initialState(state.sceneId);

    case 'RESET':
      return initialState(action.sceneId ?? state.sceneId);

    default:
      return state;
  }
}
