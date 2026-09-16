import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  loadAssistants: vi.fn(),
  createAssistant: vi.fn(),
  switchAssistant: vi.fn(),
  renameAssistant: vi.fn(),
  deleteAssistant: vi.fn(),
  saveAssistant: vi.fn(),
}));
vi.mock('../services/assistantsService', () => ({
  loadAssistants: svc.loadAssistants,
  createAssistant: svc.createAssistant,
  switchAssistant: svc.switchAssistant,
  renameAssistant: svc.renameAssistant,
  deleteAssistant: svc.deleteAssistant,
  saveAssistant: svc.saveAssistant,
}));

import { useAssistantSetup } from './useAssistantSetup';

const baseAssistant = {
  id: 'a1',
  organizationId: null,
  name: 'My Assistant',
  config: { tone: 'friendly' },
  steps: { channel: true },
  activated: false,
  isCurrent: true,
  updatedAt: null,
};

beforeEach(() => {
  Object.values(svc).forEach((fn) => fn.mockReset());
  svc.loadAssistants.mockResolvedValue({ assistants: [{ ...baseAssistant }], currentId: 'a1' });
  svc.saveAssistant.mockImplementation(async (id, p) => ({
    ...baseAssistant,
    config: { ...baseAssistant.config, ...(p.config || {}) },
    steps: { ...baseAssistant.steps, ...(p.steps || {}) },
    activated: p.activated !== undefined ? p.activated : baseAssistant.activated,
  }));
  svc.createAssistant.mockImplementation(async ({ name } = {}) => {
    const a = { ...baseAssistant, id: 'a2', name: name || 'My Assistant' };
    return { assistant: a, assistants: [a], currentId: 'a2' };
  });
  try {
    localStorage.clear();
  } catch {
    /* jsdom */
  }
});

describe('useAssistantSetup', () => {
  // Regression: under StrictMode the mount->unmount->remount cycle must not
  // leave `loading` stuck true (the spinner-forever bug).
  it('clears loading after load even under StrictMode', async () => {
    const { result } = renderHook(() => useAssistantSetup({ enabled: true }), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.steps).toEqual({ channel: true });
    expect(result.current.config).toEqual({ tone: 'friendly' });
    expect(result.current.currentId).toBe('a1');
  });

  it('exposes the assistant list and current id', async () => {
    const { result } = renderHook(() => useAssistantSetup({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.assistants).toHaveLength(1);
    expect(result.current.name).toBe('My Assistant');
  });

  it('merges a save patch into the current assistant', async () => {
    const { result } = renderHook(() => useAssistantSetup({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.save({ steps: { keys: true }, activated: true });
    });
    expect(svc.saveAssistant).toHaveBeenCalledWith('a1', {
      steps: { keys: true },
      activated: true,
    });
    expect(result.current.steps).toMatchObject({ keys: true });
    expect(result.current.activated).toBe(true);
  });

  it('creating a new assistant makes it current', async () => {
    const { result } = renderHook(() => useAssistantSetup({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.createAssistant({ name: 'Fintech' });
    });
    expect(result.current.currentId).toBe('a2');
    expect(result.current.name).toBe('Fintech');
  });
});
