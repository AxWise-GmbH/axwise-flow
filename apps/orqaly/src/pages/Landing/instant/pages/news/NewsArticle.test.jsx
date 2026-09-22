import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NewsArticle from './NewsArticle';
import { NEWS, newsPath } from './news.data';
import BODIES from './news.bodies.json';

vi.mock('../../InstantLayout', () => ({
  default: ({ title, children }) => (
    <div data-title={title} data-testid="layout">
      {children}
    </div>
  ),
}));
vi.mock('../../DownloadBlock', () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path) {
  window.scrollTo = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => BODIES }))
  );
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/instant/news/:slug" element={<NewsArticle />} />
        <Route path="/instant/news" element={<p>news list</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('NewsArticle', () => {
  it('shows the post with its date, category, body and the commit it came from', async () => {
    renderAt('/instant/news/orqaly-and-axwise-merge');
    const post = NEWS.find((item) => item.slug === 'orqaly-and-axwise-merge');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(post.title);
    expect(screen.getByTestId('layout')).toHaveAttribute('data-title', `Orqanix — ${post.title}`);
    expect(screen.getByRole('article')).toHaveTextContent('Sep 13, 2026');
    expect(screen.getByRole('article')).toHaveTextContent('Company');
    // The text arrives from its own file after the page opens.
    const body = BODIES[post.slug];
    expect(await screen.findByText(body[0])).toBeInTheDocument();
    for (const block of body) {
      if (typeof block === 'string') expect(screen.getByText(block)).toBeInTheDocument();
      else if (block.h)
        expect(screen.getByRole('heading', { level: 2, name: block.h })).toBeInTheDocument();
      else for (const item of block.list) expect(screen.getByText(item)).toBeInTheDocument();
    }
    expect(screen.getByText('26e447a9')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All news/ })).toHaveAttribute('href', newsPath());
  });

  it("shows the post's moving banner without printing a title on it (owner rule)", () => {
    const { container } = renderAt('/instant/news/building-the-mobile-app');
    const post = NEWS.find((item) => item.slug === 'building-the-mobile-app');
    const banner = container.querySelector('.nb');
    expect(banner).toHaveAttribute('data-scene', post.cover);
    expect(banner.textContent).not.toContain(post.title);
  });

  it('leaves the commit line off a post that no commit backs yet', () => {
    const { container } = renderAt('/instant/news/building-the-mobile-app');
    expect(container.querySelector('.onw-commit')).toBeNull();
    expect(screen.getByRole('article')).toHaveTextContent('September 2026');
  });

  it('ends on three more posts, never the one being read', () => {
    renderAt(`/instant/news/${NEWS[NEWS.length - 1].slug}`);
    const more = screen.getByRole('region', { name: 'More news' });
    const hrefs = within(more)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(NEWS.slice(0, 3).map((post) => newsPath(post.slug)));
  });

  it('sends an unknown post back to the news list', () => {
    renderAt('/instant/news/not-a-post');
    expect(screen.getByText('news list')).toBeInTheDocument();
  });
});
