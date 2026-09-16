/**
 * [module: frontend]
 *
 * The state machine behind the "watch a team build it" demo.
 *
 * Four phases on a loop: `type` deals the prompt out a character at a time,
 * `process` ticks the steps off, `done` holds the finished picture, `erase`
 * takes the prompt back out and advances to the next scenario.
 *
 * Extracted from `pages/Landing/sections/HeroAnimatedDemo.jsx` so `/standart`
 * can run the identical timing under different chrome. The numbers are that
 * component's own, unchanged - they are tuned, not arbitrary: 28ms per typed
 * character reads as fast typing rather than a ticker, 320ms per step is slow
 * enough to follow, and the 1400ms dwell is the shortest hold that does not feel
 * like the demo is snatching the result away.
 *
 * REDUCED MOTION lands the FINISHED first scenario, seeded into initial state
 * rather than set by an effect. That is the house rule (`useMockPlay` states it
 * too): a reader who asked for less motion gets a finished picture, never a
 * paused one and never a single frame of the empty version.
 *
 * HOVER PAUSES the loop at `done` only. Pausing mid-type would strand a half
 * written sentence under the cursor, which reads as a bug rather than a pause.
 */
import { useCallback, useEffect, useState } from 'react';

/** Milliseconds per character while typing. */
export const TYPE_MS = 28;

/** Milliseconds per character while erasing. Faster - nobody reads a deletion. */
export const ERASE_MS = 14;

/** Gap between one completed step and the next. */
export const STEP_MS = 320;

/** How long the finished state is held before the loop moves on. */
export const DWELL_MS = 1400;

/** The beat between the prompt landing and the first step starting. */
export const SETTLE_MS = 220;

/** The beat between the result cards and the "ships to" row. */
export const DESTINATIONS_MS = 140;

/**
 * @param {import('../data/agentDemoCases').DemoCase[]} cases
 * @param {{ reducedMotion?: boolean }} [opts]
 */
export default function useTypedDemo(cases, { reducedMotion = false } = {}) {
  const [caseIndex, setCaseIndex] = useState(0);
  const [typed, setTyped] = useState(() => (reducedMotion ? cases[0].prompt : ''));
  const [phase, setPhase] = useState(() => (reducedMotion ? 'done' : 'type'));
  const [stepsDone, setStepsDone] = useState(() => (reducedMotion ? cases[0].steps.length : 0));
  const [cardsShown, setCardsShown] = useState(reducedMotion);
  const [destinationsShown, setDestinationsShown] = useState(reducedMotion);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const current = cases[caseIndex];
    const fullPrompt = current.prompt;

    if (phase === 'type') {
      // No reset here. `typed` is '' on the first run and the erase phase types
      // it back down to '' before handing over, so clearing it again would be a
      // synchronous setState in an effect body that changes nothing.
      let i = 0;
      const id = setInterval(() => {
        i += 1;
        setTyped(fullPrompt.slice(0, i));
        if (i >= fullPrompt.length) {
          clearInterval(id);
          setTimeout(() => setPhase('process'), SETTLE_MS);
        }
      }, TYPE_MS);
      return () => clearInterval(id);
    }

    if (phase === 'process') {
      // Likewise: the erase phase zeroes the counters on its way out.
      const stepCount = current.steps.length;
      const timers = current.steps.map((_, i) =>
        setTimeout(
          () => {
            setStepsDone(i + 1);
            if (i === stepCount - 1) {
              setCardsShown(true);
              setPhase('done');
            }
          },
          STEP_MS * (i + 1)
        )
      );
      return () => timers.forEach(clearTimeout);
    }

    if (phase === 'erase') {
      let i = fullPrompt.length;
      const id = setInterval(() => {
        i -= 1;
        setTyped(fullPrompt.slice(0, Math.max(0, i)));
        if (i <= 0) {
          clearInterval(id);
          setCaseIndex((p) => (p + 1) % cases.length);
          setPhase('type');
        }
      }, ERASE_MS);
      return () => clearInterval(id);
    }

    return undefined;
  }, [phase, caseIndex, cases, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    if (phase !== 'done') return undefined;
    const destTimer = setTimeout(() => setDestinationsShown(true), DESTINATIONS_MS);
    // The dwell timer is the only thing hover suppresses; the "ships to" row
    // still arrives, so pausing on a half-drawn card is not possible.
    if (hovered) return () => clearTimeout(destTimer);
    // The counters are zeroed HERE, on the way into erase, rather than inside
    // the erase branch - a setState in an effect body is a cascading render, and
    // in a timeout it is just a state change.
    const eraseTimer = setTimeout(() => {
      setCardsShown(false);
      setDestinationsShown(false);
      setStepsDone(0);
      setPhase('erase');
    }, DWELL_MS);
    return () => {
      clearTimeout(destTimer);
      clearTimeout(eraseTimer);
    };
  }, [phase, hovered, reducedMotion]);

  const onMouseEnter = useCallback(() => setHovered(true), []);
  const onMouseLeave = useCallback(() => setHovered(false), []);

  return {
    caseIndex,
    current: cases[caseIndex],
    typed,
    phase,
    stepsDone,
    cardsShown,
    destinationsShown,
    /** True once the step list should be on screen at all. */
    rowsVisible: cardsShown || phase === 'process',
    /** Spread onto the frame to pause the loop while the cursor is over it. */
    hoverProps: { onMouseEnter, onMouseLeave },
  };
}
