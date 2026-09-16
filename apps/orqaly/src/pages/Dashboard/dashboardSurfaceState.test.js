import { describe, expect, it } from 'vitest';
import { shouldRenderAssistantSurface, shouldShowOverviewChevron } from './dashboardSurfaceState';

describe('Dashboard Assistant surface mounting', () => {
  it('renders on the activation frame before the persistent latch effect runs', () => {
    expect(
      shouldRenderAssistantSurface({
        assistantMounted: false,
        assistantSurfaceActive: true,
      })
    ).toBe(true);
  });

  it('stays rendered after activation through the persistent latch', () => {
    expect(
      shouldRenderAssistantSurface({
        assistantMounted: true,
        assistantSurfaceActive: false,
      })
    ).toBe(true);
    expect(shouldRenderAssistantSurface()).toBe(false);
  });
});

describe('Dashboard overview chevron', () => {
  it('is shown on an empty, idle landing hero', () => {
    expect(shouldShowOverviewChevron()).toBe(true);
  });

  it.each([
    ['an active Assistant chat', { hasActiveChat: true }],
    ['a running goal', { hasRunningGoal: true }],
    ['a non-empty draft', { hasDraft: true }],
    ['a focused composer', { textEntryFocused: true }],
  ])('is absent during %s', (_label, state) => {
    expect(shouldShowOverviewChevron(state)).toBe(false);
  });
});
