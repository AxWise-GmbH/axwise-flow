import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';

// Mock the two hooks AppIcon reads so we can drive mode + selected set directly.
const mockSimple = vi.fn();
const mockTheme = vi.fn();
vi.mock('../../hooks/useSimpleMode', () => ({ useSimpleMode: () => mockSimple() }));
vi.mock('../../context/ThemeContext', () => ({ useThemeMode: () => mockTheme() }));

// Stub Iconify: render the resolved id into the DOM, no-op the collection register.
vi.mock('@iconify/react', () => ({
  Icon: ({ icon }) => <span data-testid="iconify" data-icon={icon} />,
  addCollection: vi.fn(),
}));

// Stub the lazy advanced assets so the imports resolve instantly in tests.
vi.mock('@iconify-json/ph/icons.json', () => ({ default: { prefix: 'ph', icons: {} } }));
vi.mock('./muiComponentNames.js', () => ({ nameForComponent: () => undefined }));

import AppIcon from './AppIcon';

beforeEach(() => {
  mockSimple.mockReturnValue({ simpleMode: false });
  mockTheme.mockReturnValue({ iconSet: 'mui' });
});

describe('AppIcon', () => {
  it('renders the MUI fallback when the set is "mui"', () => {
    const { getByTestId, queryByTestId } = render(
      <AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} />
    );
    expect(getByTestId('SmartToyOutlinedIcon')).toBeInTheDocument();
    expect(queryByTestId('iconify')).toBeNull();
  });

  it('falls back to MUI for an unmapped name even when a thin-line set is active', () => {
    mockTheme.mockReturnValue({ iconSet: 'outline' });
    const { getByTestId, queryByTestId } = render(
      <AppIcon name="ZzzDefinitelyUnmapped" fallback={SmartToyOutlinedIcon} />
    );
    expect(getByTestId('SmartToyOutlinedIcon')).toBeInTheDocument();
    expect(queryByTestId('iconify')).toBeNull();
  });

  it('renders the Phosphor outline glyph once the collection loads', async () => {
    mockTheme.mockReturnValue({ iconSet: 'outline' });
    const { findByTestId } = render(
      <AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} />
    );
    const el = await findByTestId('iconify');
    expect(el).toHaveAttribute('data-icon', 'ph:robot');
  });

  it('renders the Phosphor -fill glyph for the filled set', async () => {
    mockTheme.mockReturnValue({ iconSet: 'filled' });
    const { findByTestId } = render(
      <AppIcon name="SmartToyOutlined" fallback={SmartToyOutlinedIcon} />
    );
    const el = await findByTestId('iconify');
    expect(el).toHaveAttribute('data-icon', 'ph:robot-fill');
  });

  it('renders plain MUI in simple mode (no glass, no Iconify) by default', () => {
    mockSimple.mockReturnValue({ simpleMode: true });
    mockTheme.mockReturnValue({ iconSet: 'outline' });
    const { getByTestId, queryByTestId } = render(
      <AppIcon name="HomeRounded" fallback={HomeRoundedIcon} />
    );
    // Simple mode keeps its pre-sweep look: the plain MUI icon, never thin-line.
    expect(getByTestId('HomeRoundedIcon')).toBeInTheDocument();
    expect(queryByTestId('iconify')).toBeNull();
  });

  it('uses a glass glyph in simple mode only when glassInSimple is set', () => {
    mockSimple.mockReturnValue({ simpleMode: true });
    mockTheme.mockReturnValue({ iconSet: 'mui' });
    const { container, queryByTestId } = render(
      <AppIcon name="HomeRounded" fallback={HomeRoundedIcon} glassInSimple />
    );
    // GlassIcon swaps in its own SVG, so the MUI testid is gone but an svg renders.
    expect(queryByTestId('HomeRoundedIcon')).toBeNull();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders nothing when neither a glyph nor a fallback is available', () => {
    const { container } = render(<AppIcon name="Whatever" />);
    expect(container).toBeEmptyDOMElement();
  });
});
