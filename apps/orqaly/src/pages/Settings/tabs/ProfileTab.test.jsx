import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import useProfileTabBodies from './ProfileTab.jsx';

const theme = createTheme();

function Harness({ blockKey, ...args }) {
  const bodies = useProfileTabBodies({
    profileDataError: null,
    onDismissProfileError: () => {},
    profileDataLoading: false,
    displayName: 'Mr.V',
    onDisplayNameChange: () => {},
    email: 'misters.builder@gmail.com',
    telegram: '',
    onTelegramChange: () => {},
    notes: [],
    todos: [],
    openNotesArchive: () => {},
    openTodosArchive: () => {},
    format: (item) => item.text,
    noteList: {},
    todoList: {},
    ...args,
  });
  return bodies[blockKey];
}

function renderBlock(blockKey, args = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <Harness blockKey={blockKey} {...args} />
    </ThemeProvider>
  );
}

describe('Profile tab bodies', () => {
  it('gives account the three fields, with email locked', () => {
    renderBlock('account');
    expect(screen.getByLabelText('Display name')).toHaveValue('Mr.V');
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Telegram')).toBeInTheDocument();
  });

  it('reports a name change', () => {
    const onDisplayNameChange = vi.fn();
    renderBlock('account', { onDisplayNameChange });
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'V' } });
    expect(onDisplayNameChange).toHaveBeenCalledWith('V');
  });

  it('prefixes a telegram handle that is missing its @', () => {
    renderBlock('account', { telegram: 'builder' });
    expect(screen.getByText('@')).toBeInTheDocument();
  });

  it('surfaces a load error with a way to dismiss it', () => {
    const onDismissProfileError = vi.fn();
    renderBlock('account', { profileDataError: 'could not load', onDismissProfileError });
    expect(screen.getByText('could not load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onDismissProfileError).toHaveBeenCalled();
  });

  it('says it is still loading only while both lists are empty', () => {
    renderBlock('account', { profileDataLoading: true });
    expect(screen.getByText('Loading notes and tasks…')).toBeInTheDocument();
  });

  it('gives notes its own list and archive', () => {
    const openNotesArchive = vi.fn();
    renderBlock('notes', { openNotesArchive });
    expect(screen.getByPlaceholderText('Add a note…')).toBeInTheDocument();
    expect(screen.getByText('No notes yet')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Archive'));
    expect(openNotesArchive).toHaveBeenCalled();
  });

  it('gives the todo list its own, with checkboxes', () => {
    const openTodosArchive = vi.fn();
    renderBlock('todo', {
      todos: [{ id: 't1', text: 'ship it', done: false }],
      openTodosArchive,
    });
    expect(screen.getByPlaceholderText('Add a task…')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText('Archive')[0]);
    expect(openTodosArchive).toHaveBeenCalled();
  });
});
