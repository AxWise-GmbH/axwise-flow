import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom';
import InstantTopBar from './InstantTopBar';
import { aimsAt } from './useNavMenus';
import { NAV_PRODUCTS, productPath } from './pages/products/productsMenu';
import { loadScenes } from './pages/products/scenes/loadScenes';

// The real scene loader, watched; `offline` makes the chunk fail the way a stale deploy does.
const net = vi.hoisted(() => ({ offline: false }));
vi.mock('./pages/products/scenes/loadScenes', async (importOriginal) => {
  const real = await importOriginal();
  return {
    peekScenes: () => (net.offline ? null : real.peekScenes()),
    loadScenes: vi.fn(() =>
      net.offline ? Promise.reject(new Error('chunk failed')) : real.loadScenes()
    ),
  };
});

// Personalised Models keeps its page but is left out of the menus (nav: false).
const SLUGS = NAV_PRODUCTS.map((item) => item.slug);
const HREFS = SLUGS.map(productPath);
const LAST = SLUGS.length - 1;
const HIDDEN = productPath('personalised-models');
// One flag per product: true at index `on`.
const onlyAt = (on) => SLUGS.map((_, index) => index === on);

// The panel's own stylesheet, comments left out.
const PANEL_CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'ProductsPanel.css'),
  'utf8'
).replace(/\/\*[\s\S]*?\*\//g, '');

function Where() {
  return (
    <>
      <p data-testid="where">{useLocation().pathname}</p>
      <p data-testid="how">{useNavigationType()}</p>
    </>
  );
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

// This jsdom has no PointerEvent, so fireEvent.pointerEnter would drop pointerType.
// React builds enter/leave from over/out, so those are what gets dispatched.
function movePointer(node, type, init = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  fireEvent(node, event);
}

const bar = () => within(screen.getByRole('navigation', { name: 'Main navigation' }));
const panel = () => document.getElementById('oi-products-panel');
const rows = () => within(panel()).getAllByRole('link');
const lit = () => panel().querySelectorAll('.oi-pp-row[data-on]');
const stage = () => panel().querySelector('.oi-pp-stage');
const openPanel = () => fireEvent.click(bar().getByRole('button', { name: 'Products' }));
const openSheet = () => fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
const sheet = () => within(screen.getByRole('navigation', { name: 'Menu' }));
const tabs = () => sheet().getAllByRole('tab');
const tabPanel = () => sheet().getByRole('tabpanel');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  net.offline = false;
  document.documentElement.style.overflow = '';
  document.querySelectorAll('style[data-test]').forEach((style) => style.remove());
});

describe('ProductsPanel - the list', () => {
  it('lists the shown products in order, each with its line, linking to its page', () => {
    renderBar();
    openPanel();
    const list = within(panel()).getByRole('list', { name: 'Products' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(HREFS);
    links.forEach((link, index) => {
      expect(link.querySelector('b')).toHaveTextContent(NAV_PRODUCTS[index].label);
      expect(link.querySelector('small')).toHaveTextContent(NAV_PRODUCTS[index].line);
    });
  });

  it('leaves Personalised Models and its Coming soon out, and never an old or internal name', async () => {
    await act(() => loadScenes());
    const { container } = renderBar();
    openPanel();
    openSheet();
    const header = container.querySelector('header');

    expect(SLUGS).not.toContain('personalised-models');
    expect(header.querySelector(`a[href="${HIDDEN}"], #oi-pp-tab-personalised-models`)).toBeNull();
    expect(header.querySelector('[data-product="personalised-models"]')).toBeNull();
    expect(header.textContent).not.toMatch(/Personalised/i);
    expect(header.textContent).not.toMatch(/\b(soon|coming|planned|beta)\b/i);
    expect(header.textContent).not.toMatch(/Orqaly|AxWise/i);
  });

  it('starts both menus on Desktop App on the Personalised Models page, lighting no row', () => {
    const { container } = renderBar(HIDDEN);
    openPanel();
    expect([...lit()]).toEqual([rows()[0]]);
    expect(within(panel()).queryByRole('link', { current: 'page' })).toBeNull();
    openSheet();
    expect(sheet().getByRole('tab', { selected: true })).toHaveTextContent('Desktop App');
    expect(container.querySelector('.oi-bento-tile')).toHaveAttribute('data-active', 'false');
  });

  it('lights Desktop App by default', () => {
    renderBar();
    openPanel();
    expect([...lit()]).toEqual([rows()[0]]);
    expect(within(panel()).queryByRole('link', { current: 'page' })).toBeNull();
  });

  it('lights and marks the page you are on', () => {
    renderBar(productPath('api'));
    openPanel();
    const api = rows()[SLUGS.indexOf('api')];
    expect([...lit()]).toEqual([api]);
    expect(api).toHaveAttribute('aria-current', 'page');
  });

  it('follows hover and focus, and keeps the last row lit when the pointer leaves', () => {
    renderBar();
    openPanel();
    movePointer(rows()[2], 'pointerover');
    expect([...lit()]).toEqual([rows()[2]]);
    act(() => rows()[3].focus());
    expect([...lit()]).toEqual([rows()[3]]);
    movePointer(rows()[3], 'pointerout', {
      relatedTarget: screen.getByRole('button', { name: 'Outside' }),
    });
    expect([...lit()]).toEqual([rows()[3]]);
  });

  it('forgets the pick once it closes', () => {
    renderBar();
    openPanel();
    movePointer(rows()[4], 'pointerover');
    fireEvent.keyDown(document, { key: 'Escape' });
    openPanel();
    expect([...lit()]).toEqual([rows()[0]]);
  });

  it('waits for a pointer on its way to the preview, and lets it cross other rows', () => {
    vi.useFakeTimers();
    renderBar();
    openPanel();
    stage().getBoundingClientRect = () => ({ left: 320, right: 940, top: 0, bottom: 400 });
    const list = within(panel()).getByRole('list');

    movePointer(list, 'pointermove', { clientX: 100, clientY: 60 });
    movePointer(rows()[1], 'pointerover', { clientX: 130, clientY: 80 });
    expect([...lit()]).toEqual([rows()[0]]);
    act(() => vi.advanceTimersByTime(150));
    expect([...lit()]).toEqual([rows()[1]]);

    // Reaching the preview first keeps the row that was lit.
    movePointer(list, 'pointermove', { clientX: 140, clientY: 100 });
    movePointer(rows()[2], 'pointerover', { clientX: 170, clientY: 120 });
    movePointer(stage(), 'pointerover', { clientX: 330, clientY: 200 });
    act(() => vi.advanceTimersByTime(300));
    expect([...lit()]).toEqual([rows()[1]]);

    // Moving down the list (not toward the preview) switches at once.
    movePointer(list, 'pointermove', { clientX: 150, clientY: 200 });
    movePointer(rows()[3], 'pointerover', { clientX: 150, clientY: 260 });
    expect([...lit()]).toEqual([rows()[3]]);
  });

  it('drops a pending pick and the last pointer when it closes', () => {
    vi.useFakeTimers();
    renderBar();
    openPanel();
    stage().getBoundingClientRect = () => ({ left: 320, right: 940, top: 0, bottom: 400 });
    const list = () => within(panel()).getByRole('list');
    movePointer(list(), 'pointermove', { clientX: 100, clientY: 60 });
    movePointer(rows()[1], 'pointerover', { clientX: 130, clientY: 80 });
    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(150));

    // Reopened, the first row entered lights at once: the last opening's pointer is gone, so
    // this move (which would aim at the preview from it) is not taken for one.
    openPanel();
    expect([...lit()]).toEqual([rows()[0]]);
    movePointer(rows()[2], 'pointerover', { clientX: 130, clientY: 80 });
    expect([...lit()]).toEqual([rows()[2]]);
  });

  it('walks the rows with the arrow keys, wrapping, and jumps with Home and End', () => {
    renderBar();
    openPanel();
    act(() => rows()[0].focus());
    const press = (key) => fireEvent.keyDown(document.activeElement, { key });
    press('ArrowDown');
    expect(rows()[1]).toHaveFocus();
    expect([...lit()]).toEqual([rows()[1]]);
    press('ArrowUp');
    press('ArrowUp');
    expect(rows()[LAST]).toHaveFocus();
    press('ArrowDown');
    expect(rows()[0]).toHaveFocus();
    press('End');
    expect(rows()[LAST]).toHaveFocus();
    press('Home');
    expect(rows()[0]).toHaveFocus();
    expect([...lit()]).toEqual([rows()[0]]);
  });

  it('opens a product page from its row, or from the preview, and closes', () => {
    renderBar();
    const button = bar().getByRole('button', { name: 'Products' });
    openPanel();
    fireEvent.click(rows()[2]);
    expect(screen.getByTestId('where')).toHaveTextContent(productPath('api'));
    expect(button).toHaveAttribute('aria-expanded', 'false');

    openPanel();
    movePointer(rows()[1], 'pointerover');
    fireEvent.click(stage());
    expect(screen.getByTestId('where')).toHaveTextContent(productPath('mobile'));
    expect(button).toHaveAttribute('aria-expanded', 'false');

    // The page you are on: nothing to navigate to, the panel still closes.
    openPanel();
    fireEvent.click(stage());
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('replaces the history entry, not adds one, for a preview click on the page you are on', () => {
    renderBar(productPath('api'));
    openPanel();
    fireEvent.click(stage());
    expect(screen.getByTestId('where')).toHaveTextContent(productPath('api'));
    expect(screen.getByTestId('how')).toHaveTextContent('REPLACE');

    // Another product is a new page, so Back comes here again.
    openPanel();
    movePointer(rows()[1], 'pointerover');
    fireEvent.click(stage());
    expect(screen.getByTestId('where')).toHaveTextContent(productPath('mobile'));
    expect(screen.getByTestId('how')).toHaveTextContent('PUSH');
  });
});

describe('ProductsPanel - aimsAt', () => {
  const stageRect = { left: 300, top: 0, bottom: 400 };
  const at = (clientX, clientY) => ({ clientX, clientY });

  it('is true for a move right that would reach the stage within its height', () => {
    expect(aimsAt(at(100, 100), at(120, 110), stageRect)).toBe(true);
    expect(aimsAt(at(100, 300), at(110, 290), stageRect)).toBe(true);
  });

  it('is false for moves that stay in the list or miss the stage', () => {
    expect(aimsAt(null, at(120, 110), stageRect)).toBe(false);
    expect(aimsAt(at(120, 100), at(120, 140), stageRect)).toBe(false);
    expect(aimsAt(at(120, 100), at(100, 110), stageRect)).toBe(false);
    expect(aimsAt(at(100, 100), at(110, 160), stageRect)).toBe(false);
    expect(aimsAt(at(100, 20), at(110, 0), stageRect)).toBe(false);
    expect(aimsAt(at(290, 100), at(310, 100), stageRect)).toBe(false);
  });
});

describe('ProductsPanel - the preview', () => {
  it('mounts every scene only while open, with one of them lit', async () => {
    await act(() => loadScenes());
    const { container } = renderBar();
    expect(stage().children).toHaveLength(0);
    openPanel();
    expect(stage().querySelectorAll('.oi-pp-slot')).toHaveLength(SLUGS.length);
    expect(stage().querySelectorAll('.oi-pp-slot[data-on]')).toHaveLength(1);
    expect(stage()).toHaveAttribute('aria-hidden', 'true');
    expect(stage().querySelector('a, button, input, [tabindex]')).toBeNull();
    expect(container.querySelector('header').textContent).not.toMatch(/download/i);

    movePointer(rows()[3], 'pointerover');
    const slots = [...stage().querySelectorAll('.oi-pp-slot')];
    expect(slots.map((slot) => slot.hasAttribute('data-on'))).toEqual(onlyAt(3));

    fireEvent.click(bar().getByRole('button', { name: 'Products' }));
    expect(stage().children).toHaveLength(0);
  });

  it('hides the unlit layers once faded, rather than freezing them mid-fade', async () => {
    await act(() => loadScenes());
    const style = document.createElement('style');
    style.dataset.test = '';
    style.textContent = PANEL_CSS;
    document.head.append(style);
    renderBar();
    openPanel();
    movePointer(rows()[2], 'pointerover');
    const shown = () =>
      [...stage().querySelectorAll('.oi-pp-slot')].map((slot) => getComputedStyle(slot).display);
    expect(shown()).toEqual(onlyAt(2).map((on) => (on ? 'grid' : 'none')));

    // The same layers in the phone card.
    openSheet();
    const phone = [...tabPanel().querySelectorAll('.oi-pp-slot')];
    expect(phone.map((slot) => getComputedStyle(slot).display)).toEqual(
      onlyAt(0).map((on) => (on ? 'grid' : 'none'))
    );

    // Leaving: it keeps playing through the fade and drops out of display after it; arriving:
    // it fades in from nothing, the first time too. Nothing stills a layer (that flashed its
    // finished frame while it faded).
    const unlit = PANEL_CSS.match(/\.oi-pp-slot:not\(\[data-on\]\)\s*\{([^}]*)\}/)[1];
    expect(unlit).toMatch(/display:\s*none/);
    expect(unlit).toMatch(/opacity 280ms[^,;]*,\s*display 280ms allow-discrete/);
    expect(PANEL_CSS).toMatch(
      /@starting-style\s*\{\s*\.oi-pp-slot\[data-on\]\s*\{\s*opacity:\s*0;/
    );
    expect(PANEL_CSS).not.toMatch(/animation:\s*none\s*!important/);
    expect(PANEL_CSS).not.toMatch(/\.oi-pp-slot[^{]*\*/);
  });

  it('keeps each id once, with both menus open on a product page', async () => {
    await act(() => loadScenes());
    const { container } = renderBar(productPath('assistant-bot'));
    openPanel();
    openSheet();
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  it('leaves an empty card and a working bar when the scenes fail to load', async () => {
    net.offline = true;
    renderBar();
    openPanel();
    await act(async () => {});
    expect(stage().children).toHaveLength(0);
    expect(rows()).toHaveLength(SLUGS.length);
    fireEvent.click(bar().getByRole('button', { name: 'Solutions' }));
    expect(document.getElementById('oi-solutions-panel')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Orqanix - home' })).toBeInTheDocument();
  });
});

describe('ProductsPanel - preload', () => {
  it('fetches the scenes after a pause on a wide hover screen with no requestIdleCallback', () => {
    // This jsdom has no requestIdleCallback, like Safari. Offline, so nothing comes from cache.
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (query) => ({ matches: query.includes('hover: hover') }));
    net.offline = true;
    loadScenes.mockClear();
    renderBar();
    act(() => vi.advanceTimersByTime(1499));
    expect(loadScenes).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(loadScenes).toHaveBeenCalledTimes(1);
  });
});

describe('ProductsPanel - phone menu tabs', () => {
  it('loads the scenes when the phone menu opens, and not before', async () => {
    // Offline, nothing is cached, so the open menu has to ask for the chunk itself.
    net.offline = true;
    loadScenes.mockClear();
    renderBar();
    expect(loadScenes).not.toHaveBeenCalled();
    openSheet();
    await act(async () => {});
    expect(loadScenes).toHaveBeenCalled();
  });

  it('is a tab list of the shown products, Desktop App picked first', () => {
    renderBar();
    openSheet();
    expect(sheet().getByRole('tablist', { name: 'Products' })).toBeInTheDocument();
    expect(tabs().map((tab) => tab.textContent)).toEqual(NAV_PRODUCTS.map((item) => item.label));
    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toEqual(onlyAt(0).map(String));
    expect(tabs().map((tab) => tab.tabIndex)).toEqual(onlyAt(0).map((on) => (on ? 0 : -1)));
    expect(tabs()[0]).toHaveAttribute('aria-controls', tabPanel().id);
    expect(tabPanel()).toHaveAccessibleName('Desktop App');
    expect(within(tabPanel()).getByRole('link')).toHaveAttribute('href', productPath('desktop'));
  });

  it('switches the preview, the line and the Open link on a tap', async () => {
    await act(() => loadScenes());
    renderBar();
    openSheet();
    const api = SLUGS.indexOf('api');
    fireEvent.click(tabs()[api]);
    expect(tabs()[api]).toHaveAttribute('aria-selected', 'true');
    expect(tabs()[0]).toHaveAttribute('aria-selected', 'false');
    expect(tabPanel()).toHaveTextContent(NAV_PRODUCTS[api].line);
    const open = within(tabPanel()).getByRole('link');
    expect(open).toHaveAccessibleName('Open API');
    expect(open).toHaveAttribute('href', productPath('api'));
    const slots = [...tabPanel().querySelectorAll('.oi-pp-slot')];
    expect(slots.findIndex((slot) => slot.hasAttribute('data-on'))).toBe(api);
    expect(tabPanel().querySelectorAll('.oi-pp-slot[data-on]')).toHaveLength(1);
  });

  it('walks the tabs with Left and Right, wrapping, and focus follows', () => {
    renderBar();
    openSheet();
    act(() => tabs()[0].focus());
    fireEvent.keyDown(tabs()[0], { key: 'ArrowRight' });
    expect(tabs()[1]).toHaveFocus();
    expect(tabs()[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs()[1].tabIndex).toBe(0);
    expect(within(tabPanel()).getByRole('link')).toHaveAttribute('href', productPath('mobile'));
    fireEvent.keyDown(tabs()[1], { key: 'ArrowLeft' });
    fireEvent.keyDown(tabs()[0], { key: 'ArrowLeft' });
    expect(tabs()[LAST]).toHaveFocus();
    expect(tabs()[LAST]).toHaveAttribute('aria-selected', 'true');
    expect(tabPanel()).toHaveTextContent(NAV_PRODUCTS[LAST].line);
  });

  it('starts on the product page you are on, and lights the tile', () => {
    const { container } = renderBar(productPath('mobile'));
    openSheet();
    expect(sheet().getByRole('tab', { selected: true })).toHaveTextContent('Mobile App');
    expect(container.querySelector('.oi-bento-tile')).toHaveAttribute('data-active', 'true');
  });

  it('shows Coming soon under none of the shown products', () => {
    renderBar();
    openSheet();
    tabs().forEach((tab) => {
      fireEvent.click(tab);
      expect(tabPanel().textContent).not.toMatch(/soon/i);
    });
  });

  it('opens the product page and closes the menu', () => {
    renderBar();
    openSheet();
    fireEvent.click(tabs()[SLUGS.indexOf('assistant-bot')]);
    fireEvent.click(within(tabPanel()).getByRole('link', { name: 'Open Assistant Bot' }));
    expect(screen.getByTestId('where')).toHaveTextContent(productPath('assistant-bot'));
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('prints no 01 02 03 anywhere in the sheet, scenes included', async () => {
    await act(() => loadScenes());
    renderBar();
    openSheet();
    const text = () => document.getElementById('oi-mobile-menu').textContent;
    for (const tab of tabs()) {
      fireEvent.click(tab);
      expect(text()).not.toMatch(/0[1-9]/);
    }
  });
});
