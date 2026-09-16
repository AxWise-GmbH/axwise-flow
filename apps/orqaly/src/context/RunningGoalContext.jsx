import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * The goal the user is currently watching, published to the app shell.
 *
 * The Simple thread's own header carries the goal's Actions menu, and that
 * header scrolls with the conversation - so on any run longer than a screen the
 * one control that can pause, cancel or hand off the goal scrolls out of reach
 * exactly when the run is long enough to want it. Moving the button to the
 * fixed top bar fixes that, but the top bar is app-wide chrome and the goal
 * lives several levels down inside a page. This is the wire between them.
 *
 * Deliberately one goal, not a list. The top bar has one Actions button, and a
 * second surface publishing over the first would be a bug, not a feature - the
 * last mount wins and clears on unmount.
 */

const RunningGoalContext = createContext(null);

/**
 * The fields anything downstream actually reads.
 *
 * Publishing happens whenever the page re-renders, and a live goal re-renders
 * once a second while its clock ticks. Comparing on these rather than on
 * identity is what keeps that from being a state update per second - and per
 * second is enough to keep the whole shell re-rendering forever.
 */
const WATCHED = [
  'id',
  'title',
  'status',
  'autopilot_enabled',
  'loop_enabled',
  'workflow_id',
  'continuation_goal_id',
];

function sameGoal(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return WATCHED.every((key) => a[key] === b[key]);
}

const NO_HANDLERS = {};

export function RunningGoalProvider({ children }) {
  const [goal, setGoal] = useState(null);
  // The publisher's callbacks are behaviour, not data: nothing needs to
  // re-render because a callback got a new identity, and they get a new one on
  // nearly every render of the page that owns them. So they ride a ref, and the
  // shell is handed stable wrappers that read it when called rather than when
  // rendered.
  const handlersRef = useRef(NO_HANDLERS);

  const publish = useCallback((next, handlers) => {
    handlersRef.current = handlers || NO_HANDLERS;
    setGoal((prev) => (sameGoal(prev, next) ? prev : next || null));
  }, []);

  const clear = useCallback(() => {
    handlersRef.current = NO_HANDLERS;
    setGoal(null);
  }, []);

  const onRefresh = useCallback((...args) => handlersRef.current.onRefresh?.(...args), []);
  const onOpenGoal = useCallback((...args) => handlersRef.current.onOpenGoal?.(...args), []);
  const onLeave = useCallback((...args) => handlersRef.current.onLeave?.(...args), []);

  const handlers = useMemo(
    () => ({ onRefresh, onOpenGoal, onLeave }),
    [onRefresh, onOpenGoal, onLeave]
  );

  const value = useMemo(
    () => ({ goal, publish, clear, handlers }),
    [goal, publish, clear, handlers]
  );

  return <RunningGoalContext.Provider value={value}>{children}</RunningGoalContext.Provider>;
}

/**
 * Read the published goal.
 *
 * Returns a null goal outside a provider rather than throwing: the top bar
 * renders in contexts that have no page under them, and a missing goal is the
 * normal state, not an error.
 */
export function useRunningGoal() {
  const ctx = useContext(RunningGoalContext);
  return { goal: ctx?.goal || null, handlers: ctx?.handlers || NO_HANDLERS };
}

/**
 * Publish a goal for as long as this component is mounted.
 *
 * Pass null to publish nothing. Clearing on unmount is the point: navigate away
 * from the thread and the Actions button goes with it, rather than leaving the
 * shell offering to cancel a goal the user is no longer looking at.
 */
export function usePublishRunningGoal(goal, handlers) {
  const ctx = useContext(RunningGoalContext);
  const publish = ctx?.publish;
  const clear = ctx?.clear;
  const handlersRef = useRef(NO_HANDLERS);

  // Declared before the publish effect so it has already run by the time that
  // one fires. Writing the ref during render would be a render-phase side
  // effect, which is exactly the thing that breaks under concurrent rendering.
  useEffect(() => {
    handlersRef.current = handlers || NO_HANDLERS;
  });

  useEffect(() => {
    publish?.(goal || null, handlersRef.current);
  }, [publish, goal]);

  useEffect(() => (clear ? () => clear() : undefined), [clear]);
}

export default RunningGoalContext;
