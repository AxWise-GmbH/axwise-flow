import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import InstantTopBar from './InstantTopBar';
import { SOLUTIONS_MENU, solutionPath } from './pages/solutions/solutionsMenu';
import { NAV_PRODUCTS } from './pages/products/productsMenu';

// The scene chunk has its own tests (ProductsPanel.test.jsx); here it never arrives.
vi.mock('./pages/products/scenes/loadScenes', () => ({
  peekScenes: () => null,
  loadScenes: () => new Promise(() => {}),
}));

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

// This jsdom has no PointerEvent, so fireEvent.pointerEnter would drop pointerType.
// React builds enter/leave from over/out, so those are what gets dispatched.
function movePointer(node, type, init = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  fireEvent(node, event);
}

describe('InstantTopBar - Solutions dropdown', () => {
  it('sits last in the bar, after Features, and starts closed', () => {
    renderBar();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const labels = [...nav.querySelectorAll('.oi-nav-link')].map((node) => node.textContent);
    expect(labels).toEqual(['Products', 'How it works', 'Features', 'Solutions']);
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

describe('InstantTopBar - Products menu, one panel at a time', () => {
  const products = () => mainNav().getByRole('button', { name: 'Products' });
  const solutions = () => mainNav().getByRole('button', { name: 'Solutions' });
  const panel = () => document.getElementById('oi-products-panel');

  afterEach(() => {
    vi.useRealTimers();
  });

  it('leads the bar as a button like Solutions, and starts closed', () => {
    renderBar();
    const button = products();
    expect(button).toHaveClass('oi-nav-link', 'oi-sol-button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'oi-products-panel');
    expect(button).toHaveAttribute('data-active', 'false');
    expect(panel()).not.toBeVisible();
  });

  it('marks Products as active on a product page', () => {
    renderBar('/instant/products/api');
    expect(products()).toHaveAttribute('data-active', 'true');
    expect(solutions()).toHaveAttribute('data-active', 'false');
  });

  it('opens and closes by click', () => {
    renderBar();
    fireEvent.click(products());
    expect(products()).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).toBeVisible();
    fireEvent.click(products());
    expect(products()).toHaveAttribute('aria-expanded', 'false');
    expect(panel()).not.toBeVisible();
  });

  it('opens on a resting pointer and closes once the pointer has gone', () => {
    vi.useFakeTimers();
    renderBar();
    movePointer(products(), 'pointerover');
    expect(products()).toHaveAttribute('aria-expanded', 'false');
    act(() => vi.advanceTimersByTime(120));
    expect(products()).toHaveAttribute('aria-expanded', 'true');

    movePointer(products(), 'pointerout', {
      relatedTarget: screen.getByRole('button', { name: 'Outside' }),
    });
    act(() => vi.advanceTimersByTime(239));
    expect(products()).toHaveAttribute('aria-expanded', 'true');
    act(() => vi.advanceTimersByTime(1));
    expect(products()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape and hands focus back to the button', () => {
    renderBar();
    fireEvent.click(products());
    const first = within(panel()).getAllByRole('link')[0];
    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(products()).toHaveAttribute('aria-expanded', 'false');
    expect(products()).toHaveFocus();
  });

  it('closes on Escape but leaves focus where it was, outside a panel a hover opened', () => {
    vi.useFakeTimers();
    renderBar();
    const outside = screen.getByRole('button', { name: 'Outside' });
    act(() => outside.focus());
    movePointer(products(), 'pointerover');
    act(() => vi.advanceTimersByTime(120));
    expect(products()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(outside, { key: 'Escape' });
    expect(products()).toHaveAttribute('aria-expanded', 'false');
    expect(outside).toHaveFocus();
  });

  it('closes on a press outside and when focus moves on', () => {
    renderBar();
    const outside = screen.getByRole('button', { name: 'Outside' });
    fireEvent.click(products());
    fireEvent.pointerDown(outside);
    expect(products()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(products());
    const last = within(panel()).getAllByRole('link').at(-1);
    act(() => last.focus());
    fireEvent.blur(last, { relatedTarget: outside });
    expect(products()).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps one panel open: a click on the other button swaps them', () => {
    renderBar();
    fireEvent.click(solutions());
    expect(solutions()).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(products());
    expect(products()).toHaveAttribute('aria-expanded', 'true');
    expect(solutions()).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('oi-solutions-panel')).not.toBeVisible();

    fireEvent.click(solutions());
    expect(solutions()).toHaveAttribute('aria-expanded', 'true');
    expect(products()).toHaveAttribute('aria-expanded', 'false');
    expect(panel()).not.toBeVisible();
  });

  it('switches at once when the pointer moves from one open menu to the other', () => {
    vi.useFakeTimers();
    renderBar();
    movePointer(solutions(), 'pointerover');
    act(() => vi.advanceTimersByTime(120));
    expect(solutions()).toHaveAttribute('aria-expanded', 'true');

    movePointer(solutions(), 'pointerout', { relatedTarget: products() });
    expect(products()).toHaveAttribute('aria-expanded', 'true');
    expect(solutions()).toHaveAttribute('aria-expanded', 'false');
    // Solutions' pending close was cancelled, and it could only ever close Solutions.
    act(() => vi.advanceTimersByTime(1000));
    expect(products()).toHaveAttribute('aria-expanded', 'true');
  });

  it('stays open while a slow pointer crosses the bar to the other menu, then switches', () => {
    vi.useFakeTimers();
    renderBar();
    const features = mainNav().getByRole('link', { name: 'Features' });
    movePointer(products(), 'pointerover');
    act(() => vi.advanceTimersByTime(120));

    // Out along the bar, past the links in between: the panel waits for the pointer.
    movePointer(products(), 'pointerout', { relatedTarget: features });
    act(() => vi.advanceTimersByTime(700));
    expect(products()).toHaveAttribute('aria-expanded', 'true');
    movePointer(features, 'pointerout', { relatedTarget: solutions() });
    expect(solutions()).toHaveAttribute('aria-expanded', 'true');
    expect(products()).toHaveAttribute('aria-expanded', 'false');

    // A pointer that rests on a link in the bar closes it in the end.
    movePointer(solutions(), 'pointerout', { relatedTarget: features });
    act(() => vi.advanceTimersByTime(1000));
    expect(solutions()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the next menu at once within 300ms of a leaving pointer closing the last', () => {
    vi.useFakeTimers();
    renderBar();
    const outside = screen.getByRole('button', { name: 'Outside' });
    movePointer(products(), 'pointerover');
    act(() => vi.advanceTimersByTime(120));
    movePointer(products(), 'pointerout', { relatedTarget: outside });
    act(() => vi.advanceTimersByTime(240));
    expect(products()).toHaveAttribute('aria-expanded', 'false');
    act(() => vi.advanceTimersByTime(290));
    movePointer(solutions(), 'pointerover');
    expect(solutions()).toHaveAttribute('aria-expanded', 'true');

    // Any later, and a pointer passing by has to rest on the button first.
    movePointer(solutions(), 'pointerout', { relatedTarget: outside });
    act(() => vi.advanceTimersByTime(240 + 300));
    movePointer(products(), 'pointerover');
    expect(products()).toHaveAttribute('aria-expanded', 'false');
    act(() => vi.advanceTimersByTime(120));
    expect(products()).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps the rest-first wait for a pointer that only passed over a closed button', () => {
    vi.useFakeTimers();
    renderBar();
    const outside = screen.getByRole('button', { name: 'Outside' });
    movePointer(products(), 'pointerover');
    act(() => vi.advanceTimersByTime(60));
    movePointer(products(), 'pointerout', { relatedTarget: outside });
    act(() => vi.advanceTimersByTime(240));
    movePointer(solutions(), 'pointerover');
    expect(solutions()).toHaveAttribute('aria-expanded', 'false');
    act(() => vi.advanceTimersByTime(120));
    expect(solutions()).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes only the menu that lost focus', () => {
    renderBar();
    const outside = screen.getByRole('button', { name: 'Outside' });
    fireEvent.click(products());
    fireEvent.blur(solutions(), { relatedTarget: outside });
    expect(products()).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes by itself when the page changes', () => {
    renderBar();
    fireEvent.click(products());
    fireEvent.click(mainNav().getByRole('link', { name: 'Features' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/instant/features');
    expect(products()).toHaveAttribute('aria-expanded', 'false');
  });
});

function sheetNav() {
  return screen.getByRole('navigation', { name: 'Menu' });
}

describe('InstantTopBar - phone menu bento', () => {
  it('draws the wide Products tile, two page tiles and the wide Solutions tile', () => {
    const { container } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = within(screen.getByRole('navigation', { name: 'Menu' }));
    expect(menu.getByRole('link', { name: 'How it works' })).toHaveAccessibleDescription(
      'Five steps, one chat'
    );
    expect(menu.getByRole('link', { name: 'Features' })).toHaveAccessibleDescription(
      'In the app today'
    );
    expect(container.querySelectorAll('.oi-bento-tile')).toHaveLength(4);
    const [products, solutions] = container.querySelectorAll('.oi-bento-wide');
    expect(products).toHaveTextContent(/^Products/);
    expect(products).toBe(container.querySelector('.oi-bento-tile'));
    expect(solutions).toHaveTextContent(/^SolutionsTen kinds of work/);
  });

  it('shows all ten solutions at once, in menu order; a tap goes there and closes', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = within(screen.getByRole('navigation', { name: 'Menu' }));
    // No accordion: nothing to open first. The only buttons are the product tabs.
    const buttons = [...sheetNav().querySelectorAll('button')];
    expect(buttons.map((button) => button.textContent)).toEqual(
      NAV_PRODUCTS.map((item) => item.label)
    );
    for (const button of buttons) expect(button).toHaveAttribute('role', 'tab');
    const list = within(menu.getByRole('list', { name: 'Solutions' }));
    expect(list.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(HREFS);

    fireEvent.click(list.getByRole('link', { name: /Creators/ }));
    expect(screen.getByTestId('where')).toHaveTextContent(solutionPath('creators'));
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('marks the page you are on, and lights the Solutions tile on a solutions page', () => {
    const { container } = renderBar(solutionPath('education'));
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = within(screen.getByRole('navigation', { name: 'Menu' }));
    expect(menu.getByRole('link', { current: 'page' })).toHaveAttribute(
      'href',
      solutionPath('education')
    );
    const solutions = menu.getByRole('list', { name: 'Solutions' }).closest('.oi-bento-tile');
    expect(solutions).toHaveAttribute('data-active', 'true');
    expect(container.querySelector('.oi-bento-tile')).toHaveAttribute('data-active', 'false');
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

describe('InstantTopBar - phone menu sheet', () => {
  const sheet = () => document.getElementById('oi-mobile-menu');
  const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.style.overflow = '';
  });

  it('lists the pages by name only, with no 01 02 03 in front of them', () => {
    renderBar();
    openMenu();
    const menu = within(screen.getByRole('navigation', { name: 'Menu' }));
    expect(menu.getByRole('link', { name: 'How it works' })).toBeInTheDocument();
    expect(menu.getByRole('link', { name: 'Features' })).toBeInTheDocument();
    expect(sheet().textContent).not.toMatch(/0[1-9]/);
  });

  it('holds the page still and out of reach while it is open', () => {
    renderBar();
    const outside = screen.getByRole('button', { name: 'Outside' });
    openMenu();
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(outside).toHaveAttribute('inert');
    expect(screen.getByTestId('where')).toHaveAttribute('inert');
    expect(document.querySelector('header')).not.toHaveAttribute('inert');

    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(document.documentElement.style.overflow).toBe('');
    expect(outside).not.toHaveAttribute('inert');
  });

  it('closes on Escape and hands focus back to the menu button', () => {
    renderBar();
    openMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('plays its exit, then is hidden', () => {
    vi.useFakeTimers();
    renderBar();
    openMenu();
    expect(sheet()).toHaveAttribute('data-state', 'open');
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(sheet()).toHaveAttribute('data-state', 'closing');
    expect(sheet()).not.toHaveAttribute('hidden');
    act(() => vi.advanceTimersByTime(180));
    expect(sheet()).toHaveAttribute('data-state', 'closed');
    expect(sheet()).toHaveAttribute('hidden');
  });

  it('closes by itself when the page changes some other way', () => {
    renderBar();
    openMenu();
    fireEvent.click(mainNav().getByRole('link', { name: 'Features' }));
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(document.documentElement.style.overflow).toBe('');
  });
});
