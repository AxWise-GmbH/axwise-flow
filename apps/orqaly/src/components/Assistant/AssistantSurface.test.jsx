import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const save = vi.fn().mockResolvedValue({});
const switchAssistant = vi.fn();
const renameAssistant = vi.fn();
const createAssistant = vi.fn();
const removeAssistant = vi.fn();

// Shared server-backed config + multi-assistant list/CRUD (the same store
// /assistant uses).
vi.mock('../../hooks/useAssistantSetup', () => ({
  useAssistantSetup: () => ({
    config: { provider: 'groq', model: 'llama-3.3-70b-versatile', tone: 'friendly' },
    steps: { keys: true },
    activated: true,
    save,
    assistants: [{ id: 'a1', name: 'My Assistant', isCurrent: true }],
    currentId: 'a1',
    current: { id: 'a1', name: 'My Assistant' },
    createAssistant,
    switchAssistant,
    renameAssistant,
    removeAssistant,
  }),
}));

// Capture the props forwarded to the drawer so we can assert the CRUD wiring.
let drawerProps = null;
vi.mock('./AssistantContextDrawer.jsx', () => ({
  default: (props) => {
    drawerProps = props;
    return null;
  },
}));

// Lightweight AssistantChat stand-in that surfaces the brain props and a way to
// trigger onModelChange (React 19 accepts the forwarded ref as a normal prop).
vi.mock('./AssistantChat.jsx', () => ({
  default: ({ provider, model, onModelChange }) => (
    <div>
      <span data-testid="provider">{provider}</span>
      <span data-testid="model">{model}</span>
      <button onClick={() => onModelChange({ provider: 'anthropic', model: 'claude-sonnet-5' })}>
        change-model
      </button>
    </div>
  ),
}));

import AssistantSurface from './AssistantSurface.jsx';

describe('AssistantSurface', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the brain (provider/model) from the shared server config', () => {
    render(<AssistantSurface />);
    expect(screen.getByTestId('provider').textContent).toBe('groq');
    expect(screen.getByTestId('model').textContent).toBe('llama-3.3-70b-versatile');
  });

  it('persists model changes to the shared server config, preserving other config keys', () => {
    render(<AssistantSurface />);
    fireEvent.click(screen.getByText('change-model'));
    expect(save).toHaveBeenCalledWith({
      config: { provider: 'anthropic', model: 'claude-sonnet-5', tone: 'friendly' },
    });
  });

  it('forwards the assistant list + CRUD to the context drawer', () => {
    render(<AssistantSurface />);
    expect(drawerProps.assistants).toHaveLength(1);
    expect(drawerProps.currentId).toBe('a1');
    expect(drawerProps.switchAssistant).toBe(switchAssistant);
    expect(drawerProps.renameAssistant).toBe(renameAssistant);
    expect(drawerProps.createAssistant).toBe(createAssistant);
    expect(drawerProps.removeAssistant).toBe(removeAssistant);
    expect(drawerProps.save).toBe(save);
  });
});
