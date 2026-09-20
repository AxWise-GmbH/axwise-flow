import useInView from '../../../../components/Common/useInView';

/**
 * Content that arrives out of the dark: fade, rise and un-blur once it scrolls
 * into view. The CSS lives in instant.css ([data-reveal]); `delay` staggers siblings.
 * useInView already answers "shown" at once for reduced motion and for jsdom.
 */
export default function Reveal({ as: Tag = 'div', delay = 0, style, children, ...rest }) {
  const [ref, shown] = useInView({ threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
  return (
    <Tag
      ref={ref}
      data-reveal
      data-shown={shown}
      style={{ '--d': `${delay}ms`, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
