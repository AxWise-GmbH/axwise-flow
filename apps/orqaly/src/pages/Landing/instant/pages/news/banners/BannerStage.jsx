import { Seen } from '../../../SpeedStrip';
import './banners.css';

/*
 * The frame every article banner plays in. The scene inside is one looping story told with
 * CSS keyframes on a shared clock (--nb-loop), so all its parts stay in step. Off screen,
 * Seen sets data-live="false" and every animation rests; under reduced motion none run and
 * the scene shows its finished frame. Owner rule: a banner carries no text at all, not even
 * UI labels. Where a label or a message would sit, draw <Words> (word-shaped bars) instead.
 */
export default function BannerStage({ scene, className = '', children }) {
  return (
    <Seen className={`nb ${className}`} data-scene={scene} aria-hidden="true" threshold={0}>
      <div className="nb-scene">{children}</div>
    </Seen>
  );
}

// Word-shaped bars in place of a line of text: one bar per word of `of`, each as long as
// the word (or one bar of `n` characters). Inside .nb-type they type open like text did.
// Spans, not <i>, so scene rules for small <i> parts never catch them. Nothing readable.
export function Words({ of = '', n, className = '' }) {
  const words = n
    ? [n]
    : of
        .split(' ')
        .filter(Boolean)
        .map((word) => word.length);
  return (
    <span className={`nb-words ${className}`}>
      {words.map((length, index) => (
        <span key={index} style={{ '--n': length }} />
      ))}
    </span>
  );
}
