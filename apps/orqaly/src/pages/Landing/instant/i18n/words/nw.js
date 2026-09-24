import { localeWords } from '../localize';
import {
  NEWS,
  NEWS_CATEGORIES,
  NEWS_SKIP,
  categoryKey,
  newsKey,
} from '../../pages/news/news.data';

// The News posts (pages/news/news.data.js): titles and summaries by newsKey, categories by
// categoryKey, as localizePost looks them up.
export default function words() {
  return Object.assign(
    {},
    ...NEWS.map((post) => localeWords(post, newsKey(post.slug), NEWS_SKIP)),
    Object.fromEntries(NEWS_CATEGORIES.map((name) => [categoryKey(name), name]))
  );
}
