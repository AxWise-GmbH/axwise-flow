import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import SettingsTabPanel from './SettingsTabPanel.jsx';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const TAB = {
  id: 'profile',
  label: 'Profile',
  blocks: [
    {
      key: 'account',
      title: 'Account',
      icon: PersonOutlinedIcon,
      desc: 'Name and contact',
      done: (ctx) => Boolean(ctx?.profile?.displayName),
    },
    { key: 'notes', title: 'Notes', icon: PersonOutlinedIcon, done: () => false },
  ],
};

const theme = createTheme({ palette: { mode: 'dark' } });
function renderPanel(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <SettingsTabPanel tab={TAB} {...props} />
    </ThemeProvider>
  );
}

describe('SettingsTabPanel', () => {
  it('renders each block that has a body, open, with its description', () => {
    renderPanel({
      bodies: { account: <div>account body</div>, notes: <div>notes body</div> },
    });
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.getByText('Name and contact')).toBeInTheDocument();
    expect(screen.getByText('account body')).toBeInTheDocument();
    expect(screen.getByText('notes body')).toBeInTheDocument();
  });

  it('wires the pane to the tab that controls it', () => {
    renderPanel({ bodies: { account: <div>account body</div> } });
    const pane = screen.getByRole('tabpanel');
    expect(pane).toHaveAttribute('id', 'settings-panel-profile');
    expect(pane).toHaveAttribute('aria-labelledby', 'settings-tab-profile');
  });

  it('skips a block whose body has not been migrated yet', () => {
    renderPanel({ bodies: { account: <div>account body</div> } });
    expect(screen.getByText('Account')).toBeInTheDocument();
    expect(screen.queryByText('Notes')).toBeNull();
  });

  it('falls back to the legacy card when the tab has no bodies at all', () => {
    renderPanel({ legacy: <div>old settings card</div> });
    expect(screen.getByText('old settings card')).toBeInTheDocument();
  });

  it('collapses a section when its header is clicked', async () => {
    renderPanel({ bodies: { account: <div>account body</div> } });
    fireEvent.click(screen.getByText('Account'));
    await waitFor(() => expect(screen.queryByText('account body')).toBeNull());
  });

  it('opens and scrolls to the block search asked for', async () => {
    const onFocusHandled = vi.fn();
    renderPanel({
      bodies: { account: <div>account body</div>, notes: <div>notes body</div> },
      focusBlockKey: 'notes',
      onFocusHandled,
    });
    await waitFor(() => expect(onFocusHandled).toHaveBeenCalled());
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByText('notes body')).toBeInTheDocument();
  });

  it('renders nothing without a tab', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <SettingsTabPanel tab={null} />
      </ThemeProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
