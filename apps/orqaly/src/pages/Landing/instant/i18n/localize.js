/*
 * A whole data file in the current language, without one t() per line. Every string leaf of
 * `value` is looked up as `${prefix}.${path}` (path: object keys and array indexes, joined
 * by dots), its English as the fallback. Leaves under a key in `skip` are ids, links and
 * such, and stay as they are.
 *
 * localeWords walks the same way and lists { key: English }, for the translators' word list.
 */
export const SKIP_KEYS = new Set([
  'slug',
  'id',
  'key',
  'icon',
  'glyph',
  'href',
  'to',
  'path',
  'url',
  'date',
  'precision',
  'cover',
  'kind',
  'tone',
  'tier',
  'source',
  'scene',
  'variant',
]);

function walk(value, path, leaf, skip) {
  if (typeof value === 'string') return leaf(path, value);
  if (Array.isArray(value)) return value.map((item, index) => walk(item, `${path}.${index}`, leaf, skip));
  if (value && typeof value === 'object') {
    // Only plain data: components, dates and the like pass through untouched.
    if (Object.getPrototypeOf(value) !== Object.prototype) return value;
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        skip.has(name) ? item : walk(item, `${path}.${name}`, leaf, skip),
      ])
    );
  }
  return value;
}

export function localize(value, prefix, t, skip = SKIP_KEYS) {
  return walk(value, prefix, (key, english) => t(key, english), skip);
}

export function localeWords(value, prefix, skip = SKIP_KEYS) {
  const words = {};
  walk(
    value,
    prefix,
    (key, english) => {
      words[key] = english;
      return english;
    },
    skip
  );
  return words;
}
