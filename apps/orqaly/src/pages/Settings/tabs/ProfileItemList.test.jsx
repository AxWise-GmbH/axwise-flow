import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import ProfileItemList from './ProfileItemList.jsx';

const theme = createTheme();
const ITEMS = [
  { id: 'a', text: 'first item', done: false },
  { id: 'b', text: 'second item', done: true },
];

function renderList(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <ProfileItemList
        items={ITEMS}
        itemLabel="Notes"
        addPlaceholder="Add a note…"
        addIcon={NoteAddOutlinedIcon}
        addIconName="NoteAddOutlined"
        emptyTitle="No notes yet"
        emptyDescription="Add a note above to get started"
        archiveTooltip="View archived notes"
        {...props}
      />
    </ThemeProvider>
  );
}

describe('ProfileItemList', () => {
  it('lists the items it is given', () => {
    renderList();
    expect(screen.getByText('first item')).toBeInTheDocument();
    expect(screen.getByText('second item')).toBeInTheDocument();
  });

  it('shows the empty state instead of an empty list', () => {
    renderList({ items: [] });
    expect(screen.getByText('No notes yet')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('keeps Add disabled until the draft has something in it', () => {
    const onAdd = vi.fn();
    const { rerender } = renderList({ draft: '   ', onAdd });
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    rerender(
      <ThemeProvider theme={theme}>
        <ProfileItemList
          items={ITEMS}
          addPlaceholder="Add a note…"
          addIcon={NoteAddOutlinedIcon}
          emptyTitle="x"
          emptyDescription="y"
          draft="a thought"
          onAdd={onAdd}
        />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalled();
  });

  it('adds on Enter and reports every keystroke', () => {
    const onAdd = vi.fn();
    const onDraftChange = vi.fn();
    renderList({ draft: 'note', onAdd, onDraftChange });
    const field = screen.getByPlaceholderText('Add a note…');
    fireEvent.change(field, { target: { value: 'notes' } });
    expect(onDraftChange).toHaveBeenCalledWith('notes');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalled();
  });

  it('opens an item, edits it, archives it and deletes it', () => {
    const onOpen = vi.fn();
    const onStartEdit = vi.fn();
    const onArchive = vi.fn();
    const onDelete = vi.fn();
    renderList({ onOpen, onStartEdit, onArchive, onDelete });
    fireEvent.click(screen.getByText('first item'));
    expect(onOpen).toHaveBeenCalledWith(ITEMS[0]);
    fireEvent.click(screen.getAllByLabelText('Edit')[0]);
    expect(onStartEdit).toHaveBeenCalledWith(ITEMS[0]);
    fireEvent.click(screen.getAllByLabelText('Archive')[1]); // [0] is the composer's
    expect(onArchive).toHaveBeenCalledWith(ITEMS[0]);
    fireEvent.click(screen.getAllByLabelText('Delete')[0]);
    expect(onDelete).toHaveBeenCalledWith(ITEMS[0]);
  });

  it('swaps the row for a field while it is being edited', () => {
    const onSaveEdit = vi.fn();
    const onCancelEdit = vi.fn();
    renderList({ editingId: 'a', editingText: 'first item', onSaveEdit, onCancelEdit });
    expect(screen.queryByText('first item')).toBeNull();
    expect(screen.getByLabelText('Edit text')).toHaveValue('first item');
    fireEvent.click(screen.getByLabelText('Save'));
    expect(onSaveEdit).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Cancel'));
    expect(onCancelEdit).toHaveBeenCalled();
  });

  it('ticks tasks off when it carries checkboxes', () => {
    const onToggle = vi.fn();
    renderList({ withCheckbox: true, onToggle });
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes[1]).toBeChecked();
    fireEvent.click(boxes[0]);
    expect(onToggle).toHaveBeenCalledWith('a');
  });

  it('has no checkboxes when it does not', () => {
    renderList();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('opens the archive from the composer', () => {
    const onOpenArchive = vi.fn();
    renderList({ onOpenArchive });
    fireEvent.click(screen.getAllByLabelText('Archive')[0]);
    expect(onOpenArchive).toHaveBeenCalled();
  });

  it('renders items through the format it is given', () => {
    renderList({ format: (item) => item.text.toUpperCase() });
    expect(screen.getByText('FIRST ITEM')).toBeInTheDocument();
  });
});
