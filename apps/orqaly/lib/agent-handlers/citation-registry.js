/**
 * Citation Registry — accumulates and deduplicates sources during research tasks.
 *
 * Used by deep-research.js to track all URLs found during iterative web search.
 * Produces inline citation markers [1], [2] and a formatted References section.
 */

export class CitationRegistry {
  constructor() {
    this.sources = [];
  }

  /**
   * Add sources from web search results (Tavily format).
   * Deduplicates by URL.
   */
  addFromSearchResults(results) {
    const items = Array.isArray(results) ? results : results?.results || [];
    for (const r of items) {
      const url = r.url || r.link;
      if (!url) continue;
      if (this.sources.find((s) => s.url === url)) continue;
      let domain;
      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch { domain = url; }
      this.sources.push({
        id: this.sources.length + 1,
        url,
        title: r.title || '',
        snippet: (r.content || r.snippet || '').slice(0, 250),
        domain,
        addedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Format all sources as a markdown References section.
   */
  toReferencesMarkdown() {
    if (!this.sources.length) return '';
    return '## References\n\n' + this.sources.map((s) =>
      `[${s.id}] ${s.title} — ${s.url}`
    ).join('\n');
  }

  /**
   * Get sources formatted for injection into LLM prompt.
   */
  toPromptContext() {
    if (!this.sources.length) return '';
    return this.sources.map((s) =>
      `[${s.id}] "${s.title}" — ${s.url}\n  ${s.snippet}`
    ).join('\n\n');
  }

  /**
   * Stats for quality scoring.
   */
  getStats() {
    const domains = new Set(this.sources.map((s) => s.domain));
    return {
      totalSources: this.sources.length,
      uniqueDomains: domains.size,
      domains: [...domains],
      sources: this.sources,
    };
  }

  /**
   * Serialize for storage in DB (goal metadata, KB entries).
   */
  toJSON() {
    return this.sources;
  }
}
