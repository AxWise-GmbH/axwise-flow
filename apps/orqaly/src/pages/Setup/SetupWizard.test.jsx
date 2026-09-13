import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const hookMock = vi.hoisted(() => ({ value: null }));
vi.mock('./useSetupProgress', () => ({ useSetupProgress: () => hookMock.value }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('./sections/HowItWorksCard', () => ({ default: () => null }));
vi.mock('./steps/WorkspaceStep', () => ({ default: () => <div data-testid="step-workspace" /> }));
vi.mock('./steps/DatabaseStep', () => ({ default: () => <div data-testid="step-database" /> }));
vi.mock('./steps/KeysStep', () => ({ default: () => <div data-testid="step-keys" /> }));
vi.mock('./steps/StorageStep', () => ({ default: () => <div data-testid="step-storage" /> }));
vi.mock('./steps/LocalLlmStep', () => ({ default: () => <div data-testid="step-local" /> }));
vi.mock('./steps/AiChatSyncStep', () => ({ default: () => <div data-testid="step-aichatsync" /> }));
vi.mock('./steps/IdeSyncStep', () => ({ default: () => <div data-testid="step-idesync" /> }));

import SetupWizard from './SetupWizard';

const theme = createTheme();
const wrap = () =>
  render(
    <ThemeProvider theme={theme}>
      <SetupWizard />
    </ThemeProvider>
  );

function progress({ allRequiredDone = false, done = {} } = {}) {
  const d = (k) => ({ done: !!done[k] });
  return {
    loading: false,
    workspace: d('workspace'),
    database: d('database'),
    keys: d('keys'),
    storage: d('storage'),
    aiChatSync: d('aiChatSync'),
    ideSync: d('ideSync'),
    localLlm: d('localLlm'),
    allRequiredDone,
  };
}

beforeEach(() => {
  hookMock.value = progress();
});

describe('SetupWizard', () => {
  it('starts on the Workspace step', () => {
    wrap();
    expect(screen.getByTestId('step-workspace')).toBeTruthy();
    expect(screen.queryByTestId('step-database')).toBeNull();
  });

  it('advances to the next step with Next', () => {
    wrap();
    fireEvent.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByTestId('step-database')).toBeTruthy();
  });

  it('disables Finish on the last step until required steps are done', () => {
    wrap();
    fireEvent.click(screen.getByRole('button', { name: /local llm/i })); // jump via stepper
    const finish = screen.getByRole('button', { name: /finish setup/i });
    expect(finish).toBeDisabled();
  });

  it('enables Finish once required steps are complete', () => {
    hookMock.value = progress({ allRequiredDone: true, done: { workspace: true, keys: true } });
    wrap();
    fireEvent.click(screen.getByRole('button', { name: /local llm/i }));
    expect(screen.getByRole('button', { name: /finish setup/i })).toBeEnabled();
  });
});
