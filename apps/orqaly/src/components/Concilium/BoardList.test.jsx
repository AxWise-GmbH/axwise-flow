import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// BoardForm pulls in heavy form deps; stub it. The stub renders a marker only
// when open, so tests can assert the create dialog opened.
vi.mock('./BoardForm', () => ({
  default: ({ open }) => (open ? <div>board-form-open</div> : null),
}));

// Control simple/advanced mode directly (drives the default view).
vi.mock('../../hooks/useSimpleMode', () => ({ useSimpleMode: vi.fn() }));

// Organization loading is asynchronous. Keep the component tests deterministic and
// expose the pending-request lifecycle for the teardown regression below.
vi.mock('../../services/organizationService', () => ({ listOrganizations: vi.fn() }));

import BoardList from './BoardList';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import { listOrganizations } from '../../services/organizationService';

function setSimpleMode(simpleMode) {
  useSimpleMode.mockReturnValue({ simpleMode, setSimpleMode: vi.fn(), toggleSimpleMode: vi.fn() });
}

const theme = createTheme();

const BOARDS = [
  {
    id: 'conc-1',
    name: 'Alpha Board',
    status: 'active',
    securityLevel: 'strict',
    quantity: 2,
    purpose: 'Evaluate things',
    createdByName: 'System',
    changeLog: [],
    llms: [
      { id: 'l1', name: 'GPT-4o', provider: 'OpenAI' },
      { id: 'l2', name: 'Llama 3.3', provider: 'Groq' },
    ],
  },
  {
    id: 'conc-2',
    name: 'Beta Board',
    status: 'paused',
    securityLevel: 'standard',
    quantity: 1,
    purpose: 'Plan things',
    createdByName: 'Mr V',
    changeLog: [],
    llms: [{ id: 'l3', name: 'Claude Sonnet', provider: 'Anthropic' }],
  },
];

function renderList(initialEntries = ['/consilium']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ThemeProvider theme={theme}>
        <BoardList
          concilium={BOARDS}
          addConcilium={vi.fn()}
          editConcilium={vi.fn()}
          removeConcilium={vi.fn()}
          jobs={[]}
          user={{ id: 'u1', email: 'u@x.com' }}
          theme={theme}
          isDark={false}
          openActivityLog={vi.fn()}
        />
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  // Most view tests do not exercise organizations; keep their request pending so a
  // background state update cannot escape the synchronous assertion boundary.
  listOrganizations.mockReturnValue(new Promise(() => {}));
  // Existing cases describe advanced-mode behaviour unless a test opts into simple.
  setSimpleMode(false);
});

describe('BoardList organization loading', () => {
  it('does not dispatch state when a request rejects after unmount', async () => {
    let rejectRequest;
    const pendingRequest = new Promise((_, reject) => {
      rejectRequest = reject;
    });
    listOrganizations.mockReturnValueOnce(pendingRequest);

    const { unmount } = renderList();
    expect(listOrganizations).toHaveBeenCalledTimes(1);
    unmount();

    // Reproduce the CI teardown ordering: the DOM environment is gone before the
    // in-flight request settles. A post-unmount setState would throw from React DOM.
    vi.stubGlobal('window', undefined);
    try {
      rejectRequest(new Error('late organization request failure'));
      await pendingRequest.catch(() => {});
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('BoardList deep link', () => {
  it('opens the create-board dialog when mounted with ?action=create', () => {
    renderList(['/consilium?action=create']);
    expect(screen.getByText('board-form-open')).toBeTruthy();
  });

  it('does not open the create dialog without the param', () => {
    renderList(['/consilium']);
    expect(screen.queryByText('board-form-open')).toBeNull();
  });
});

describe('BoardList view toggle', () => {
  it('defaults to the table view in advanced mode (no card grid)', () => {
    renderList();
    expect(screen.getByText('Alpha Board')).toBeTruthy();
    expect(screen.queryByTestId('boards-card-view')).toBeNull();
    expect(screen.getByLabelText('Card view')).toBeTruthy();
    expect(screen.getByLabelText('Table view')).toBeTruthy();
  });

  it('defaults to the card view in simple mode', () => {
    setSimpleMode(true);
    renderList();
    // Soft default: no stored preference + simple mode -> blocks, not table.
    expect(screen.getByTestId('boards-card-view')).toBeTruthy();
    // The toggle is still available so the user can switch to table.
    expect(screen.getByLabelText('Table view')).toBeTruthy();
  });

  it('switches to the card view and back', () => {
    renderList();
    fireEvent.click(screen.getByLabelText('Card view'));
    const cards = screen.getByTestId('boards-card-view');
    expect(cards).toBeTruthy();
    // Both boards render as cards.
    expect(screen.getByText('Alpha Board')).toBeTruthy();
    expect(screen.getByText('Beta Board')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Table view'));
    expect(screen.queryByTestId('boards-card-view')).toBeNull();
  });

  it('remembers the chosen view in localStorage', () => {
    renderList();
    fireEvent.click(screen.getByLabelText('Card view'));
    expect(localStorage.getItem('concilium.boards.view')).toBe('card');
  });

  it('does not offer a graph view', () => {
    renderList();
    expect(screen.queryByLabelText('Graph view')).toBeNull();
  });
});
