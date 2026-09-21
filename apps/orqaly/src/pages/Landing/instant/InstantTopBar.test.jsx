import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import InstantTopBar from './InstantTopBar';
import { SOLUTIONS_MENU, solutionPath } from './pages/solutions/solutionsMenu';

const HREFS = SOLUTIONS_MENU.map((item) => solutionPath(item.slug));

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderBar(path = '/instant') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <InstantTopBar />
              <Where />
              <button type="button">Outside</button>
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

function mainNav() {
  return within(screen.getByRole('navigation', { name: 'Main navigation' }));
}

describe('InstantTopBar - Solutions dropdown', () => {
  it('sits last in the bar, after Features, and starts closed', () => {
    renderBar();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const labels = [...nav.querySelectorAll('.oi-nav-link')].map((node) => node.textContent);
    expect(labels).toEqual(['How it works', 'Features', 'Solutions']);
    const button = mainNav().getByRole('button', { name: 'Solutions' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'oi-solutions-panel');
    expect(document.getElementById('oi-solutions-panel')).not.toBeVisible();
    expect(mainNav().getAllByRole('link')).toHaveLength(3);
  });

  it('opens and closes by click and lists the ten pages in order', () => {
    renderBar();
    const button = mainNav().getByRole('button', { name: 'Solutions' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = document.getElementById('oi-solutions-panel');
    expect(panel).toBeVisible();
    const links = within(panel).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(HREFS);
    expect(links[0]).toHaveTextContent(SOLUTIONS_MENU[0].label);
    expect(links[0]).toHaveTextContent(SOLUTIONS_MENU[0].line);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(panel).not.toBeVisible();
  });

  it('closes on Escape and hands focus back to the button', () => {
    renderBar();
    const button = mainNav().getByRole('button', { name: 'Solutions' });
    fireEvent.click(button);
    const first = within(document.getElementById('oi-solutions-panel')).getAllByRole('link')[0];
    first.focus();
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('closes on a press outside and when focus moves on', () => {
    renderBar();
    const button = mainNav().getByRole('button', { name: 'Solutions' });
    const outside = screen.getByRole('button', { name: 'Outside' });
    fireEvent.click(button);
    fireEvent.pointerDown(outside);
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button);
    const last = within(document.getElementById('oi-solutions-panel')).getAllByRole('link')[9];
    last.focus();
    fireEvent.blur(last, { relatedTarget: outside });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('navigates, closes, and marks the page it is on', () => {
    renderBar();
    fireEvent.click(mainNav().getByRole('button', { name: 'Solutions' }));
    fireEvent.click(mainNav().getByRole('link', { name: /Legal/ }));
    expect(screen.getByTestId('where')).toHaveTextContent(solutionPath('legal'));
    const button = mainNav().getByRole('button', { name: 'Solutions' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('data-active', 'true');

    fireEvent.click(button);
    const current = mainNav().getAllByRole('link', { current: 'page' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('href', solutionPath('legal'));
  });

  it('shows no active style away from the solutions pages', () => {
    renderBar('/instant/features');
    expect(mainNav().getByRole('button', { name: 'Solutions' })).toHaveAttribute(
      'data-active',
      'false'
    );
    expect(mainNav().getByRole('link', { name: 'Features' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});

describe('InstantTopBar - phone menu', () => {
  it('keeps Solutions as an accordion of ten links inside the sheet', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = within(screen.getByRole('navigation', { name: 'Menu' }));
    const accordion = menu.getByRole('button', { name: /Solutions/ });
    expect(accordion).toHaveAttribute('aria-expanded', 'false');
    expect(accordion).toHaveAttribute('aria-controls', 'oi-sheet-solutions');
    expect(menu.getAllByRole('link')).toHaveLength(3);

    fireEvent.click(accordion);
    expect(accordion).toHaveAttribute('aria-expanded', 'true');
    const list = within(document.getElementById('oi-sheet-solutions'));
    expect(list.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(HREFS);

    fireEvent.click(list.getByRole('link', { name: /Creators/ }));
    expect(screen.getByTestId('where')).toHaveTextContent(solutionPath('creators'));
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('starts with the accordion open on a solutions page, with the page marked', () => {
    renderBar(solutionPath('education'));
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = within(screen.getByRole('navigation', { name: 'Menu' }));
    expect(menu.getByRole('button', { name: /Solutions/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(menu.getByRole('link', { current: 'page' })).toHaveAttribute(
      'href',
      solutionPath('education')
    );
  });
});

describe('InstantTopBar - labels and menu button', () => {
  it('calls the download button "Try For Free" in the bar and in the phone menu', () => {
    const { container } = renderBar();
    expect(mainNav().getByRole('link', { name: 'Try For Free' })).toHaveAttribute(
      'href',
      '#download'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = within(screen.getByRole('navigation', { name: 'Menu' }));
    expect(menu.getByRole('link', { name: 'Try For Free' })).toHaveAttribute('href', '#download');
    expect(container.querySelector('header').textContent).not.toMatch(/download/i);
  });

  it('draws the phone menu button as three equal lines', () => {
    renderBar();
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle.querySelectorAll('.oi-menu-icon i')).toHaveLength(3);
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });
});
