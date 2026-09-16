import { describe, it, expect } from 'vitest';
import {
  parseBookmarksHtml,
  parseBookmarksJson,
  parseBookmarksFile,
} from './parseBookmarks.js';

const NETSCAPE_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://top.example.com" ADD_DATE="1700000000">Top level link</A>
    <DT><H3>Research</H3>
    <DL><p>
        <DT><A HREF="https://arxiv.org/abs/1234" ADD_DATE="1700000001">A paper</A>
        <DT><A HREF="https://news.ycombinator.com" ADD_DATE="1700000002">HN</A>
    </DL><p>
    <DT><H3>Competitors</H3>
    <DL><p>
        <DT><A HREF="https://rival.example.com">Rival</A>
        <DT><A HREF="javascript:void(0)">Not a real link</A>
    </DL><p>
</DL><p>`;

describe('parseBookmarksHtml', () => {
  it('extracts urls, titles, and folder-as-collection', () => {
    const out = parseBookmarksHtml(NETSCAPE_HTML);
    const byUrl = Object.fromEntries(out.map((b) => [b.url, b]));

    expect(byUrl['https://arxiv.org/abs/1234']).toMatchObject({
      title: 'A paper',
      collection: 'Research',
    });
    expect(byUrl['https://news.ycombinator.com'].collection).toBe('Research');
    expect(byUrl['https://rival.example.com'].collection).toBe('Competitors');
  });

  it('skips non-http(s) links (e.g. javascript:)', () => {
    const out = parseBookmarksHtml(NETSCAPE_HTML);
    expect(out.some((b) => b.url.startsWith('javascript:'))).toBe(false);
  });

  it('leaves top-level links without a real folder uncollected', () => {
    const out = parseBookmarksHtml(NETSCAPE_HTML);
    const top = out.find((b) => b.url === 'https://top.example.com');
    expect(top.collection).toBe('');
  });

  it('returns [] on empty or non-string input', () => {
    expect(parseBookmarksHtml('')).toEqual([]);
    expect(parseBookmarksHtml(null)).toEqual([]);
  });
});

describe('parseBookmarksJson', () => {
  const FIREFOX_JSON = {
    type: 'text/x-moz-place-container',
    title: '',
    children: [
      {
        type: 'text/x-moz-place-container',
        title: 'Reading',
        children: [
          { type: 'text/x-moz-place', title: 'Site A', uri: 'https://a.example.com' },
          { type: 'text/x-moz-place', title: '', uri: 'https://b.example.com' },
        ],
      },
    ],
  };

  it('walks the tree and uses container title as collection', () => {
    const out = parseBookmarksJson(FIREFOX_JSON);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      url: 'https://a.example.com',
      title: 'Site A',
      collection: 'Reading',
    });
    // Missing title falls back to the URL.
    expect(out[1].title).toBe('https://b.example.com');
  });

  it('returns [] on invalid JSON string', () => {
    expect(parseBookmarksJson('{not json')).toEqual([]);
  });
});

describe('parseBookmarksFile', () => {
  it('detects JSON by filename and dedupes by url', () => {
    const json = JSON.stringify({
      type: 'text/x-moz-place-container',
      children: [
        { type: 'text/x-moz-place', title: 'Dup', uri: 'https://dup.example.com' },
        { type: 'text/x-moz-place', title: 'Dup again', uri: 'https://dup.example.com' },
      ],
    });
    const out = parseBookmarksFile(json, 'backup.json');
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe('https://dup.example.com');
  });

  it('parses HTML when the file is not JSON', () => {
    const out = parseBookmarksFile(NETSCAPE_HTML, 'bookmarks.html');
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((b) => b.url === 'https://arxiv.org/abs/1234')).toBe(true);
  });
});
