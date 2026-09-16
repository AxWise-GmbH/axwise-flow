import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

const mocks = vi.hoisted(() => ({
  fetchArenaPeople: vi.fn(async () => []),
  saveArenaPeople: vi.fn(async () => []),
  ensureArenaAgents: vi.fn(async () => ({
    agents: [{ id: 'a1', name: 'Rihards Ozols', role: 'Lawyer' }],
  })),
}));
vi.mock('../../../../services/arenaService', () => mocks);

import TeamCard from './TeamCard';

const theme = createTheme();

function setup() {
  const onComplete = vi.fn(async () => {});
  render(
    <ThemeProvider theme={theme}>
      <TeamCard onComplete={onComplete} embedded />
    </ThemeProvider>
  );
  return { onComplete };
}

async function addPerson(name, role) {
  fireEvent.change(screen.getByLabelText('Person name'), { target: { value: name } });
  fireEvent.mouseDown(
    within(screen.getByLabelText('Person role').parentElement).getByRole('combobox')
  );
  fireEvent.click(await screen.findByRole('option', { name: role }));
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
}

beforeEach(() => vi.clearAllMocks());

describe('TeamCard', () => {
  it('adds and removes people from the roster', async () => {
    setup();
    await addPerson('Marta K.', 'Lawyer');
    expect(screen.getByText('Marta K.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Marta K.' }));
    expect(screen.queryByText('Marta K.')).not.toBeInTheDocument();
  });

  it('generates one counterpart per distinct role', async () => {
    setup();
    await addPerson('Marta K.', 'Lawyer');
    fireEvent.click(screen.getByRole('button', { name: /Generate/ }));
    await waitFor(() => expect(mocks.ensureArenaAgents).toHaveBeenCalledWith(['Lawyer']));
    expect(await screen.findByText(/Rihards Ozols · Lawyer \(agent\)/)).toBeInTheDocument();
  });

  it('saving the step persists the roster and guarantees the counterparts', async () => {
    const { onComplete } = setup();
    await addPerson('Marta K.', 'Lawyer');
    fireEvent.click(screen.getByRole('button', { name: 'Save team' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(mocks.saveArenaPeople).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'Marta K.', role: 'Lawyer' }),
    ]);
    expect(mocks.ensureArenaAgents).toHaveBeenCalledWith(['Lawyer']);
  });

  it('takes a role the owner types in their own words', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Person name'), { target: { value: 'Sam T.' } });
    fireEvent.mouseDown(
      within(screen.getByLabelText('Person role').parentElement).getByRole('combobox')
    );
    fireEvent.click(await screen.findByRole('option', { name: /Something else/ }));
    fireEvent.change(screen.getByLabelText('Custom role'), {
      target: { value: 'Night Shift Lead' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Sam T.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save team' }));
    await waitFor(() => expect(mocks.ensureArenaAgents).toHaveBeenCalledWith(['Night Shift Lead']));
  });

  it('keeps what a person actually does, so their agent can replicate it', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Person name'), { target: { value: 'Marta K.' } });
    fireEvent.mouseDown(
      within(screen.getByLabelText('Person role').parentElement).getByRole('combobox')
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Lawyer' }));
    fireEvent.change(screen.getByLabelText('What they do'), {
      target: { value: 'Reviews vendor contracts and NDAs' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Reviews vendor contracts and NDAs')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save team' }));
    await waitFor(() => expect(mocks.saveArenaPeople).toHaveBeenCalled());
    expect(mocks.saveArenaPeople.mock.calls[0][0][0]).toMatchObject({
      name: 'Marta K.',
      role: 'Lawyer',
      description: 'Reviews vendor contracts and NDAs',
    });
  });

  it('will not add a person with no role at all', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Person name'), { target: { value: 'Nobody' } });
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('cannot save an empty roster', async () => {
    setup();
    await waitFor(() => expect(mocks.fetchArenaPeople).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Save team' })).toBeDisabled();
  });
});
