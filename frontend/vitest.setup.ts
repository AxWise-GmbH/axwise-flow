import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Compatibility bridge for historical tests while they are migrated from Jest
// syntax to native Vitest `vi` calls.
Object.defineProperty(globalThis, 'jest', {
  configurable: true,
  value: vi,
});

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
