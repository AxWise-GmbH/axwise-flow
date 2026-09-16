import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import GemIcon, { GEMS, getGem, buildGemSvg, gemToDataUri } from './GemIcon';

describe('GemIcon data (GEMS)', () => {
  it('defines exactly the five gems in order', () => {
    expect(GEMS.map((g) => g.key)).toEqual([
      'emerald',
      'ruby',
      'peridot',
      'turquoise',
      'amethyst',
    ]);
  });

  it('gives every gem a valid #RRGGBB accent and a 6-shade ramp', () => {
    for (const g of GEMS) {
      expect(g.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(g.glow).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(g.ramp).toHaveLength(6);
      expect(g.name).toBeTruthy();
      expect(g.cut).toBeTruthy();
    }
  });

  it('has unique accent colors', () => {
    const accents = GEMS.map((g) => g.accent.toLowerCase());
    expect(new Set(accents).size).toBe(GEMS.length);
  });

  it('getGem resolves by key and returns null for unknown', () => {
    expect(getGem('ruby')).toBe(GEMS[1]);
    expect(getGem('sapphire')).toBeNull();
  });
});

describe('buildGemSvg', () => {
  it('builds a self-contained svg with aria-label for each gem', () => {
    for (const g of GEMS) {
      const svg = buildGemSvg(g.key, { animated: false });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('aria-label="' + g.name);
      expect(svg).toContain('</svg>');
    }
  });

  it('omits the animated sweep rect when animated is false', () => {
    expect(buildGemSvg('ruby', { animated: false })).not.toContain('-shine');
    expect(buildGemSvg('ruby', { animated: true })).toContain('-shine');
  });

  it('returns empty string for an unknown gem', () => {
    expect(buildGemSvg('sapphire')).toBe('');
  });
});

describe('gemToDataUri', () => {
  it('returns an svg data uri', () => {
    const uri = gemToDataUri('emerald');
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
  });

  it('is deterministic so selection comparisons work', () => {
    for (const g of GEMS) {
      expect(gemToDataUri(g.key)).toBe(gemToDataUri(g.key));
    }
  });

  it('produces a distinct uri per gem', () => {
    const uris = GEMS.map((g) => gemToDataUri(g.key));
    expect(new Set(uris).size).toBe(GEMS.length);
  });
});

describe('GemIcon component', () => {
  it('renders an svg with the gem aria-label', () => {
    const { container } = render(<GemIcon gem="amethyst" size={30} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('aria-label')).toContain('Amethyst');
  });

  it('renders nothing for an unknown gem', () => {
    const { container } = render(<GemIcon gem="sapphire" />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
