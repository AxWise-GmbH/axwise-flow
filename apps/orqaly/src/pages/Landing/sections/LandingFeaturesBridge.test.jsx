import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import LandingFeaturesBridge, { scrollToFeaturesSection } from './LandingFeaturesBridge';

function renderBridge() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <LandingFeaturesBridge />
    </ThemeProvider>
  );
}

describe('LandingFeaturesBridge', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the centered CTA label', () => {
    renderBridge();
    expect(screen.getByRole('button', { name: 'Review Our Features' })).toBeInTheDocument();
  });

  it('scrolls to the product features section on click', () => {
    const target = document.createElement('section');
    target.id = 'product';
    document.body.appendChild(target);

    renderBridge();
    fireEvent.click(screen.getByRole('button', { name: 'Review Our Features' }));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    document.body.removeChild(target);
  });

  it('scrollToFeaturesSection targets #product', () => {
    const target = document.createElement('section');
    target.id = 'product';
    document.body.appendChild(target);

    scrollToFeaturesSection({ behavior: 'auto' });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'start',
    });

    document.body.removeChild(target);
  });
});
