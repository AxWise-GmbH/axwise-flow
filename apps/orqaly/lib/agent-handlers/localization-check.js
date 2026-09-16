/**
 * Localization check: when a goal description mentions specific languages
 * ("3 languages: Russian, Latvian, English"), verify the rendered HTML
 * contains characters from each language's Unicode range.
 *
 * Used as a post-deploy gate in html-critic flow — if the goal asks for
 * multi-language but the deployed page ships in English only, we fail
 * the deploy and the evaluator reports the missing languages so the
 * next iteration produces proper copy.
 *
 * Exported:
 *   - detectRequiredLanguages(goalText): string[] of detected language codes
 *   - checkLanguages(html, requiredCodes): { ok, missing[] }
 */

// Language → {name, unicode_ranges (for character-class regex),
//             word_samples (substring hints for common greetings/terms)}
//
// Character ranges are restrictive on purpose: we check for characters
// distinct to that language, not shared with English/Latin-1.
const LANGUAGES = {
  russian: {
    names: ['russian', 'ru', 'русский', 'rus'],
    test: (html) => /[а-яА-ЯёЁ]/.test(html),
  },
  ukrainian: {
    names: ['ukrainian', 'uk', 'українська', 'ukr'],
    test: (html) => /[ієїґЄІЇҐ]/.test(html) || /[а-яА-Я]/.test(html),
  },
  latvian: {
    names: ['latvian', 'lv', 'latviešu', 'lat'],
    test: (html) => /[āčēģīķļņšūžĀČĒĢĪĶĻŅŠŪŽ]/.test(html),
  },
  lithuanian: {
    names: ['lithuanian', 'lt', 'lietuvių', 'lit'],
    test: (html) => /[ąčęėįšųūžĄČĘĖĮŠŲŪŽ]/.test(html),
  },
  estonian: {
    names: ['estonian', 'et', 'eesti', 'est'],
    test: (html) => /[äöõüÄÖÕÜ]/.test(html),
  },
  german: {
    names: ['german', 'de', 'deutsch'],
    test: (html) => /[äöüßÄÖÜ]/.test(html),
  },
  french: {
    names: ['french', 'fr', 'français'],
    test: (html) => /[àâçéèêëîïôûùüÿÀÂÇÉÈÊËÎÏÔÛÙÜŸ]/.test(html),
  },
  spanish: {
    names: ['spanish', 'es', 'español'],
    test: (html) => /[áéíóúñü¿¡ÁÉÍÓÚÑÜ]/.test(html),
  },
  polish: {
    names: ['polish', 'pl', 'polski'],
    test: (html) => /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(html),
  },
  chinese: {
    names: ['chinese', 'zh', '中文', 'mandarin', 'simplified', 'traditional'],
    test: (html) => /[\u4e00-\u9fff]/.test(html),
  },
  japanese: {
    names: ['japanese', 'jp', 'ja', '日本語'],
    test: (html) => /[\u3040-\u309f\u30a0-\u30ff]/.test(html), // hiragana or katakana
  },
  korean: {
    names: ['korean', 'ko', 'kr', '한국어'],
    test: (html) => /[\uac00-\ud7af]/.test(html),
  },
  arabic: {
    names: ['arabic', 'ar', 'عربي'],
    test: (html) => /[\u0600-\u06ff]/.test(html),
  },
  hebrew: {
    names: ['hebrew', 'he', 'עברית'],
    test: (html) => /[\u0590-\u05ff]/.test(html),
  },
};

// Detect languages mentioned in the goal description. English is implicit —
// every page ships with some English by default — so we don't require it
// unless explicitly listed along with others.
export function detectRequiredLanguages(goalText) {
  if (!goalText) return [];
  const lower = goalText.toLowerCase();
  const detected = [];
  for (const [code, lang] of Object.entries(LANGUAGES)) {
    if (lang.names.some((n) => {
      const re = new RegExp(`\\b${n.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return re.test(lower);
    })) {
      detected.push(code);
    }
  }
  // Require 2+ explicit mentions to trigger — a passing "in russian" on
  // its own shouldn't fail a primarily-English page. Common pattern is
  // "3 languages: RU/LV/EN" — multiple mentions = real multi-lang goal.
  return detected.length >= 2 ? detected : [];
}

/**
 * @param {string} html
 * @param {string[]} requiredCodes - output of detectRequiredLanguages
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function checkLanguages(html, requiredCodes) {
  if (!Array.isArray(requiredCodes) || requiredCodes.length === 0) {
    return { ok: true, missing: [] };
  }
  const missing = [];
  for (const code of requiredCodes) {
    const lang = LANGUAGES[code];
    if (!lang) continue;
    if (!lang.test(html)) missing.push(code);
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Build a human-readable rejection message for the agent's next iteration.
 */
export function buildLocalizationRejection(requiredCodes, missingCodes) {
  const requiredNames = requiredCodes.map((c) => LANGUAGES[c]?.names?.[0] || c).join(', ');
  const missingNames = missingCodes.map((c) => LANGUAGES[c]?.names?.[0] || c).join(', ');
  return `Localization check failed. The goal requires copy in: ${requiredNames}. Missing languages in the deployed page: ${missingNames}. Regenerate the HTML with proper ${missingNames} copy in the hero, features, and CTA sections — don't just translate the page title.`;
}
