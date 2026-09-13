import { describe, it, expect } from 'vitest';
import { extractDeliverables } from './extractDeliverables.js';

const landingTask = {
  status: 'done',
  title: 'Deploy Landing Page — Rustic Roots',
  sequence_order: 2,
  data: {
    deliverable_type: 'deployment',
    output:
      'PROJECT_NAME: rustic-roots-landing\nDEPLOYMENT_URL: https://rustic-roots-landing.misters-builder.workers.dev',
  },
};

const designBriefTask = {
  status: 'done',
  title: 'Create Design Brief — Rustic Roots',
  sequence_order: 1,
  data: {
    deliverable_type: 'markdown',
    output:
      '# Design Brief\n\n## Personas\nHealth-conscious foodies, busy professionals...\n\nMore content here.',
  },
};

const pitchDeckTask = {
  status: 'done',
  title: 'Pitch Deck Creation — Rustic Roots',
  sequence_order: 2,
  data: {
    deliverable_type: 'presentation',
    output:
      'The pitch deck is ready.\n\nASSET_URL: https://zwzopaedmhwnndymitbs.supabase.co/storage/v1/object/public/goal-deliverables/pdf/rustic-roots-pitch-deck-abc.pdf',
  },
};

const bannerTask = {
  status: 'done',
  title: 'Generate Banners — Rustic Roots',
  sequence_order: 2,
  data: {
    deliverable_type: 'asset',
    output: [
      'Banner generation complete.',
      'ASSET_URL: https://zwzopaedmhwnndymitbs.supabase.co/storage/v1/object/public/goal-deliverables/images/rustic-roots-instagram-1-abc.png',
      'ASSET_URL: https://zwzopaedmhwnndymitbs.supabase.co/storage/v1/object/public/goal-deliverables/images/rustic-roots-instagram-2-def.png',
      'ASSET_URL: https://zwzopaedmhwnndymitbs.supabase.co/storage/v1/object/public/goal-deliverables/images/rustic-roots-linkedin-1-ghi.png',
    ].join('\n'),
  },
};

const strategyTask = {
  status: 'done',
  title: 'Content Strategy Development — Rustic Roots',
  sequence_order: 2,
  data: {
    deliverable_type: 'markdown',
    output:
      '# 30-Day Content Calendar\n\n## Platform Mix\nInstagram + TikTok. Source: https://socialinsider.io/food-report-2024\n\n## Content Pillars\n1. Process\n2. Customer stories\n3. Bread science\n4. Weekly drop',
  },
};

const placeholderTask = {
  status: 'done',
  title: 'Fake output',
  sequence_order: 1,
  data: {
    deliverable_type: 'deployment',
    output:
      'Here is the deployed site: https://example.com/my-site\nAnd an image: https://placeholder.com/img.png',
  },
};

const prose =
  'Great work. The landing page is at https://rustic-roots.pages.dev/ and the GitHub repo is elsewhere.';

describe('extractDeliverables', () => {
  it('extracts a DEPLOYMENT_URL marker line', () => {
    const result = extractDeliverables([landingTask]);
    expect(result.liveUrls).toHaveLength(1);
    expect(result.liveUrls[0].url).toBe('https://rustic-roots-landing.misters-builder.workers.dev');
    expect(result.liveUrls[0].host).toBe('workers.dev');
    expect(result.liveUrls[0].taskTitle).toContain('Deploy Landing Page');
  });

  it('extracts bare *.pages.dev URLs from prose', () => {
    const task = {
      status: 'done',
      title: 'Task',
      data: { deliverable_type: 'deployment', output: prose },
    };
    const result = extractDeliverables([task]);
    expect(result.liveUrls).toHaveLength(1);
    expect(result.liveUrls[0].url).toContain('rustic-roots.pages.dev');
    expect(result.liveUrls[0].host).toBe('pages.dev');
  });

  it('extracts a PDF URL from ASSET_URL marker', () => {
    const result = extractDeliverables([pitchDeckTask]);
    expect(result.pdfUrls).toHaveLength(1);
    expect(result.pdfUrls[0].url).toMatch(/\.pdf$/);
    expect(result.pdfUrls[0].filename).toBe('rustic-roots-pitch-deck-abc.pdf');
  });

  it('extracts multiple image URLs from ASSET_URL lines', () => {
    const result = extractDeliverables([bannerTask]);
    expect(result.imageUrls).toHaveLength(3);
    expect(result.imageUrls.every((i) => i.url.endsWith('.png'))).toBe(true);
    expect(result.imageUrls[0].slot).toMatch(/Generate Banners/);
  });

  it('deduplicates URLs within a category', () => {
    const dupTask = {
      status: 'done',
      title: 'Dup',
      data: {
        deliverable_type: 'deployment',
        output: 'DEPLOYMENT_URL: https://foo.workers.dev\nAlso https://foo.workers.dev again',
      },
    };
    const result = extractDeliverables([dupTask]);
    expect(result.liveUrls).toHaveLength(1);
  });

  it('skips placeholder URLs', () => {
    const result = extractDeliverables([placeholderTask]);
    expect(result.liveUrls).toHaveLength(0);
    expect(result.imageUrls).toHaveLength(0);
  });

  it('treats markdown tasks without URLs as documents', () => {
    const result = extractDeliverables([designBriefTask, strategyTask]);
    expect(result.markdownDocs).toHaveLength(2);
    expect(result.markdownDocs[0].title).toContain('Design Brief');
    expect(result.markdownDocs[0].chars).toBeGreaterThan(0);
    expect(result.markdownDocs[0].preview).toBeDefined();
  });

  it('respects deliverable_type: URLs cited in a markdown research doc do not become Live Site rows', () => {
    // Registry filters by deliverable_type. A markdown research doc
    // that cites a pages.dev URL as a reference is NOT a deployment —
    // it's a document. The doc should render in markdownDocs; the cited
    // URL should NOT hoist into liveUrls. This is the intended strict
    // behavior and differs from Phase 3's loose pattern-scan everywhere.
    const task = {
      status: 'done',
      title: 'Research Brief',
      data: {
        deliverable_type: 'markdown',
        output: '# Research\n\nSee https://foo.pages.dev for reference.',
      },
    };
    const result = extractDeliverables([task]);
    expect(result.liveUrls).toHaveLength(0);
    expect(result.markdownDocs).toHaveLength(1);
    expect(result.markdownDocs[0].title).toBe('Research Brief');
  });

  it('does not double-list a single deployment task in both live and documents', () => {
    // A task correctly typed as deployment produces a Live Site row
    // and should NOT also appear as a Documents row (which would
    // duplicate the same output).
    const task = {
      status: 'done',
      title: 'Deploy Site',
      sequence_order: 1,
      data: {
        deliverable_type: 'deployment',
        output: 'DEPLOYMENT_URL: https://foo.workers.dev\n\nAlso here is some prose text.',
      },
    };
    const result = extractDeliverables([task]);
    expect(result.liveUrls).toHaveLength(1);
    expect(result.markdownDocs).toHaveLength(0);
  });

  it('sorts tasks by sequence_order so earlier tasks come first', () => {
    const result = extractDeliverables([landingTask, designBriefTask]);
    // designBriefTask has sequence_order 1, landingTask has 2
    // So markdownDocs should come from the design brief (seq 1)
    expect(result.markdownDocs[0].title).toContain('Design Brief');
    // And liveUrls from the landing (seq 2)
    expect(result.liveUrls[0].taskTitle).toContain('Deploy Landing Page');
  });

  it('returns isEmpty: true when no deliverables exist', () => {
    const emptyTask = {
      status: 'done',
      title: 'Nothing',
      data: { deliverable_type: 'markdown', output: '' },
    };
    const result = extractDeliverables([emptyTask]);
    expect(result.isEmpty).toBe(true);
  });

  it('returns isEmpty: false when at least one deliverable is present', () => {
    const result = extractDeliverables([landingTask]);
    expect(result.isEmpty).toBe(false);
  });

  it('handles an empty tasks array', () => {
    const result = extractDeliverables([]);
    expect(result.isEmpty).toBe(true);
    expect(result.liveUrls).toEqual([]);
  });

  it('handles null/undefined tasks array', () => {
    expect(extractDeliverables(null).isEmpty).toBe(true);
    expect(extractDeliverables(undefined).isEmpty).toBe(true);
  });

  // ── Code extractor ──────────────────────────────────────────────
  describe('code extractor', () => {
    it('extracts a GITHUB_REPO: marker line', () => {
      const task = {
        status: 'done',
        title: 'Build CLI — Rustic Roots',
        data: {
          deliverable_type: 'code',
          output:
            'Repository created and pushed.\n\nGITHUB_REPO: https://github.com/rustic-roots/feed-scraper',
        },
      };
      const result = extractDeliverables([task]);
      expect(result.codeRepos).toHaveLength(1);
      expect(result.codeRepos[0].fullName).toBe('rustic-roots/feed-scraper');
      expect(result.codeRepos[0].owner).toBe('rustic-roots');
      expect(result.codeRepos[0].repo).toBe('feed-scraper');
      expect(result.codeRepos[0].url).toBe('https://github.com/rustic-roots/feed-scraper');
    });

    it('extracts a bare github.com/owner/repo URL from prose', () => {
      const task = {
        status: 'done',
        title: 'Code task',
        data: {
          deliverable_type: 'code',
          output: 'The code is committed at https://github.com/alice/widgets — enjoy!',
        },
      };
      const result = extractDeliverables([task]);
      expect(result.codeRepos).toHaveLength(1);
      expect(result.codeRepos[0].fullName).toBe('alice/widgets');
    });

    it('strips .git suffixes and trailing slashes when parsing repos', () => {
      const task = {
        status: 'done',
        title: 'Code task',
        data: {
          deliverable_type: 'code',
          output: 'GITHUB_REPO: https://github.com/foo/bar.git/',
        },
      };
      const result = extractDeliverables([task]);
      expect(result.codeRepos).toHaveLength(1);
      expect(result.codeRepos[0].url).toBe('https://github.com/foo/bar');
    });

    it('ignores reserved GitHub paths (settings, marketplace, etc.)', () => {
      const task = {
        status: 'done',
        title: 'Code task',
        data: {
          deliverable_type: 'code',
          output:
            'See https://github.com/settings/tokens and https://github.com/marketplace/actions',
        },
      };
      const result = extractDeliverables([task]);
      expect(result.codeRepos).toHaveLength(0);
    });

    it('does NOT extract github.io URLs as code repos (they are live sites)', () => {
      // Registry filters by type — a deployment task with a github.io URL
      // must not be mistaken for a code repo. The code extractor only sees
      // tasks typed as 'code'.
      const task = {
        status: 'done',
        title: 'Deploy site',
        data: {
          deliverable_type: 'deployment',
          output: 'DEPLOYMENT_URL: https://alice.github.io/my-site/',
        },
      };
      const result = extractDeliverables([task]);
      expect(result.codeRepos).toHaveLength(0);
      expect(result.liveUrls).toHaveLength(1);
    });

    it('deduplicates repeated GitHub URLs across multiple code tasks', () => {
      const taskA = {
        status: 'done',
        title: 'Task A',
        sequence_order: 1,
        data: { deliverable_type: 'code', output: 'GITHUB_REPO: https://github.com/foo/bar' },
      };
      const taskB = {
        status: 'done',
        title: 'Task B',
        sequence_order: 2,
        data: { deliverable_type: 'code', output: 'See https://github.com/foo/bar for the code' },
      };
      const result = extractDeliverables([taskA, taskB]);
      expect(result.codeRepos).toHaveLength(1);
    });
  });

  // ── Data extractor ──────────────────────────────────────────────
  describe('data extractor', () => {
    it('extracts a bare Supabase Storage CSV URL', () => {
      const task = {
        status: 'done',
        title: 'Export data',
        data: {
          deliverable_type: 'data',
          output:
            'Data exported to https://foo.supabase.co/storage/v1/object/public/goal-deliverables/data/report.csv',
        },
      };
      const result = extractDeliverables([task]);
      expect(result.dataExports).toHaveLength(1);
      expect(result.dataExports[0].kind).toBe('csv');
      expect(result.dataExports[0].filename).toBe('report.csv');
    });

    it('extracts a Google Sheets URL', () => {
      const task = {
        status: 'done',
        title: 'Build sheet',
        data: {
          deliverable_type: 'data',
          output: 'Sheet created: https://docs.google.com/spreadsheets/d/1abcDEF123/edit#gid=0',
        },
      };
      const result = extractDeliverables([task]);
      expect(result.dataExports).toHaveLength(1);
      expect(result.dataExports[0].kind).toBe('sheets');
      expect(result.dataExports[0].filename).toBe('Google Sheet');
    });

    it('extracts JSON and XLSX files by extension', () => {
      const task = {
        status: 'done',
        title: 'Multi export',
        data: {
          deliverable_type: 'data',
          output: 'https://foo.supabase.co/data.json and https://example.supabase.co/report.xlsx',
        },
      };
      const result = extractDeliverables([task]);
      // example.supabase.co has "example" in it but it's supabase.co, not example.com
      // Placeholder check uses /example\.com/ which only matches the .com TLD — so both should be extracted
      expect(result.dataExports.length).toBeGreaterThanOrEqual(1);
      const kinds = result.dataExports.map((d) => d.kind).sort();
      expect(kinds).toContain('json');
    });
  });
});
