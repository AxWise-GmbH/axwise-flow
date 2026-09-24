/*
 * The languages the landing speaks. `native` is the name a speaker of it reads it by, so
 * the picker lists every language in its own words. Only Arabic runs right to left.
 */
export const LANGUAGES = [
  { code: 'en', native: 'English' },
  { code: 'de', native: 'Deutsch' },
  { code: 'ja', native: '日本語' },
  { code: 'fr', native: 'Français' },
  { code: 'es', native: 'Español' },
  { code: 'pt', native: 'Português' },
  { code: 'ko', native: '한국어' },
  { code: 'zh-CN', native: '简体中文' },
  { code: 'it', native: 'Italiano' },
  { code: 'nl', native: 'Nederlands' },
  { code: 'pl', native: 'Polski' },
  { code: 'tr', native: 'Türkçe' },
  { code: 'ar', native: 'العربية', dir: 'rtl' },
  { code: 'hi', native: 'हिन्दी' },
  { code: 'id', native: 'Bahasa Indonesia' },
];

export const DEFAULT_LANG = 'en';

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code.toLowerCase(), language]));

export function findLanguage(code) {
  return BY_CODE.get(String(code ?? '').toLowerCase()) ?? null;
}

export function dirOf(code) {
  return findLanguage(code)?.dir ?? 'ltr';
}

/**
 * The listed language a browser tag like "de-AT", "pt-BR" or "zh-Hans-CN" asks for, or null.
 * Any Chinese maps to Simplified, the one we have.
 */
export function matchLanguage(tag) {
  const value = String(tag ?? '').toLowerCase();
  if (!value) return null;
  if (findLanguage(value)) return findLanguage(value).code;
  const base = value.split('-')[0];
  if (base === 'zh') return 'zh-CN';
  return findLanguage(base)?.code ?? null;
}
