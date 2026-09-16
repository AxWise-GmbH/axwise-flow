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
 * The assistant conversation the user is currently in, published to the shell.
 *
 * Sibling of RunningGoalContext, and for the same reason. A goal publishes
 * itself so the top bar can offer Actions and "+ New"; a chat publishes itself
 * so the top bar can offer the same "+ New" in that same slot, rather than
 * tucking it in beside the Assistant/Goal pills where it crowded the composer
 * and had to be hovered to be understood.
 *
 * Deliberately one conversation, not a list: the top bar has one such button,
 * and a second surface publishing over the first would be a bug. Last mount
 * wins, and it clears on unmount.
 */

const AssistantConversationContext = createContext(null);

const NOOP = () => {};

export function AssistantConversationProvider({ children }) {
  const [active, setActive] = useState(false);
  // The handler is behaviour, not data. It rides a ref so the shell can be
  // handed one stable wrapper instead of re-rendering whenever the page that
  // owns the conversation gives its callback a new identity.
  const handlerRef = useRef(NOOP);

  const publish = useCallback((isActive, onNewChat) => {
    handlerRef.current = onNewChat || NOOP;
    setActive(Boolean(isActive));
  }, []);

  const onNewChat = useCallback((...args) => handlerRef.current?.(...args), []);

  const value = useMemo(() => ({ active, publish, onNewChat }), [active, publish, onNewChat]);

  return (
    <AssistantConversationContext.Provider value={value}>
      {children}
    </AssistantConversationContext.Provider>
  );
}

/**
 * Read the published conversation.
 *
 * Inactive outside a provider rather than throwing: the top bar renders in
 * contexts with no page under it, and "no conversation" is the normal state.
 */
export function useAssistantConversation() {
  const ctx = useContext(AssistantConversationContext);
  return { active: Boolean(ctx?.active), onNewChat: ctx?.onNewChat || NOOP };
}

/**
 * Publish a conversation for as long as this component is mounted.
 *
 * @param {boolean} active whether a conversation worth restarting is on screen.
 * @param {Function} onNewChat what "+ New" should do.
 */
export function usePublishAssistantConversation(active, onNewChat) {
  const ctx = useContext(AssistantConversationContext);
  const publish = ctx?.publish;
  const handlerRef = useRef(NOOP);

  // Declared before the publish effect so it has already run by the time that
  // one fires. Writing the ref during render would be a render-phase side
  // effect, which is the thing that breaks under concurrent rendering.
  useEffect(() => {
    handlerRef.current = onNewChat || NOOP;
  });

  useEffect(() => {
    publish?.(active, (...args) => handlerRef.current?.(...args));
  }, [publish, active]);

  // Navigate away and the button goes too, rather than leaving the shell
  // offering to restart a conversation nobody is looking at.
  useEffect(() => (publish ? () => publish(false, null) : undefined), [publish]);
}

export default AssistantConversationContext;
