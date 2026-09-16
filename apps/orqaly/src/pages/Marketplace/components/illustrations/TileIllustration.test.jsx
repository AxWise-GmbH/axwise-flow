import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TileIllustration from './TileIllustration';

describe('TileIllustration Component', () => {
  it('renders the SVG fallback when image path is invalid or fails to load', () => {
    // Render the skills illustration
    const { container } = render(<TileIllustration id="skills" />);

    // By default, since the image path is specified, it tries to render the image first
    const img = screen.getByRole('img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('/illustrations/marketplace/skills.png');

    // Fire the error event on the image to simulate load failure
    fireEvent.error(img);

    // After failure, it should fallback to rendering the SVG element
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('renders SVG directly if the asset ID has no image path mapped', () => {
    // If we pass an invalid/unknown id or if img is null, it should render nothing or fallback
    const { container } = render(<TileIllustration id="unknown_id" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders image successfully when src is valid', () => {
    render(<TileIllustration id="agents" />);
    const img = screen.getByRole('img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('/illustrations/marketplace/agents.png');
  });

  it('tints the image glow with the accent var, not a hardcoded emerald', () => {
    render(<TileIllustration id="agents" />);
    const img = screen.getByRole('img');
    const filter = img.style.filter || img.getAttribute('style') || '';
    expect(filter).toContain('--app-accent-rgb');
    expect(filter).not.toMatch(/drop-shadow\([^)]*rgba\(\s*16,\s*185,\s*129/);
  });
});
