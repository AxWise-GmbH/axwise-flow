import { dirOf } from '../i18n/languages';
import { useLang } from '../i18n/useT';

/**
 * A text arrow that points the way the reader reads: → onward (← with `back`), swapped on a
 * right-to-left page. Decoration only, so screen readers skip it.
 */
export default function DirArrow({ back = false, as: Tag = 'span', className }) {
  const rtl = dirOf(useLang()) === 'rtl';
  return (
    <Tag aria-hidden="true" className={className}>
      {back === rtl ? '→' : '←'}
    </Tag>
  );
}
