import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import WhoItsFor from './WhoItsFor';
import { PERSONAS } from '../../../data/personas';

function renderWithTheme(ui) {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>{ui}</ThemeProvider>
    </MemoryRouter>
  );
}

const INDUSTRIES = [
  'Healthcare',
  'Real estate',
  'E-commerce',
  'Hotels',
  'Education',
  'Legal',
  'Marketing',
  'Creators',
  'Freelancers',
  'Manufacturing',
];

describe('WhoItsFor use-cases carousel', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the section heading', () => {
    renderWithTheme(<WhoItsFor />);
    expect(screen.getByText('Orqaly in Practice')).toBeInTheDocument();
  });

  it('renders all 10 industry chips', () => {
    renderWithTheme(<WhoItsFor />);
    INDUSTRIES.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('every persona has teaser copy on the landing card', () => {
    PERSONAS.forEach((p) => {
      expect(p.teaser?.headline, `${p.slug} teaser.headline`).toBeTruthy();
      expect(p.teaser?.desc, `${p.slug} teaser.desc`).toBeTruthy();
    });
  });

  it('renders outcome-led headlines (first and last)', () => {
    renderWithTheme(<WhoItsFor />);
    expect(screen.getByText(PERSONAS[0].teaser.headline)).toBeInTheDocument();
    expect(screen.getByText(PERSONAS[PERSONAS.length - 1].teaser.headline)).toBeInTheDocument();
  });

  it('links each card Read more to its solution page', () => {
    renderWithTheme(<WhoItsFor />);
    const readMoreLinks = screen.getAllByRole('link', { name: /read more/i });
    expect(readMoreLinks).toHaveLength(PERSONAS.length);
    PERSONAS.forEach((p, i) => {
      expect(readMoreLinks[i]).toHaveAttribute('href', `/solutions/${p.slug}`);
    });
  });

  it('renders 10 dot buttons with descriptive aria-labels', () => {
    renderWithTheme(<WhoItsFor />);
    for (let i = 1; i <= 10; i += 1) {
      expect(screen.getByRole('tab', { name: `Go to use case ${i} of 10` })).toBeInTheDocument();
    }
  });

  it('clicking a dot triggers a scroll on the carousel container', () => {
    renderWithTheme(<WhoItsFor />);
    const fifthDot = screen.getByRole('tab', { name: 'Go to use case 5 of 10' });
    fireEvent.click(fifthDot);
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
  });
});
