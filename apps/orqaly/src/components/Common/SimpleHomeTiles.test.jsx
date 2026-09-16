import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import { HomeMetricTile, HomeCategoriesShowcase } from './SimpleHomeTiles';

vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: () => ({ simpleMode: true, setSimpleMode: vi.fn(), toggleSimpleMode: vi.fn() }),
}));

const theme = createTheme();
function Wrap({ children }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

describe('SimpleHomeTiles', () => {
  it('HomeMetricTile uses square org-action icon container', () => {
    const { container } = render(
      <Wrap>
        <HomeMetricTile
          iconName="BoltOutlined"
          fallback={BoltOutlinedIcon}
          kicker="Working on"
          value={3}
          subtitle="2 planning"
          onClick={vi.fn()}
        />
      </Wrap>
    );
    expect(container.querySelector('.mkt-tile--org-action .mkt-tile__icon')).toBeTruthy();
    expect(screen.getByText('Working on')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('HomeMetricTile renders a per-item breakdown and omits an empty subtitle', () => {
    render(
      <Wrap>
        <HomeMetricTile
          iconName="AttachMoneyOutlined"
          fallback={BoltOutlinedIcon}
          kicker="Tokens Spent"
          value="1.2M"
          breakdown={[
            { label: 'gpt-4o-mini', value: '$0.42' },
            { label: 'llama-3.3-70b', value: '$0.18' },
          ]}
          onClick={vi.fn()}
        />
      </Wrap>
    );
    expect(screen.getByText('Tokens Spent')).toBeTruthy();
    expect(screen.getByText('gpt-4o-mini')).toBeTruthy();
    expect(screen.getByText('$0.42')).toBeTruthy();
    expect(screen.getByText('llama-3.3-70b')).toBeTruthy();
    // No subtitle passed -> no empty subtitle node.
    expect(document.querySelector('.mkt-tile__subtitle')).toBeNull();
  });

  it('HomeCategoriesShowcase renders scroll carousel with explore header', () => {
    const onClick = vi.fn();
    render(
      <Wrap>
        <HomeCategoriesShowcase
          cards={[
            {
              key: 'requests',
              title: 'Requests',
              subtitle: 'Track goals',
              metrics: [{ value: 2, label: 'in flight' }],
              onClick,
            },
          ]}
        />
      </Wrap>
    );
    expect(screen.getByText('You can explore:')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Requests/i }));
    expect(onClick).toHaveBeenCalled();
  });
});
