import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

import ComparisonMatrix from './ComparisonMatrix';

const competitors = [
  { id: 'orqaly', label: 'Orqaly', us: true },
  { id: 'rival', label: 'Rival Co' },
];

const rows = [
  { capability: 'Does the thing', values: { orqaly: true, rival: false } },
  { capability: 'Does the other thing', values: { orqaly: true, rival: 'partial' } },
];

function renderMatrix(props = {}) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <ComparisonMatrix
        title="Head to head"
        subtitle="Why we win"
        competitors={competitors}
        rows={rows}
        {...props}
      />
    </ThemeProvider>,
  );
}

describe('ComparisonMatrix', () => {
  it('renders the title, subtitle, and every competitor label', () => {
    renderMatrix();
    expect(screen.getByRole('heading', { name: 'Head to head' })).toBeInTheDocument();
    expect(screen.getByText('Why we win')).toBeInTheDocument();
    competitors.forEach((c) => {
      expect(screen.getByText(c.label)).toBeInTheDocument();
    });
  });

  it('renders every capability row', () => {
    renderMatrix();
    rows.forEach((r) => {
      expect(screen.getByText(r.capability)).toBeInTheDocument();
    });
  });

  it('renders the Yes / Partial / No legend', () => {
    renderMatrix();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Partial')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('supports a wide competitor set with a custom minWidth', () => {
    const many = [
      { id: 'orqaly', label: 'Orqaly', us: true },
      { id: 'a', label: 'Alpha AI' },
      { id: 'b', label: 'Beta AI' },
      { id: 'c', label: 'Gamma AI' },
    ];
    const wideRows = [
      { capability: 'Feature X', values: { orqaly: true, a: false, b: 'partial', c: true } },
    ];
    render(
      <ThemeProvider theme={createTheme()}>
        <ComparisonMatrix competitors={many} rows={wideRows} minWidth={900} />
      </ThemeProvider>,
    );
    ['Orqaly', 'Alpha AI', 'Beta AI', 'Gamma AI'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.getByText('Feature X')).toBeInTheDocument();
  });
});
