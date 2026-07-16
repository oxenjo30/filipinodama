/**
 * Curated profanity filter for user-generated content. Names are rejected via
 * containsProfanity(); chat is masked via maskProfanity(). Whole-token match
 * after per-token leetspeak normalization — tokenize on whitespace FIRST so
 * innocent multi-word text ("class sizes", "pass the ball") never collapses
 * into a false match. A curated list is not exhaustive moderation; report +
 * block are the backstop.
 */

// Strong profanity + slurs, grouped by language. Lowercase, base forms only —
// normalization handles case/leetspeak/repeats. Extend by adding to a group.
const WORDS: string[] = [
  // English (strong profanity + slurs)
  "fuck", "shit", "bitch", "cunt", "asshole", "motherfucker", "bastard",
  "dick", "pussy", "slut", "whore", "faggot", "nigger", "nigga", "retard",
  "cock", "twat", "wanker",
  // Tagalog / Filipino
  "putangina", "tangina", "puta", "gago", "gaga", "ulol", "pakyu", "pakshet",
  "leche", "punyeta", "hindot", "kantot", "pokpok", "tarantado", "kupal",
  "hinayupak", "burat", "tite", "pekpek", "puke", "bobo", "tanga", "peste",
  // Cebuano / Bisaya
  "yawa", "pisti", "bilat", "buang", "boang", "atay", "linte",
  // Ilocano / Hiligaynon (common strong)
  "ukinnam", "yudipota",
];

// leetspeak → letter; applied per token before matching.
const LEET: Record<string, string> = {
  "@": "a", "4": "a", "0": "o", "1": "i", "!": "i", "3": "e", "5": "s",
  "$": "s", "7": "t", "8": "b",
};

const WORD_SET = new Set(WORDS);
const MAX_WORD_LEN = Math.max(...WORDS.map((w) => w.length));

/** Normalize a SINGLE token: lowercase, map leetspeak, strip intra-token
 *  punctuation used to evade (f.u.c.k), collapse 3+ repeats (fuuuck→fuck).
 *  Never operates across whitespace. */
function normalizeToken(token: string): string {
  let s = token.toLowerCase();
  s = s.replace(/[@4013!5$78]/g, (c) => LEET[c] ?? c);
  s = s.replace(/[^a-z]/g, ""); // drop remaining punctuation WITHIN the token
  s = s.replace(/(.)\1{2,}/g, "$1"); // fuuuuck → fuck (collapse 3+)
  return s;
}

/** True if any whitespace-delimited token normalizes to a listed word. */
export function containsProfanity(text: string): boolean {
  if (!text) return false;
  for (const raw of text.split(/\s+/)) {
    const n = normalizeToken(raw);
    if (n.length === 0 || n.length > MAX_WORD_LEN + 4) continue;
    if (WORD_SET.has(n)) return true;
  }
  return false;
}

/** Replace each profane token with **** in the ORIGINAL text (keeps spacing,
 *  non-profane words, and punctuation of clean tokens). */
export function maskProfanity(text: string): string {
  if (!text) return text;
  return text.replace(/\S+/g, (raw) => {
    const n = normalizeToken(raw);
    return n.length > 0 && WORD_SET.has(n) ? "****" : raw;
  });
}
