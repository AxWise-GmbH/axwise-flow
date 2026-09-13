import { describe, it, expect } from 'vitest';
import {
  pathFor,
  validatePath,
  assertValidPath,
  sanitizeFilename,
  parsePath,
  prefixForGoal,
  prefixForUser,
} from './path.js';

const U = '11111111-1111-4111-8111-111111111111';
const G = '22222222-2222-4222-8222-222222222222';

describe('pathFor', () => {
  it('builds the canonical path for valid inputs', () => {
    expect(pathFor({ userId: U, goalId: G, kind: 'pdf', filename: 'report.pdf' }))
      .toBe(`${U}/${G}/pdf/report.pdf`);
  });

  it('sanitizes the filename', () => {
    expect(pathFor({ userId: U, goalId: G, kind: 'image', filename: 'my photo!.png' }))
      .toBe(`${U}/${G}/image/my-photo-.png`);
  });

  it('strips path separators from filename', () => {
    expect(pathFor({ userId: U, goalId: G, kind: 'data', filename: 'a/b\\c.json' }))
      .toBe(`${U}/${G}/data/a-b-c.json`);
  });

  it('rejects non-UUID userId', () => {
    expect(() => pathFor({ userId: 'not-a-uuid', goalId: G, kind: 'pdf', filename: 'x.pdf' }))
      .toThrow(/userId must be a UUID/);
  });

  it('rejects non-UUID goalId', () => {
    expect(() => pathFor({ userId: U, goalId: 'bad', kind: 'pdf', filename: 'x.pdf' }))
      .toThrow(/goalId must be a UUID/);
  });

  it('rejects unknown kind', () => {
    expect(() => pathFor({ userId: U, goalId: G, kind: 'malware', filename: 'x' }))
      .toThrow(/not in allowed set/);
  });

  it('rejects empty filename', () => {
    expect(() => pathFor({ userId: U, goalId: G, kind: 'pdf', filename: '' }))
      .toThrow(/non-empty/);
  });
});

describe('validatePath', () => {
  it('accepts a valid canonical path', () => {
    const r = validatePath(`${U}/${G}/pdf/report.pdf`);
    expect(r.valid).toBe(true);
    expect(r.parsed).toEqual({ userId: U, goalId: G, kind: 'pdf', filename: 'report.pdf' });
  });

  it('accepts reserved prefixes for the relocation scripts', () => {
    expect(validatePath('_archive/old/file.pdf').valid).toBe(true);
    expect(validatePath('_quarantine/orphan.png').valid).toBe(true);
    expect(validatePath('_tmp/upload-in-progress').valid).toBe(true);
  });

  it('rejects empty/non-string', () => {
    expect(validatePath('').valid).toBe(false);
    expect(validatePath(null).valid).toBe(false);
    expect(validatePath(undefined).valid).toBe(false);
    expect(validatePath(123).valid).toBe(false);
  });

  it('rejects path traversal', () => {
    expect(validatePath(`${U}/../etc/passwd`).valid).toBe(false);
    expect(validatePath(`${U}//${G}/pdf/x.pdf`).valid).toBe(false);
  });

  it('rejects leading or trailing slash', () => {
    expect(validatePath(`/${U}/${G}/pdf/x.pdf`).valid).toBe(false);
    expect(validatePath(`${U}/${G}/pdf/x.pdf/`).valid).toBe(false);
  });

  it('rejects wrong number of segments', () => {
    expect(validatePath(`${U}/${G}/pdf`).valid).toBe(false);
    expect(validatePath(`${U}/${G}/pdf/sub/file.pdf`).valid).toBe(false);
  });

  it('rejects non-UUID segments', () => {
    expect(validatePath(`bob/${G}/pdf/x.pdf`).valid).toBe(false);
    expect(validatePath(`${U}/jenny/pdf/x.pdf`).valid).toBe(false);
  });

  it('rejects unknown kind', () => {
    expect(validatePath(`${U}/${G}/exe/x.exe`).valid).toBe(false);
  });

  it('rejects filenames with disallowed characters', () => {
    expect(validatePath(`${U}/${G}/pdf/file with spaces.pdf`).valid).toBe(false);
    expect(validatePath(`${U}/${G}/pdf/file!.pdf`).valid).toBe(false);
  });
});

describe('assertValidPath', () => {
  it('returns parsed parts on valid', () => {
    expect(assertValidPath(`${U}/${G}/pdf/x.pdf`)).toEqual({ userId: U, goalId: G, kind: 'pdf', filename: 'x.pdf' });
  });
  it('throws on invalid', () => {
    expect(() => assertValidPath(`${U}/bad/pdf/x.pdf`)).toThrow(/STORAGE_PATH_INVALID/);
  });
});

describe('sanitizeFilename', () => {
  it('replaces disallowed chars with -', () => {
    expect(sanitizeFilename('hello world!@#.txt')).toBe('hello-world-.txt');
  });
  it('collapses runs of dashes', () => {
    expect(sanitizeFilename('a   b   c')).toBe('a-b-c');
  });
  it('strips leading dots', () => {
    expect(sanitizeFilename('.env')).toBe('env');
    expect(sanitizeFilename('...gitignore')).toBe('gitignore');
  });
  it('caps length at 200', () => {
    const long = 'x'.repeat(500);
    expect(sanitizeFilename(long).length).toBe(200);
  });
  it('throws on empty', () => {
    expect(() => sanitizeFilename('')).toThrow(/non-empty/);
    expect(() => sanitizeFilename('....')).toThrow(/empty after sanitization/);
  });
  it('throws on non-string', () => {
    expect(() => sanitizeFilename(null)).toThrow(/non-empty/);
  });
});

describe('parsePath', () => {
  it('returns parsed parts for valid path', () => {
    expect(parsePath(`${U}/${G}/pdf/x.pdf`)).toEqual({ userId: U, goalId: G, kind: 'pdf', filename: 'x.pdf' });
  });
  it('returns null for invalid path', () => {
    expect(parsePath('garbage')).toBeNull();
  });
});

describe('prefixForGoal / prefixForUser', () => {
  it('builds goal prefix', () => {
    expect(prefixForGoal({ userId: U, goalId: G })).toBe(`${U}/${G}/`);
  });
  it('builds user prefix', () => {
    expect(prefixForUser({ userId: U })).toBe(`${U}/`);
  });
  it('rejects non-UUID', () => {
    expect(() => prefixForGoal({ userId: 'x', goalId: G })).toThrow();
    expect(() => prefixForUser({ userId: 'x' })).toThrow();
  });
});
