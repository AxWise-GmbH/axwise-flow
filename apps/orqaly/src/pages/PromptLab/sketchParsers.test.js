import { describe, it, expect } from 'vitest';
import {
  stripExt,
  parseFrontmatter,
  parseMarkdown,
  parsePlainText,
  parseJson,
  parseSketchFile,
} from './sketchParsers.js';

describe('stripExt', () => {
  it('removes the last extension and path', () => {
    expect(stripExt('foo/bar/baz.md')).toBe('baz');
    expect(stripExt('plain')).toBe('plain');
    expect(stripExt('.hidden')).toBe('.hidden');
    expect(stripExt('')).toBe('Untitled');
  });
});

describe('parseFrontmatter', () => {
  it('returns empty meta when no frontmatter is present', () => {
    const { meta, body } = parseFrontmatter('just body');
    expect(meta).toEqual({});
    expect(body).toBe('just body');
  });

  it('parses simple key/value pairs and quoted strings', () => {
    const text = '---\ntitle: "Hello"\ndescription: A prompt\ntags: [a, b, "c d"]\n---\nbody here';
    const { meta, body } = parseFrontmatter(text);
    expect(meta.title).toBe('Hello');
    expect(meta.description).toBe('A prompt');
    expect(meta.tags).toEqual(['a', 'b', 'c d']);
    expect(body).toBe('body here');
  });
});

describe('parseMarkdown', () => {
  it('prefers frontmatter title, falls back to filename', () => {
    const fromMeta = parseMarkdown('x.md', '---\ntitle: Grand Plan\n---\nbody');
    expect(fromMeta.ok).toBe(true);
    expect(fromMeta.prompts[0].name).toBe('Grand Plan');
    expect(fromMeta.prompts[0].content).toBe('body');

    const fromFilename = parseMarkdown('my-prompt.md', '# hi\ncontent');
    expect(fromFilename.ok).toBe(true);
    expect(fromFilename.prompts[0].name).toBe('my-prompt');
  });

  it('rejects markdown that is empty after frontmatter', () => {
    const r = parseMarkdown('x.md', '---\ntitle: t\n---\n');
    expect(r.ok).toBe(false);
  });
});

describe('parsePlainText', () => {
  it('uses filename as name and trims content', () => {
    const r = parsePlainText('notes.txt', '  hello\n');
    expect(r.ok).toBe(true);
    expect(r.prompts[0].name).toBe('notes');
    expect(r.prompts[0].content).toBe('hello');
  });

  it('fails on empty input', () => {
    expect(parsePlainText('n.txt', '   ').ok).toBe(false);
  });
});

describe('parseJson', () => {
  it('parses a single object', () => {
    const r = parseJson('p.json', JSON.stringify({ name: 'X', content: 'hello' }));
    expect(r.ok).toBe(true);
    expect(r.prompts).toHaveLength(1);
    expect(r.prompts[0].name).toBe('X');
    expect(r.prompts[0].content).toBe('hello');
  });

  it('parses an array and numbers unnamed entries', () => {
    const r = parseJson('pack.json', JSON.stringify([{ content: 'a' }, { content: 'b' }]));
    expect(r.ok).toBe(true);
    expect(r.prompts).toHaveLength(2);
    expect(r.prompts[0].name).toBe('pack #1');
    expect(r.prompts[1].name).toBe('pack #2');
  });

  it('accepts "prompt" as a content alias', () => {
    const r = parseJson('p.json', JSON.stringify({ prompt: 'aliased' }));
    expect(r.ok).toBe(true);
    expect(r.prompts[0].content).toBe('aliased');
  });

  it('rejects records missing content', () => {
    const r = parseJson('p.json', JSON.stringify({ name: 'X' }));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/content/);
  });

  it('rejects invalid JSON with a helpful error', () => {
    const r = parseJson('p.json', '{not valid');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Invalid JSON/);
  });

  it('rejects an empty array', () => {
    expect(parseJson('p.json', '[]').ok).toBe(false);
  });
});

describe('parseSketchFile', () => {
  it('dispatches by extension', () => {
    expect(parseSketchFile('a.md', 'hi').ok).toBe(true);
    expect(parseSketchFile('a.txt', 'hi').ok).toBe(true);
    expect(parseSketchFile('a.json', '{"content":"hi"}').ok).toBe(true);
  });

  it('rejects unsupported extensions', () => {
    const r = parseSketchFile('a.docx', '...');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Unsupported/);
  });
});
