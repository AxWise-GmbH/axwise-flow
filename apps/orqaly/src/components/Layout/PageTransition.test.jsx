import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PageTransition from './PageTransition';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<PageTransition />}>
          <Route path="/assistant" element={<div data-testid="child">assistant</div>} />
          <Route path="/home" element={<div data-testid="child">home</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

// Emotion serializes the `sx` into a generated class and inserts the CSS into a
// <style> tag (speedy off under NODE_ENV=test). Read back the rule for the
// wrapper's own class so each assertion is isolated from prior renders.
function animationFor(container) {
  const cls = container.firstChild
    .getAttribute('class')
    .split(' ')
    .find((c) => c.startsWith('css-'));
  const css = Array.from(document.querySelectorAll('style'))
    .map((s) => s.textContent)
    .join('\n');
  const match = css.match(new RegExp(`\\.${cls}\\{([^}]*)\\}`));
  return match ? match[1] : '';
}

describe('PageTransition', () => {
  it('renders the routed child via the outlet', () => {
    const { getByTestId } = renderAt('/home');
    expect(getByTestId('child')).toHaveTextContent('home');
  });

  it('uses the slide-up animation when entering /assistant', () => {
    const { container } = renderAt('/assistant');
    expect(animationFor(container)).toContain('pageSlideIn 0.42s');
  });

  it('keeps the subtle fade on other routes', () => {
    const { container } = renderAt('/home');
    expect(animationFor(container)).toContain('pageFadeIn 0.28s');
  });
});
