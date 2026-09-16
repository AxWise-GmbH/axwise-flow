import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const simpleModeMock = vi.fn();
vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: () => ({ simpleMode: simpleModeMock() }),
}));

// Sentinels so we don't render the heavy Dashboard / org overview here.
let lastDashboardProps = null;
vi.mock('../Dashboard/Dashboard', () => ({
  default: (props) => {
    lastDashboardProps = props;
    return <div data-testid="dashboard-shell" />;
  },
}));
vi.mock('./HomeOverview', () => ({ default: () => <div data-testid="home-overview" /> }));
vi.mock('../../components/Common/PageLayout', () => ({
  default: ({ children }) => <div data-testid="page-layout">{children}</div>,
}));

import Home from './Home';

beforeEach(() => {
  simpleModeMock.mockReset();
  lastDashboardProps = null;
});

describe('Home (mode switch)', () => {
  it('simple mode renders the Dashboard shell with a metricsOverride', () => {
    simpleModeMock.mockReturnValue(true);
    render(<Home />);
    expect(screen.getByTestId('dashboard-shell')).toBeInTheDocument();
    expect(lastDashboardProps).toBeTruthy();
    expect(lastDashboardProps.metricsOverride).toBeTruthy(); // the <HomeOverview /> element
    expect(screen.queryByTestId('home-overview')).not.toBeInTheDocument();
  });

  it('advanced mode renders the org overview inside PageLayout', () => {
    simpleModeMock.mockReturnValue(false);
    render(<Home />);
    expect(screen.getByTestId('page-layout')).toBeInTheDocument();
    expect(screen.getByTestId('home-overview')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-shell')).not.toBeInTheDocument();
  });
});
