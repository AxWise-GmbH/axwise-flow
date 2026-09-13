import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import Documentation from './Documentation';

// Auth + heavy children are stubbed so the test focuses on container behavior:
// hero, tab bar, and section switching.
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('../../components/icons/AppIcon', () => ({ default: () => null }));
vi.mock('../../components/Common/MetricsStrip', () => ({ default: () => <div>metrics-strip</div> }));

vi.mock('./sections/GettingStartedSection', () => ({ default: () => <div>getting-started-section</div> }));
vi.mock('./sections/FaqSection', () => ({ default: () => <div>faq-section</div> }));
vi.mock('./sections/ProductPagesSection', () => ({ default: () => <div>product-section</div> }));
vi.mock('./sections/ArchitectureApiSection', () => ({ default: () => <div>architecture-section</div> }));
vi.mock('./sections/AgentsSection', () => ({ default: () => <div>agents-section</div> }));
vi.mock('./sections/ConsiliumSection', () => ({ default: () => <div>consilium-section</div> }));
vi.mock('./sections/ProvidersSection', () => ({ default: () => <div>providers-section</div> }));
vi.mock('./sections/ToolsSection', () => ({ default: () => <div>tools-section</div> }));
vi.mock('./sections/ApiKeysSection', () => ({ default: () => <div>apikeys-section</div> }));
vi.mock('./sections/FullDocsSection', () => ({ default: () => <div>fulldocs-section</div> }));

beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    (() => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {},
    }));
});

describe('Documentation page', () => {
  it('renders the hero, search box, and stats', () => {
    const { getAllByText, getByLabelText, getByText } = render(<Documentation />);
    expect(getAllByText('Documentation').length).toBeGreaterThan(0);
    expect(getByLabelText('Search documentation')).toBeInTheDocument();
    expect(getByText('metrics-strip')).toBeInTheDocument();
  });

  it('defaults to the Getting Started section', () => {
    const { getByText } = render(<Documentation />);
    expect(getByText('getting-started-section')).toBeInTheDocument();
  });

  it('switches sections when a pill is clicked', () => {
    const { getByText, queryByText } = render(<Documentation />);
    fireEvent.click(getByText('Consilium'));
    expect(getByText('consilium-section')).toBeInTheDocument();
    expect(queryByText('getting-started-section')).not.toBeInTheDocument();

    fireEvent.click(getByText('API Keys'));
    expect(getByText('apikeys-section')).toBeInTheDocument();
  });
});
