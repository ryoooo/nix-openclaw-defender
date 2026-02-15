import { describe, it, expect } from "vitest";
import {
  stripZeroWidth,
  foldFullwidth,
  normalizeUnicode,
  normalize,
  countZeroWidth,
  countFullwidth,
} from "../src/normalizer.js";

// ── stripZeroWidth ──────────────────────────────────────────────

describe("stripZeroWidth", () => {
  it("removes U+200B (ZWSP) characters", () => {
    expect(stripZeroWidth("he\u200Bllo")).toBe("hello");
  });

  it("removes U+200C (ZWNJ) characters", () => {
    expect(stripZeroWidth("ab\u200Ccd")).toBe("abcd");
  });

  it("removes U+200D (ZWJ) characters", () => {
    expect(stripZeroWidth("ab\u200Dcd")).toBe("abcd");
  });

  it("removes U+FEFF (BOM / ZWNBSP) characters", () => {
    expect(stripZeroWidth("\uFEFFhello")).toBe("hello");
  });

  it("removes U+2060 (Word Joiner) characters", () => {
    expect(stripZeroWidth("ab\u2060cd")).toBe("abcd");
  });

  it("removes U+2061-U+2064 (invisible math operators)", () => {
    expect(stripZeroWidth("a\u2061b\u2062c\u2063d\u2064e")).toBe("abcde");
  });

  it("removes U+180E (Mongolian Vowel Separator)", () => {
    expect(stripZeroWidth("a\u180Eb")).toBe("ab");
  });

  it("removes multiple mixed zero-width chars", () => {
    expect(stripZeroWidth("\u200B\u200C\u200Dhello\uFEFF\u2060")).toBe(
      "hello",
    );
  });

  it("preserves normal text unchanged", () => {
    expect(stripZeroWidth("Hello, world!")).toBe("Hello, world!");
  });

  it("handles empty string", () => {
    expect(stripZeroWidth("")).toBe("");
  });

  it("handles string that is all zero-width chars", () => {
    expect(stripZeroWidth("\u200B\u200C\u200D")).toBe("");
  });
});

// ── countZeroWidth ──────────────────────────────────────────────

describe("countZeroWidth", () => {
  it("returns 0 for normal text", () => {
    expect(countZeroWidth("hello world")).toBe(0);
  });

  it("counts zero-width chars correctly", () => {
    expect(countZeroWidth("a\u200B\u200Cb\u200Dc")).toBe(3);
  });

  it("returns 0 for empty string", () => {
    expect(countZeroWidth("")).toBe(0);
  });
});

// ── foldFullwidth ───────────────────────────────────────────────

describe("foldFullwidth", () => {
  it("converts fullwidth uppercase letters to ASCII", () => {
    // \uFF21 = A, \uFF22 = B, \uFF23 = C
    expect(foldFullwidth("\uFF21\uFF22\uFF23")).toBe("ABC");
  });

  it("converts fullwidth lowercase letters to ASCII", () => {
    // \uFF41 = a, \uFF42 = b, \uFF43 = c
    expect(foldFullwidth("\uFF41\uFF42\uFF43")).toBe("abc");
  });

  it("converts fullwidth digits to ASCII", () => {
    // \uFF10 = 0, \uFF11 = 1, \uFF19 = 9
    expect(foldFullwidth("\uFF10\uFF11\uFF19")).toBe("019");
  });

  it("converts fullwidth angle brackets to ASCII", () => {
    // \uFF1C = <, \uFF1E = >
    expect(foldFullwidth("\uFF1Csystem\uFF1E")).toBe("<system>");
  });

  it("converts fullwidth square brackets to ASCII", () => {
    // \uFF3B = [, \uFF3D = ]
    expect(foldFullwidth("\uFF3Bsystem\uFF3D")).toBe("[system]");
  });

  it("preserves normal ASCII text", () => {
    expect(foldFullwidth("Hello, world!")).toBe("Hello, world!");
  });

  it("handles mixed fullwidth and normal text", () => {
    expect(foldFullwidth("say \uFF48\uFF45\uFF4C\uFF4C\uFF4F now")).toBe(
      "say hello now",
    );
  });

  it("handles empty string", () => {
    expect(foldFullwidth("")).toBe("");
  });
});

// ── countFullwidth ──────────────────────────────────────────────

describe("countFullwidth", () => {
  it("returns 0 for normal text", () => {
    expect(countFullwidth("hello world")).toBe(0);
  });

  it("counts fullwidth chars correctly", () => {
    expect(countFullwidth("\uFF21\uFF22\uFF23")).toBe(3);
  });

  it("returns 0 for empty string", () => {
    expect(countFullwidth("")).toBe(0);
  });
});

// ── normalizeUnicode ────────────────────────────────────────────

describe("normalizeUnicode", () => {
  it("normalizes combining characters via NFKC", () => {
    // e + combining acute accent => e-acute
    const combined = "e\u0301";
    const result = normalizeUnicode(combined);
    expect(result).toBe("\u00E9"); // e-acute precomposed
  });

  it("normalizes compatibility characters", () => {
    // \u2126 (Ohm sign) normalizes to \u03A9 (Greek capital Omega) under NFKC
    expect(normalizeUnicode("\u2126")).toBe("\u03A9");
  });

  it("preserves normal ASCII text", () => {
    expect(normalizeUnicode("Hello, world!")).toBe("Hello, world!");
  });

  it("handles empty string", () => {
    expect(normalizeUnicode("")).toBe("");
  });
});

// ── normalize (full pipeline) ───────────────────────────────────

describe("normalize", () => {
  it("strips zero-width, folds fullwidth, then NFKC normalizes", () => {
    // Input: ZW chars + fullwidth letters + combining accent
    const input = "\u200Bhe\u200Cllo \uFF41\uFF42\uFF43 e\u0301";
    const result = normalize(input);
    // After stripZeroWidth: "hello \uFF41\uFF42\uFF43 e\u0301"
    // After foldFullwidth: "hello abc e\u0301"
    // After NFKC: "hello abc \u00E9"
    expect(result).toBe("hello abc \u00E9");
  });

  it("returns unchanged text for plain ASCII input", () => {
    expect(normalize("Hello, world!")).toBe("Hello, world!");
  });

  it("handles empty string", () => {
    expect(normalize("")).toBe("");
  });

  it("strips zero-width then folds fullwidth angle brackets", () => {
    const input = "\uFF1C\u200Bsystem\uFF1E";
    // After stripZeroWidth: "\uFF1Csystem\uFF1E"
    // After foldFullwidth: "<system>"
    expect(normalize(input)).toBe("<system>");
  });
});
