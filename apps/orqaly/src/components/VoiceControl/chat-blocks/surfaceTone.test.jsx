import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material';

import { getEnterpriseTheme } from '../../../theme/enterpriseTheme';
import ChatBlock from './index.jsx';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <div>{children}</div>,
  BarChart: ({ children }) => <div>{children}</div>,
  AreaChart: ({ children }) => <div>{children}</div>,
  Line: () => null,
  Bar: () => null,
  Area: () => null,
  XAxis: ({ stroke, tick }) => (
    <div data-testid="chart-x-axis" data-stroke={stroke} data-tick-fill={tick?.fill} />
  ),
  YAxis: ({ stroke, tick }) => (
    <div data-testid="chart-y-axis" data-stroke={stroke} data-tick-fill={tick?.fill} />
  ),
  CartesianGrid: ({ stroke }) => <div data-testid="chart-grid" data-stroke={stroke} />,
  Tooltip: ({ contentStyle }) => (
    <div
      data-testid="chart-tooltip"
      data-background={contentStyle?.background}
      data-color={contentStyle?.color}
    />
  ),
}));

const light = getEnterpriseTheme('light', null);

describe('ChatBlock surface tone', () => {
  it('keeps chart SVG and tooltip tokens readable on a dark studio inside a light app', () => {
    render(
      <ThemeProvider theme={light}>
        <ChatBlock
          surfaceTone="dark"
          block={{
            id: 'chart-1',
            type: 'chart',
            compact: {
              title: 'Pilot progress',
              kind: 'line',
              data: [{ label: 'Week 1', value: 1 }],
            },
          }}
        />
      </ThemeProvider>
    );

    expect(screen.getByTestId('chart-x-axis')).toHaveAttribute(
      'data-stroke',
      'rgba(255, 255, 255, 0.4)'
    );
    expect(screen.getByTestId('chart-x-axis')).toHaveAttribute(
      'data-tick-fill',
      'rgba(255, 255, 255, 0.5)'
    );
    expect(screen.getByTestId('chart-y-axis')).toHaveAttribute(
      'data-tick-fill',
      'rgba(255, 255, 255, 0.5)'
    );
    expect(screen.getByTestId('chart-grid')).toHaveAttribute(
      'data-stroke',
      'rgba(255, 255, 255, 0.06)'
    );
    expect(screen.getByTestId('chart-tooltip')).toHaveAttribute('data-background', '#111');
    expect(screen.getByTestId('chart-tooltip')).toHaveAttribute('data-color', '#fff');
  });
});
