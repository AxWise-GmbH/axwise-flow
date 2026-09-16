/**
 * [module: frontend]
 *
 * The document row is where the View button was asked for: a finished brief
 * whose only two actions were Download (find the file, open it elsewhere) and
 * Copy (paste it somewhere to read it).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import DocumentGroup from './DocumentGroup';
import { DeliverableViewerProvider } from './DeliverableViewer';

vi.mock('../../Deliverables/VersionPicker', () => ({ default: () => null }));

const theme = createTheme();
const docs = [
  {
    title: 'Zero-Capital Analysis',
    chars: 9717,
    preview: 'Building on',
    output: '# Findings\n\nSpend nothing.',
  },
];

function setup({ withViewer = true } = {}) {
  const group = <DocumentGroup items={docs} icon="📝" label="Documents" G="#4caf50" />;
  return render(
    <ThemeProvider theme={theme}>
      {withViewer ? <DeliverableViewerProvider>{group}</DeliverableViewerProvider> : group}
    </ThemeProvider>
  );
}

// DeliverableRow gives every action an href, so MUI renders them as anchors.
const action = (name) => screen.getByRole('link', { name });
const queryAction = (name) => screen.queryByRole('link', { name });

describe('DocumentGroup', () => {
  it('keeps the actions it always had', () => {
    setup();
    expect(action(/Download \.md/)).toBeInTheDocument();
    expect(action(/^Copy/)).toBeInTheDocument();
  });

  it('offers View beside them once a popup can host it', () => {
    setup();
    expect(action(/^View/)).toBeInTheDocument();
  });

  it('reads the document in place, rendered rather than raw', () => {
    setup();
    fireEvent.click(action(/^View/));
    expect(screen.getByRole('dialog', { name: /Zero-Capital Analysis/ })).toBeInTheDocument();
    expect(screen.getByText('Findings')).toBeInTheDocument();
    expect(screen.getByText('Spend nothing.')).toBeInTheDocument();
  });

  // A View button with nowhere to open is worse than no View button, and these
  // groups also render on pages that are not a popup.
  it('offers no View where nothing can host it', () => {
    setup({ withViewer: false });
    expect(queryAction(/^View/)).toBeNull();
    expect(action(/Download \.md/)).toBeInTheDocument();
  });
});
