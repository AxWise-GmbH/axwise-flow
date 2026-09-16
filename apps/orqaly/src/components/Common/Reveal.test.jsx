import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Reveal from './Reveal';

describe('Reveal', () => {
  it('renders its children (visible immediately in jsdom)', () => {
    render(
      <Reveal delay={100}>
        <div>hello reveal</div>
      </Reveal>
    );
    expect(screen.getByText('hello reveal')).toBeInTheDocument();
  });
});
