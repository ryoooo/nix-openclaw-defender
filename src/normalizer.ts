/**
 * Input normalisation pipeline.
 *
 * Transforms obfuscated text into a canonical form so that Layer 1 rules
 * can match reliably.  Derived from OpenClaw's foldMarkerChar/foldMarkerText
 * in src/security/external-content.ts.
 */

// ── Zero-width characters ──────────────────────────────────────

const ZERO_WIDTH_RE =
  /[\u200B\u200C\u200D\uFEFF\u2060\u2061\u2062\u2063\u2064\u180E]/g;

export function stripZeroWidth(input: string): string {
  return input.replace(ZERO_WIDTH_RE, "");
}

// ── Fullwidth ASCII → standard ASCII ───────────────────────────

const FULLWIDTH_ASCII_OFFSET = 0xfee0;

function foldChar(code: number): number | null {
  // Fullwidth uppercase A–Z  (U+FF21 – U+FF3A)
  if (code >= 0xff21 && code <= 0xff3a) return code - FULLWIDTH_ASCII_OFFSET;
  // Fullwidth lowercase a–z  (U+FF41 – U+FF5A)
  if (code >= 0xff41 && code <= 0xff5a) return code - FULLWIDTH_ASCII_OFFSET;
  // Fullwidth digits 0–9     (U+FF10 – U+FF19)
  if (code >= 0xff10 && code <= 0xff19) return code - FULLWIDTH_ASCII_OFFSET;
  // Fullwidth angle brackets
  if (code === 0xff1c) return 0x3c; // <
  if (code === 0xff1e) return 0x3e; // >
  // Fullwidth square brackets
  if (code === 0xff3b) return 0x5b; // [
  if (code === 0xff3d) return 0x5d; // ]
  return null;
}

const FULLWIDTH_RE =
  /[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A\uFF1C\uFF1E\uFF3B\uFF3D]/g;

export function foldFullwidth(input: string): string {
  return input.replace(FULLWIDTH_RE, (ch) => {
    const mapped = foldChar(ch.charCodeAt(0));
    return mapped !== null ? String.fromCharCode(mapped) : ch;
  });
}

// ── NFKC normalisation (collapses homoglyphs) ──────────────────

export function normalizeUnicode(input: string): string {
  return input.normalize("NFKC");
}

// ── Detect & count zero-width chars (pre-strip) ────────────────

export function countZeroWidth(input: string): number {
  const m = input.match(ZERO_WIDTH_RE);
  return m ? m.length : 0;
}

// ── Detect fullwidth char count (pre-fold) ─────────────────────

export function countFullwidth(input: string): number {
  const m = input.match(FULLWIDTH_RE);
  return m ? m.length : 0;
}

// ── Full pipeline ──────────────────────────────────────────────

export function normalize(input: string): string {
  let r = input;
  r = stripZeroWidth(r);
  r = foldFullwidth(r);
  r = normalizeUnicode(r);
  return r;
}
