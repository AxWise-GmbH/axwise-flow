import { useEffect, useState } from 'react';
import { Link as RouterLink, Navigate, useParams } from 'react-router-dom';
import InstantLayout from '../../InstantLayout';
import DownloadBlock from '../../DownloadBlock';
import NewsBanner from './banners/NewsBanner';
import NewsRow from './NewsRow';
import { useT } from '../../i18n/useT';
import {
  NEWS,
  findNews,
  formatNewsDate,
  loadNewsBody,
  localizePost,
  newsPath,
} from './news.data';
import './News.css';
import DirArrow from '../../ui/DirArrow';

const MORE_COUNT = 3;

// A body block: a string is a paragraph, { h } a section heading, { list } a bullet list.
function ArticleBlock({ block }) {
  if (typeof block === 'string') return <p>{block}</p>;
  if (block.h) return <h2 className="onw-body-heading">{block.h}</h2>;
  return (
    <ul className="onw-body-list">
      {block.list.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

// The article text arrives from its own file, in the language on show (English where that
// language has none). It shows soft lines while it loads, and a short note if it cannot load
// (a network drop, a stale deploy); the page stays up. A new language keeps the text on show
// until its own arrives.
function ArticleBody({ slug }) {
  const { t, lang } = useT('nw');
  const [state, setState] = useState({ slug: null, blocks: null, failed: false });

  useEffect(() => {
    let current = true;
    loadNewsBody(slug, lang).then(
      (blocks) => current && setState({ slug, blocks, failed: false }),
      () => current && setState({ slug, blocks: null, failed: true })
    );
    return () => {
      current = false;
    };
  }, [slug, lang]);

  if (state.slug !== slug) return <BodySkeleton />;
  if (state.failed) {
    return (
      <p className="onw-body-note">
        {t('nw.article.failed', 'This article did not load. Please try again in a moment.')}
      </p>
    );
  }
  return state.blocks.map((block, index) => <ArticleBlock key={index} block={block} />);
}

function BodySkeleton() {
  return (
    <div className="onw-body-skeleton" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

// The posts after this one (wrapping to the newest), so "More news" is never empty.
function morePosts(slug) {
  const at = NEWS.findIndex((post) => post.slug === slug);
  return Array.from({ length: MORE_COUNT }, (_, step) => NEWS[(at + step + 1) % NEWS.length]);
}

export default function NewsArticle() {
  const { slug } = useParams();
  const { t, lang } = useT('nw');
  const english = findNews(slug);

  // A new article starts at its top; the router keeps the old scroll position otherwise.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!english) return <Navigate to={newsPath()} replace />;
  const post = localizePost(english, t);

  return (
    <InstantLayout
      title={t('nw.article.title', 'Orqanix — {title}', { title: post.title })}
      translated
    >
      <article className="oi-section onw onw-article" aria-labelledby="news-article-heading">
        <div className="oi-container">
          <RouterLink to={newsPath()} className="onw-back">
            <DirArrow back /> {t('nw.article.back', 'All news')}
          </RouterLink>
          <header className="onw-article-head">
            <p className="onw-meta">
              <time dateTime={post.date}>{formatNewsDate(post, lang)}</time>
              <span aria-hidden="true">·</span>
              <span>{post.category}</span>
            </p>
            <h1 className="onw-article-title" id="news-article-heading">
              {post.title}
            </h1>
            <p className="onw-article-summary">{post.summary}</p>
          </header>

          {/* A picture: it keeps its left-to-right layout in every language. */}
          <div dir="ltr">
            <NewsBanner post={post} className="onw-article-banner" />
          </div>

          <div className="onw-body">
            <ArticleBody slug={post.slug} />
            {post.source && (
              <p className="onw-commit">
                {t('nw.article.commit', 'From commit')} <code>{post.source.commit}</code>
              </p>
            )}
          </div>

          <section className="onw-more" aria-labelledby="news-more-heading">
            <h2 className="onw-more-heading" id="news-more-heading">
              {t('nw.article.more', 'More news')}
            </h2>
            <ul className="onw-rows">
              {morePosts(post.slug).map((item) => (
                <NewsRow key={item.slug} post={item} />
              ))}
            </ul>
          </section>
        </div>
      </article>
      <DownloadBlock />
    </InstantLayout>
  );
}
