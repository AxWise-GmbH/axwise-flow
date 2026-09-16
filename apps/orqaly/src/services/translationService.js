/**
 * Translation service – translate HTML content and archives.
 * Proxies through /api/translate so the LibreTranslate API key stays server-side.
 * format: "html" preserves tags.
 */
import { getAuthHeaders } from '../lib/supabaseEdge';

/**
 * Translate a single HTML string.
 * @param {string} html
 * @param {string} sourceLang - e.g. 'en'
 * @param {string} targetLang - e.g. 'de'
 * @returns {Promise<string>}
 */
export async function translateHtml(html, sourceLang, targetLang) {
  if (sourceLang === targetLang) return html;
  const headers = await getAuthHeaders();
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      q: html,
      source: sourceLang || 'auto',
      target: targetLang,
      format: 'html',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Translation failed (${res.status})`);
  return data.translatedText ?? html;
}

/**
 * Translate all HTML entries to target languages; return new entries with lang-prefixed paths.
 * @param {Array<{ path: string, content: string | Uint8Array }>} entries
 * @param {string} sourceLang
 * @param {string[]} targetLangs
 * @param {(status: string, progress: number) => void} onProgress
 * @returns {Promise<Array<{ path: string, content: string | Uint8Array }>>}
 */
export async function translateArchive(entries, sourceLang, targetLangs, onProgress = () => {}) {
  const result = [...entries];
  const htmlEntries = entries.filter(
    (e) => typeof e.content === 'string' && /\.(html?|htm)$/i.test(e.path)
  );
  let done = 0;
  const total = htmlEntries.length * Math.max(targetLangs.length, 1);
  for (const targetLang of targetLangs) {
    const prefix = targetLang + '/';
    for (const { path, content } of htmlEntries) {
      try {
        const translated = await translateHtml(content, sourceLang, targetLang);
        result.push({ path: prefix + path, content: translated });
      } catch (e) {
        console.warn(`Translate ${path} to ${targetLang} failed:`, e);
        result.push({ path: prefix + path, content });
      }
      done += 1;
      onProgress(`Translating to ${targetLang}...`, total ? (done / total) * 100 : 0);
    }
  }
  onProgress('Done', 100);
  return result;
}

/** Language/region options with country code (for flag) and full country name */
export const LANGUAGES = [
  { code: 'en', countryCode: 'US', name: 'English', countryName: 'United States of America' },
  { code: 'es', countryCode: 'ES', name: 'Spanish', countryName: 'Spain' },
  { code: 'fr', countryCode: 'FR', name: 'French', countryName: 'France' },
  { code: 'de', countryCode: 'DE', name: 'German', countryName: 'Germany' },
  { code: 'it', countryCode: 'IT', name: 'Italian', countryName: 'Italy' },
  { code: 'pt', countryCode: 'PT', name: 'Portuguese', countryName: 'Portugal' },
  { code: 'ru', countryCode: 'RU', name: 'Russian', countryName: 'Russian Federation' },
  { code: 'zh', countryCode: 'CN', name: 'Chinese', countryName: "People's Republic of China" },
  { code: 'ja', countryCode: 'JP', name: 'Japanese', countryName: 'Japan' },
  { code: 'ar', countryCode: 'SA', name: 'Arabic', countryName: 'Saudi Arabia' },
  { code: 'hi', countryCode: 'IN', name: 'Hindi', countryName: 'India' },
  { code: 'pl', countryCode: 'PL', name: 'Polish', countryName: 'Poland' },
  { code: 'nl', countryCode: 'NL', name: 'Dutch', countryName: 'Netherlands' },
  { code: 'tr', countryCode: 'TR', name: 'Turkish', countryName: 'Turkey' },
  { code: 'uk', countryCode: 'UA', name: 'Ukrainian', countryName: 'Ukraine' },
  { code: 'ko', countryCode: 'KR', name: 'Korean', countryName: 'South Korea' },
  { code: 'vi', countryCode: 'VN', name: 'Vietnamese', countryName: 'Vietnam' },
  { code: 'th', countryCode: 'TH', name: 'Thai', countryName: 'Thailand' },
  { code: 'id', countryCode: 'ID', name: 'Indonesian', countryName: 'Indonesia' },
  { code: 'sv', countryCode: 'SE', name: 'Swedish', countryName: 'Sweden' },
];

export const SOURCE_AUTO = 'auto';
