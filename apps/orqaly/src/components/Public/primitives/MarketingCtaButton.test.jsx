import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import MarketingCtaButton from './MarketingCtaButton';
import MarketingCtaGlobalStyles from './MarketingCtaGlobalStyles';
import { MARKETING_CTA_DATA_ATTR } from '../../../theme/marketingCta';

function renderCta() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <div data-landing-root>
        <MarketingCtaGlobalStyles />
        <MarketingCtaButton component="a" href="/signup">
          Start free
        </MarketingCtaButton>
      </div>
    </ThemeProvider>,
  );
}

describe('MarketingCtaButton', () => {
  it('marks the button as a marketing CTA and uses outlined variant', () => {
    renderCta();
    const btn = screen.getByRole('link', { name: 'Start free' });
    expect(btn).toHaveAttribute(MARKETING_CTA_DATA_ATTR, '');
    expect(btn.className).toMatch(/MuiButton-outlined/);
  });
});

describe('MarketingCtaButton import paths', () => {
  it('public and landing pages import via @ alias (not fragile relative paths)', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const findJsxFiles = (directory) =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return findJsxFiles(path);
        return entry.isFile() && entry.name.endsWith('.jsx') ? [path] : [];
      });
    const files = findJsxFiles('src/pages').filter((file) =>
      readFileSync(file, 'utf8').includes('import MarketingCtaButton from'),
    );
    const bad = files.filter((f) => {
      const line = readFileSync(f, 'utf8').match(/import MarketingCtaButton from '([^']+)'/)?.[1];
      return line && !line.startsWith('@/');
    });
    expect(bad).toEqual([]);
  });
});
