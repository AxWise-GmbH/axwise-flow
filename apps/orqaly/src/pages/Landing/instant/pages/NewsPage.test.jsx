import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NewsPage from './NewsPage';
import { NEWS, newsPath } from './news/news.data';

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter>
      <NewsPage />
    </MemoryRouter>
  );
}

const rows = () =>
  within(screen.getByRole('list', { name: /posts$/ }))
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'));

describe('NewsPage', () => {
  it('opens on the newest post: date, title, summary, Read More and its moving banner', () => {
    const { container } = renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('News');
    const featured = screen.getByRole('article', { name: NEWS[0].title });
    expect(featured).toHaveTextContent('September 2026');
    expect(featured).toHaveTextContent(NEWS[0].summary);
    expect(within(featured).getByRole('heading', { level: 2 })).toHaveTextContent(NEWS[0].title);
    expect(
      within(featured).getByRole('link', { name: `Read more: ${NEWS[0].title}` })
    ).toHaveAttribute('href', newsPath(NEWS[0].slug));
    // The same moving scene as the article, playing, with no title printed on it.
    const cover = container.querySelector('.onw-featured-cover');
    expect(cover.querySelector('.nb')).toHaveAttribute('data-scene', NEWS[0].cover);
    expect(cover).toHaveAttribute('data-still', 'false');
    expect(cover.textContent).not.toContain(NEWS[0].title);
  });

  it('shows the next four posts as small cards under the big one, as on x.ai/news', () => {
    renderPage();
    const cards = within(screen.getByRole('list', { name: 'Latest news' })).getAllByRole(
      'listitem'
    );
    expect(cards).toHaveLength(4);
    cards.forEach((card, index) => {
      const post = NEWS[index + 1];
      expect(within(card).getByRole('link')).toHaveAttribute('href', newsPath(post.slug));
      expect(card).toHaveTextContent(post.category);
      expect(card).toHaveTextContent(post.title);
      // The post's own article banner, resting until the card is pointed at.
      const thumb = card.querySelector('.onw-card-cover');
      expect(thumb.querySelector('.nb')).toHaveAttribute('data-scene', post.cover);
      expect(thumb).toHaveAttribute('data-still', 'true');
    });
  });

  it('lists every post under "All posts", newest first, each linking to its article', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 2, name: 'All posts' })).toBeInTheDocument();
    expect(rows()).toEqual(NEWS.map((post) => newsPath(post.slug)));
    expect(screen.getAllByText('Sep 13, 2026', { selector: '.onw-date' })).toHaveLength(2);
  });

  it('filters the rows by category', () => {
    renderPage();
    const filters = screen.getByRole('group', { name: 'Filter news' });
    expect(within(filters).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(within(filters).getByRole('button', { name: 'Company' }));
    expect(rows()).toEqual(
      NEWS.filter((post) => post.category === 'Company').map((post) => newsPath(post.slug))
    );
    expect(within(filters).getByRole('button', { name: 'Company' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(within(filters).getByRole('button', { name: 'All' }));
    expect(rows()).toHaveLength(NEWS.length);
  });

  it('has no images, frames or canvases (landing rule)', () => {
    const { container } = renderPage();
    expect(container.querySelectorAll('img, iframe, video, canvas')).toHaveLength(0);
  });
});
