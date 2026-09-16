import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import {
  SettingsViewOptionsButton,
  useSettingsBlockLayout,
  SETTINGS_PINNED_ID,
} from './SettingsViewOptions';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

const theme = createTheme({ palette: { mode: 'dark' } });
const sectionDefs = [
  { id: SETTINGS_PINNED_ID, label: 'Profile', icon: PersonOutlinedIcon },
  { id: 'onboarding', label: 'Onboarding', icon: HelpOutlineIcon },
];

function renderButton(props = {}) {
  const onToggle = vi.fn();
  render(
    <ThemeProvider theme={theme}>
      <SettingsViewOptionsButton
        pinnedLabel="Profile"
        sortableKeys={['onboarding']}
        labels={{ profile: 'Profile', onboarding: 'Onboarding' }}
        hiddenSections={new Set()}
        sectionOrder={['onboarding']}
        onToggle={onToggle}
        onReorder={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
        onReset={vi.fn()}
        {...props}
      />
    </ThemeProvider>
  );
  return { onToggle };
}

describe('SettingsViewOptionsButton', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('opens settings blocks popover from filter icon', () => {
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /View options/i }));
    expect(screen.getByText('Settings blocks')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
  });

  it('calls onToggle when hide is clicked', () => {
    const { onToggle } = renderButton();
    fireEvent.click(screen.getByRole('button', { name: /View options/i }));
    fireEvent.click(screen.getByRole('button', { name: /Hide Onboarding/i }));
    expect(onToggle).toHaveBeenCalledWith('onboarding');
  });
});

describe('useSettingsBlockLayout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps profile first in nav sections', () => {
    function Probe() {
      const { navSections } = useSettingsBlockLayout(sectionDefs);
      return <div data-testid="nav">{navSections.map((s) => s.id).join(',')}</div>;
    }
    render(
      <ThemeProvider theme={theme}>
        <Probe />
      </ThemeProvider>
    );
    expect(screen.getByTestId('nav').textContent).toBe('profile,onboarding');
  });

  it('applyLayout sets order + hidden + widths, drops unknown ids and appends missing blocks', () => {
    const defs = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ];
    function Probe() {
      const { navSections, sectionOrder, blockWidths, applyLayout, resetLayout } =
        useSettingsBlockLayout(defs, { pinnedId: null });
      return (
        <div>
          <div data-testid="order">{sectionOrder.join(',')}</div>
          <div data-testid="nav">{navSections.map((s) => s.id).join(',')}</div>
          <div data-testid="widths">{[...blockWidths].join(',')}</div>
          {/* 'c' omitted from order (append), 'zz' unknown (drop), 'b' hidden, 'a' half + unknown 'zz' width dropped */}
          <button
            onClick={() =>
              applyLayout({ hidden: ['b', 'zz'], order: ['b', 'a', 'zz'], widths: ['a', 'zz'] })
            }
          >
            apply
          </button>
          <button onClick={resetLayout}>reset</button>
        </div>
      );
    }
    render(
      <ThemeProvider theme={theme}>
        <Probe />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText('apply'));
    // order: known ids in given order, then missing 'c' appended; 'zz' dropped.
    expect(screen.getByTestId('order').textContent).toBe('b,a,c');
    // nav excludes hidden 'b'; 'zz' never appears.
    expect(screen.getByTestId('nav').textContent).toBe('a,c');
    // widths keep only known ids.
    expect(screen.getByTestId('widths').textContent).toBe('a');

    // reset clears widths (back to all full width).
    fireEvent.click(screen.getByText('reset'));
    expect(screen.getByTestId('widths').textContent).toBe('');
  });
});
