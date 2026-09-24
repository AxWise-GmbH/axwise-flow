import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import NewsRow from './news/NewsRow';
import NewsThumb from './news/NewsThumb';
import { useT } from '../i18n/useT';
import {
  NEWS,
  NEWS_CATEGORIES,
  categoryLabel,
  formatNewsDate,
  localizePost,
  newsPath,
} from './news/news.data';
import './news/News.css';

const ALL = 'All';
// Only categories that have posts get a chip.
const FILTERS = [ALL, ...NEWS_CATEGORIES.filter((name) => NEWS.some((p) => p.category === name))];
const CARD_COUNT = 4;

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" className="onw-chevron" aria-hidden="true" focusable="false">
      <path d="M6 3.5L10.5 8 6 12.5" />
    </svg>
  );
}

// The last word and the chevron never part, so the chevron never sits alone on a line. A
// title without spaces (Chinese, Japanese) keeps its last character with the chevron.
function TitleWithChevron({ title }) {
  const space = title.lastIndexOf(' ');
  const cut = space >= 0 ? space + 1 : Math.max(title.length - 1, 0);
  return (
    <>
      {title.slice(0, cut)}
      <span className="onw-nowrap">
        {title.slice(cut)}
        <Chevron />
      </span>
    </>
  );
}

// The page as on x.ai/news: the newest post big, the next four as small cards, then every
// post as a row under "All posts". Each picture is the post's own article banner.
export default function NewsPage() {
  const { t, lang } = useT('nw');
  const [filter, setFilter] = useState(ALL);
  const featured = localizePost(NEWS[0], t);
  const cards = NEWS.slice(1, 1 + CARD_COUNT).map((post) => localizePost(post, t));
  const filterName = (name) => (name === ALL ? t('nw.filter.all', 'All') : categoryLabel(name, t));
  const rows = filter === ALL ? NEWS : NEWS.filter((post) => post.category === filter);

  return (
    <section className="oi-section onw" aria-labelledby="news-heading">
      <div className="oi-container">
        <h1 className="oi-sr-only" id="news-heading">
          {t('nw.heading', 'News')}
        </h1>

        <article className="onw-featured" aria-labelledby="news-featured-title">
          <div className="onw-featured-text">
            <p className="onw-featured-date">
              <time dateTime={featured.date}>{formatNewsDate(featured, lang)}</time>
            </p>
            <h2 className="onw-featured-title" id="news-featured-title">
              <RouterLink to={newsPath(featured.slug)}>{featured.title}</RouterLink>
            </h2>
            <p className="onw-featured-summary">{featured.summary}</p>
            <RouterLink
              to={newsPath(featured.slug)}
              className="onw-read"
              aria-label={t('nw.read.label', 'Read more: {title}', { title: featured.title })}
            >
              {t('nw.read.more', 'Read More')}
              <Chevron />
            </RouterLink>
          </div>
          {/* The cover repeats the title's link for the pointer only. */}
          <RouterLink
            to={newsPath(featured.slug)}
            className="onw-featured-cover-link"
            tabIndex={-1}
            aria-hidden="true"
          >
            <NewsThumb post={featured} className="onw-featured-cover" />
          </RouterLink>
        </article>

        <ul className="onw-cards" aria-label={t('nw.latest', 'Latest news')}>
          {cards.map((post) => (
            <li key={post.slug} className="onw-card">
              <RouterLink to={newsPath(post.slug)} className="onw-card-link">
                <NewsThumb post={post} still className="onw-card-cover" />
                <span className="onw-card-meta">
                  <span className="onw-card-cat">{post.category}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={post.date}>{formatNewsDate(post, lang)}</time>
                </span>
                <span className="onw-card-title">
                  <TitleWithChevron title={post.title} />
                </span>
              </RouterLink>
            </li>
          ))}
        </ul>

        <div className="onw-all">
          <h2 className="onw-all-heading" id="news-all-heading">
            {t('nw.all.heading', 'All posts')}
          </h2>
          <div className="onw-filters" role="group" aria-label={t('nw.filter.label', 'Filter news')}>
            {FILTERS.map((name) => (
              <button
                type="button"
                key={name}
                className="onw-chip"
                aria-pressed={filter === name}
                onClick={() => setFilter(name)}
              >
                {filterName(name)}
              </button>
            ))}
          </div>
        </div>

        <ul
          className="onw-rows"
          aria-label={
            filter === ALL
              ? t('nw.all.heading', 'All posts')
              : t('nw.filter.posts', '{category} posts', { category: categoryLabel(filter, t) })
          }
        >
          {rows.map((post) => (
            <NewsRow key={post.slug} post={post} />
          ))}
        </ul>
      </div>
    </section>
  );
}
