/**
 * Small, testable state boundaries for the simple Dashboard hero.
 */

/**
 * The activation render runs before the effect that persists the mount latch.
 * Include the active state so that first render cannot be blank.
 */
export function shouldRenderAssistantSurface({
  assistantMounted = false,
  assistantSurfaceActive = false,
} = {}) {
  return assistantMounted || assistantSurfaceActive;
}

/** Only an empty, idle landing hero should advertise the overview below it. */
export function shouldShowOverviewChevron({
  hasRunningGoal = false,
  hasActiveChat = false,
  hasDraft = false,
  textEntryFocused = false,
} = {}) {
  return !hasRunningGoal && !hasActiveChat && !hasDraft && !textEntryFocused;
}
