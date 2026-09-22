import { useLayoutEffect, useRef } from 'react';
import NewsBanner from './banners/NewsBanner';

// The width the article banner is drawn at here. The scene lays itself out for this width
// (its wide layout, even on a phone), then the whole picture is scaled to fit the card.
const DRAWN_WIDTH = 1200;

/*
 * The post's article banner as a picture for the News list: the same scene, just smaller,
 * so a post looks the same on the list and on its page. `still` shows the scene's finished
 * frame until the card is pointed at or focused, then it plays.
 */
export default function NewsThumb({ post, still = false, className = '' }) {
  const frame = useRef(null);

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return undefined;
    const fit = () => element.style.setProperty('--nbt-scale', element.clientWidth / DRAWN_WIDTH);
    fit();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frame}
      dir="ltr"
      className={`onw-thumb ${className}`}
      data-still={still}
      style={{ '--nbt-width': `${DRAWN_WIDTH}px` }}
    >
      <NewsBanner post={post} className="onw-thumb-banner" />
    </div>
  );
}
