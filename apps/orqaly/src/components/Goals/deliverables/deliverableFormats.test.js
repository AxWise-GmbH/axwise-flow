/**
 * [module: frontend]
 *
 * The CSV parser is the part of the viewer that can be quietly wrong: a torn
 * row still renders as a table, just with every column after the tear shifted.
 */
import { describe, it, expect } from 'vitest';
import {
  VIEW_FORMAT,
  formatFromName,
  parseDelimited,
  splitDelimitedRow,
} from './deliverableFormats';

describe('formatFromName', () => {
  it('recognises the formats the viewer can render', () => {
    expect(formatFromName('plan.md')).toBe(VIEW_FORMAT.markdown);
    expect(formatFromName('export.csv')).toBe(VIEW_FORMAT.csv);
    expect(formatFromName('data.json')).toBe(VIEW_FORMAT.json);
    expect(formatFromName('deck.pdf')).toBe(VIEW_FORMAT.pdf);
    expect(formatFromName('hero.PNG')).toBe(VIEW_FORMAT.image);
  });

  it('sees past a query string on a signed URL', () => {
    expect(formatFromName('https://x.co/a/report.pdf?token=abc&x=1')).toBe(VIEW_FORMAT.pdf);
  });

  // A wrong guess shows the wrong viewer, so anything unknown declines and the
  // viewer offers the file instead of pretending to render it.
  it('declines to guess rather than guessing wrong', () => {
    expect(formatFromName('archive.xlsx')).toBeNull();
    expect(formatFromName('noextension')).toBeNull();
    expect(formatFromName('')).toBeNull();
  });
});

describe('splitDelimitedRow', () => {
  it('splits a plain row', () => {
    expect(splitDelimitedRow('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  // The failure that matters: in a financial plan most cells contain a comma.
  it('keeps a quoted comma inside its own cell', () => {
    expect(splitDelimitedRow('Q1,"$1,200",up')).toEqual(['Q1', '$1,200', 'up']);
  });

  it('unescapes a doubled quote', () => {
    expect(splitDelimitedRow('a,"she said ""hi""",b')).toEqual(['a', 'she said "hi"', 'b']);
  });

  it('keeps empty cells so the columns stay aligned', () => {
    expect(splitDelimitedRow('a,,c')).toEqual(['a', '', 'c']);
    expect(splitDelimitedRow(',b,')).toEqual(['', 'b', '']);
  });

  it('splits on whatever delimiter it is given', () => {
    expect(splitDelimitedRow('a\tb\tc', '\t')).toEqual(['a', 'b', 'c']);
  });
});

describe('parseDelimited', () => {
  it('reads a header and its rows', () => {
    expect(parseDelimited('name,cost\nAds,100\nTools,50')).toEqual([
      ['name', 'cost'],
      ['Ads', '100'],
      ['Tools', '50'],
    ]);
  });

  // A newline inside a quoted cell is content, not a new row. Splitting on it
  // turns one row into two and shifts everything below.
  it('keeps a quoted line break inside its cell', () => {
    const rows = parseDelimited('note,owner\n"line one\nline two",ana');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(['line one\nline two', 'ana']);
  });

  it('reads files written on Windows', () => {
    expect(parseDelimited('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  // So the viewer can tell "no rows" from "one blank row" and say so.
  it('returns nothing for an empty file', () => {
    expect(parseDelimited('')).toEqual([]);
    expect(parseDelimited('   \n  ')).toEqual([]);
  });
});
