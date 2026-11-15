// Text helpers.

const HEBREW_RE = /[\u0590-\u05FF]/;

/** Language of a free text for direction/lang attributes: Hebrew if it contains Hebrew letters. */
export function detectLanguage(text) {
  return HEBREW_RE.test(text) ? 'he' : 'en';
}
