import { useState, useCallback } from 'react';

/**
 * Lazily loads the long-form Markdown docs (public/documentation/notion.md).
 * Only fetches once, and only when load() is called (when the Full Docs tab opens).
 */
export function useNotionDoc() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (content) return;
    setLoading(true);
    try {
      const res = await fetch('/documentation/notion.md');
      setContent(await res.text());
    } catch {
      setContent(
        '# Project documentation\n\nCould not load the bundled Markdown. See docs/ in the repository for the full documentation.'
      );
    } finally {
      setLoading(false);
    }
  }, [content]);

  return { content, loading, load };
}

export default useNotionDoc;
