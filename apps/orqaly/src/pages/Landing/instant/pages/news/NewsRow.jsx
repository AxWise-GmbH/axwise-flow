import { Link as RouterLink } from 'react-router-dom';
import { useT } from '../../i18n/useT';
import { formatNewsDate, localizePost, newsPath } from './news.data';

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="onw-arrow" aria-hidden="true" focusable="false">
      <path d="M4 12L12 4M6 4h6v6" />
    </svg>
  );
}

// One post as a row: date | category | title and summary | arrow. The whole row is the link.
export default function NewsRow({ post: english }) {
  const { t, lang } = useT('nw');
  const post = localizePost(english, t);
  return (
    <li className="onw-row">
      <RouterLink to={newsPath(post.slug)} className="onw-row-link">
        <time className="onw-date" dateTime={post.date}>
          {formatNewsDate(post, lang)}
        </time>
        <span className="onw-cat">{post.category}</span>
        <span className="onw-row-text">
          <span className="onw-row-title">{post.title}</span>
          <span className="onw-row-summary">{post.summary}</span>
        </span>
        <Arrow />
      </RouterLink>
    </li>
  );
}
