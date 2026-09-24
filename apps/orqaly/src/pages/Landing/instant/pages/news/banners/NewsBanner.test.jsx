import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import NewsBanner, { BANNERS } from './NewsBanner';
import { NEWS } from '../news.data';

afterEach(cleanup);

describe('NewsBanner', () => {
  it('has a story scene for every cover the posts use', () => {
    for (const post of NEWS) expect(BANNERS[post.cover]).toBeTypeOf('function');
  });

  it.each(NEWS.map((post) => [post.slug, post]))(
    '%s: plays its own scene, hidden from assistive tech, with no text at all (owner rule)',
    (_, post) => {
      const { container } = render(<NewsBanner post={post} />);
      const banner = container.querySelector('.nb');
      expect(banner).toHaveAttribute('data-scene', post.cover);
      expect(banner).toHaveAttribute('aria-hidden', 'true');
      expect(banner.querySelector('.nb-scene')).not.toBeNull();
      // The headline above names the post; the banner never prints it.
      expect(banner.textContent).not.toContain(post.title);
      // Owner rule: no words anywhere on a banner, not even UI labels. Use <Words> bars.
      expect(banner.textContent.trim()).toBe('');
      expect(banner.querySelectorAll('h1, h2, h3, h4, h5, h6')).toHaveLength(0);
      expect(banner.querySelectorAll('img, canvas, video, iframe')).toHaveLength(0);
      expect(banner.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
    }
  );
});
