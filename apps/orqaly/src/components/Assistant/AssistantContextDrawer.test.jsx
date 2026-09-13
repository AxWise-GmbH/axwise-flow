import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../services/organizationService', () => ({ listOrganizations: vi.fn().mockResolvedValue([]) }));
vi.mock('../../services/knowledgeBaseService', () => ({
  listDocuments: vi.fn().mockResolvedValue([{ id: 'd1', tags: [] }, { id: 'd2', tags: ['brief'] }]),
}));
vi.mock('../../services/contactsService', () => ({
  listContacts: vi.fn(({ contact_type }) =>
    Promise.resolve(contact_type === 'phone' ? [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] : [{ id: 'm1' }])
  ),
}));

// Replace the six heavy step cards with a single trivial stub so the test can
// focus on the drawer's own logic (selector / rename / new / contacts / persist).
vi.mock('./setupSteps', () => {
  const Stub = ({ onComplete }) => (
    <button onClick={() => onComplete({ config: { provider: 'gemini' } })}>save-step</button>
  );
  const Icon = () => null;
  return {
    ASSISTANT_SETUP_STEPS: [
      { key: 'keys', short: 'Core', desc: 'd', required: true, icon: Icon, Card: Stub },
      { key: 'data', short: 'Data', desc: 'd', icon: Icon, Card: Stub },
      { key: 'brief', short: 'Brief', desc: 'd', icon: Icon, Card: Stub },
      { key: 'insights', short: 'Insights', desc: 'd', icon: Icon, Card: Stub },
      { key: 'channel', short: 'Channel', desc: 'd', icon: Icon, Card: Stub },
      { key: 'voice', short: 'Voice', desc: 'd', icon: Icon, Card: Stub },
    ],
  };
});

import AssistantContextDrawer from './AssistantContextDrawer.jsx';

function baseProps(overrides = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    config: {},
    steps: {},
    activated: false,
    save: vi.fn().mockResolvedValue({}),
    assistants: [
      { id: 'a1', name: 'My Assistant', isCurrent: true },
      { id: 'a2', name: 'Sales bot' },
    ],
    currentId: 'a1',
    current: { id: 'a1', name: 'My Assistant' },
    createAssistant: vi.fn(),
    switchAssistant: vi.fn(),
    renameAssistant: vi.fn(),
    removeAssistant: vi.fn(),
    orgId: null,
    onOrgChange: vi.fn(),
    onOpenEntity: vi.fn(),
    voiceEnabled: false,
    onToggleVoice: vi.fn(),
    ...overrides,
  };
}

describe('AssistantContextDrawer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists assistants and switches on selection', () => {
    const props = baseProps();
    render(<AssistantContextDrawer {...props} />);
    // The assistant selector is the first combobox (org scope is the second).
    fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
    fireEvent.click(screen.getByRole('option', { name: 'Sales bot' }));
    expect(props.switchAssistant).toHaveBeenCalledWith('a2');
  });

  it('renames the current assistant', () => {
    const props = baseProps();
    render(<AssistantContextDrawer {...props} />);
    fireEvent.click(screen.getByLabelText('Rename assistant'));
    const field = screen.getByLabelText('Assistant name');
    fireEvent.change(field, { target: { value: 'Support' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(props.renameAssistant).toHaveBeenCalledWith('a1', 'Support');
  });

  it('creates a new assistant', () => {
    const props = baseProps();
    render(<AssistantContextDrawer {...props} />);
    fireEvent.click(screen.getByLabelText('New assistant'));
    expect(props.createAssistant).toHaveBeenCalled();
  });

  it('renders all six step accordions', () => {
    render(<AssistantContextDrawer {...baseProps()} />);
    ['Core', 'Data', 'Brief', 'Insights', 'Channel', 'Voice'].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });

  it('shows live contact counts and deep-links to the right KB tabs', async () => {
    const props = baseProps();
    render(<AssistantContextDrawer {...props} />);
    // Data accordion is collapsed by default (Core is open); expand it.
    fireEvent.click(screen.getByText('Data'));

    expect(await screen.findByText('3 contacts')).toBeTruthy(); // phone
    expect(screen.getByText('1 contact')).toBeTruthy(); // mail

    fireEvent.click(screen.getByLabelText('Open Phone Contacts'));
    expect(props.onOpenEntity).toHaveBeenCalledWith({ route: '/knowledge-base?tab=phone-contacts' });

    fireEvent.click(screen.getByLabelText('Open Mail Contacts'));
    expect(props.onOpenEntity).toHaveBeenCalledWith({ route: '/knowledge-base?tab=mail-contacts' });
  });

  it('persists a step through save with the step key marked done', async () => {
    const props = baseProps();
    render(<AssistantContextDrawer {...props} />);
    // Core (keys) accordion is expanded by default; only its card is mounted.
    fireEvent.click(screen.getByText('save-step'));
    await waitFor(() => expect(props.save).toHaveBeenCalled());
    expect(props.save).toHaveBeenCalledWith(
      expect.objectContaining({ config: { provider: 'gemini' }, steps: { keys: true }, activated: true })
    );
  });
});
