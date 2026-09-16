import { useState } from 'react';
import { transferableAbortController } from 'node:util';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantWorkflowNavigationGuard } from './AssistantWorkflowNavigationGuard.jsx';

const routers = [];
beforeEach(() => {
  // React Router uses the real Node Request supplied by this jsdom fixture.
  // Its signal must come from the same realm; no router/navigation is mocked.
  vi.stubGlobal(
    'AbortController',
    class {
      constructor() {
        return transferableAbortController();
      }
    }
  );
});
afterEach(() => {
  for (const router of routers.splice(0)) router.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function CurrentPage({ initiallyActive }) {
  const [active, setActive] = useState(initiallyActive);
  const [message, setMessage] = useState('Unsaved workflow question');
  return (
    <>
      <AssistantWorkflowNavigationGuard active={active} />
      <input
        aria-label="Existing composer"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <button onClick={() => setActive(false)}>Finish current work</button>
      <Link to="/next">Open another page</Link>
    </>
  );
}
function renderRouter(active = true) {
  const router = createMemoryRouter(
    [
      { path: '/assistant', element: <CurrentPage initiallyActive={active} /> },
      { path: '/next', element: <h1>Other page</h1> },
    ],
    { initialEntries: ['/assistant'] }
  );
  routers.push(router);
  return { ...render(<RouterProvider router={router} />), router };
}

describe('workflow navigation protection', () => {
  it('blocks actual router navigation and Stay keeps the original page and typed text', async () => {
    const { router } = renderRouter();
    fireEvent.change(screen.getByRole('textbox', { name: 'Existing composer' }), {
      target: { value: 'Keep this exact unsaved edit' },
    });
    fireEvent.click(screen.getByRole('link', { name: 'Open another page' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'unsaved edits or unconfirmed message text'
    );
    expect(router.state.location.pathname).toBe('/assistant');
    expect(screen.queryByRole('heading', { name: 'Other page' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Stay here' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe('/assistant');
    expect(screen.getByRole('textbox', { name: 'Existing composer' })).toHaveValue(
      'Keep this exact unsaved edit'
    );
  });

  it('Leave proceeds with the blocked destination and removes the mounted unload guard', async () => {
    const { router } = renderRouter();
    const before = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('link', { name: 'Open another page' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Leave this page' }));
    await screen.findByRole('heading', { name: 'Other page' });
    expect(router.state.location.pathname).toBe('/next');
    expect(screen.queryByRole('textbox', { name: 'Existing composer' })).toBeNull();
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it.each([false, true])(
    'allows ordinary navigation once inactive (initially active=%s)',
    async (active) => {
      const { router } = renderRouter(active);
      if (active) fireEvent.click(screen.getByRole('button', { name: 'Finish current work' }));
      fireEvent.click(screen.getByRole('link', { name: 'Open another page' }));
      await screen.findByRole('heading', { name: 'Other page' });
      expect(router.state.location.pathname).toBe('/next');
      expect(screen.queryByRole('dialog')).toBeNull();
    }
  );

  it('uses only a temporary beforeunload listener outside a data router and cleans up both transitions', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(<AssistantWorkflowNavigationGuard active={false} />);
    expect(add.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(0);
    view.rerender(<AssistantWorkflowNavigationGuard active />);
    const first = add.mock.calls.find(([type]) => type === 'beforeunload')[1];
    const active = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(active);
    expect(active.defaultPrevented).toBe(true);
    view.rerender(<AssistantWorkflowNavigationGuard active={false} />);
    expect(remove).toHaveBeenCalledWith('beforeunload', first);
    const inactive = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(inactive);
    expect(inactive.defaultPrevented).toBe(false);
    view.rerender(<AssistantWorkflowNavigationGuard active />);
    const last = add.mock.calls.filter(([type]) => type === 'beforeunload').at(-1)[1];
    view.unmount();
    expect(remove).toHaveBeenCalledWith('beforeunload', last);
    const unmounted = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unmounted);
    expect(unmounted.defaultPrevented).toBe(false);
  });
});
