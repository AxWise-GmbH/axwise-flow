import { describe, it, expect } from 'vitest';
import {
  parseEnv,
  parseJson,
  parseCsv,
  parseAndMap,
  mapNameToProvider,
  detectFormatFromFilename,
  maskForPreview,
} from './key-import-parsers.js';

describe('parseEnv', () => {
  it('parses basic KEY=value', () => {
    const out = parseEnv('OPENAI_API_KEY=sk-test-123\nANTHROPIC_API_KEY=sk-ant-456\n');
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ name: 'OPENAI_API_KEY', value: 'sk-test-123' });
    expect(out[1]).toEqual({ name: 'ANTHROPIC_API_KEY', value: 'sk-ant-456' });
  });

  it('handles export prefix and quoted values', () => {
    const out = parseEnv(`export GROQ_API_KEY="gsk_hello_world_1234"\nexport OPENAI_API_KEY='sk-single-quoted'\n`);
    expect(out).toHaveLength(2);
    expect(out[0].value).toBe('gsk_hello_world_1234');
    expect(out[1].value).toBe('sk-single-quoted');
  });

  it('skips comments and blank lines', () => {
    const out = parseEnv(`# comment\nFOO=bar\n\n\n# another`);
    expect(out).toEqual([{ name: 'FOO', value: 'bar' }]);
  });

  it('rejects binary/control characters', () => {
    const out = parseEnv('FOO=abc\x00def\nBAR=plain');
    expect(out).toEqual([{ name: 'BAR', value: 'plain' }]);
  });

  it('dedupes identical name+value pairs', () => {
    const out = parseEnv('FOO=1\nFOO=1\nFOO=1');
    expect(out).toHaveLength(1);
  });
});

describe('parseJson', () => {
  it('parses a flat object', () => {
    const out = parseJson('{"OPENAI_API_KEY":"sk-abc","GROQ_API_KEY":"gsk_def"}');
    expect(out).toHaveLength(2);
  });

  it('unwraps {value: ...} shape (Doppler-like)', () => {
    const out = parseJson(JSON.stringify({
      OPENAI_API_KEY: { value: 'sk-doppler', computed: 'sk-doppler', note: 'prod' },
    }));
    expect(out).toEqual([{ name: 'OPENAI_API_KEY', value: 'sk-doppler' }]);
  });

  it('descends into one-level nesting ({ secrets: {...} })', () => {
    const out = parseJson(JSON.stringify({
      secrets: { OPENAI_API_KEY: 'sk-1', ANTHROPIC_API_KEY: 'sk-ant-2' },
    }));
    expect(out).toHaveLength(2);
  });

  it('returns [] on invalid JSON', () => {
    expect(parseJson('not json {')).toEqual([]);
  });
});

describe('parseCsv', () => {
  it('parses 1Password CSV (name + password columns)', () => {
    const csv = `name,url,username,password,notes
OpenAI Prod,https://platform.openai.com,jamie@x.com,sk-1p-abc,prod key
Anthropic Console,,,sk-ant-1p-def,`;
    const out = parseCsv(csv);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ name: 'OpenAI Prod', value: 'sk-1p-abc' });
    expect(out[1]).toEqual({ name: 'Anthropic Console', value: 'sk-ant-1p-def' });
  });

  it('parses Bitwarden CSV (name + login_password columns)', () => {
    const csv = `folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp
,,login,OpenAI,,,0,,,sk-bw-abc,
,,login,Groq,,,0,,,gsk_bw_def,`;
    const out = parseCsv(csv);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ name: 'OpenAI', value: 'sk-bw-abc' });
  });

  it('respects quoted cells containing commas', () => {
    const csv = `name,password\n"Provider, Inc.","sk-has,comma"`;
    const out = parseCsv(csv);
    expect(out).toEqual([{ name: 'Provider, Inc.', value: 'sk-has,comma' }]);
  });

  it('returns [] if no suitable value column', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([]);
  });
});

describe('mapNameToProvider', () => {
  it('matches env-var name to provider id', () => {
    expect(mapNameToProvider('OPENAI_API_KEY')).toBe('llm:openai');
    expect(mapNameToProvider('groq_api_key')).toBe('llm:groq');
    expect(mapNameToProvider('ANTHROPIC_API_KEY')).toBe('llm:anthropic');
  });

  it('matches label (case-insensitive) — 1Password/Bitwarden friendly', () => {
    expect(mapNameToProvider('OpenAI')).toBe('llm:openai');
    expect(mapNameToProvider('Anthropic')).toBe('llm:anthropic');
  });

  it('partial-matches labels ("OpenAI Prod Key" → llm:openai)', () => {
    expect(mapNameToProvider('OpenAI Prod Key')).toBe('llm:openai');
  });

  it('returns null on unknown names', () => {
    expect(mapNameToProvider('SOME_RANDOM_THING')).toBeNull();
  });
});

describe('parseAndMap', () => {
  it('masks values and flags matched/unknown', () => {
    const out = parseAndMap('OPENAI_API_KEY=sk-proj-abcdefghijklmnopwXyZ\nFOO=bar', 'env');
    expect(out).toHaveLength(2);
    const openai = out.find((e) => e.name === 'OPENAI_API_KEY');
    const foo = out.find((e) => e.name === 'FOO');
    expect(openai.provider).toBe('llm:openai');
    expect(openai.matched).toBe(true);
    expect(openai.maskedPreview).toMatch(/sk-proj•+wXyZ/);
    expect(foo.matched).toBe(false);
    expect(foo.provider).toBeNull();
  });

  it('auto-detects env-vs-json for paste format', () => {
    const envOut = parseAndMap('GROQ_API_KEY=gsk_abc', 'paste');
    expect(envOut[0].provider).toBe('llm:groq');
    const jsonOut = parseAndMap('{"GROQ_API_KEY":"gsk_abc"}', 'paste');
    expect(jsonOut[0].provider).toBe('llm:groq');
  });
});

describe('helpers', () => {
  it('detectFormatFromFilename covers common extensions', () => {
    expect(detectFormatFromFilename('.env')).toBe('env');
    expect(detectFormatFromFilename('.env.production')).toBe('env');
    expect(detectFormatFromFilename('secrets.json')).toBe('json');
    expect(detectFormatFromFilename('vault.csv')).toBe('csv');
    expect(detectFormatFromFilename('config.yaml')).toBe('yaml');
    expect(detectFormatFromFilename('README.md')).toBeNull();
  });

  it('maskForPreview redacts the middle', () => {
    expect(maskForPreview('sk-abc')).toBe('••••••');
    expect(maskForPreview('sk-proj-abcdefghi1234')).toBe('sk-proj•••••1234');
  });
});
