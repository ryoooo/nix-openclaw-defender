import { describe, it, expect } from "vitest";
import { sanitize } from "../../src/actions/sanitize.js";
import type { ScanFinding } from "../../src/types.js";

// Helper to create a minimal finding with position data
function makeFinding(
  start: number,
  end: number,
  evidence?: string,
): ScanFinding {
  return {
    layer: 1,
    ruleId: "test.rule",
    category: "structural_injection",
    severity: "high",
    message: "test finding",
    evidence: evidence ?? "",
    confidence: 0.9,
    position: { start, end },
  };
}

// Helper to create a finding WITHOUT position data
function makeFindingNoPos(evidence: string): ScanFinding {
  return {
    layer: 1,
    ruleId: "test.rule",
    category: "structural_injection",
    severity: "high",
    message: "test finding",
    evidence,
    confidence: 0.9,
  };
}

// ── Basic replacement ───────────────────────────────────────────

describe("sanitize — basic replacement", () => {
  it("replaces a single matched span with [REDACTED]", () => {
    const input = "Hello <system>evil</system> world";
    const findings = [makeFinding(6, 27, "<system>evil</system>")];
    const result = sanitize(input, findings);
    expect(result).toBe("Hello [REDACTED] world");
  });

  it("replaces multiple non-overlapping spans", () => {
    const input = "AAA <system> BBB <system> CCC";
    const findings = [
      makeFinding(4, 12, "<system>"),
      makeFinding(17, 25, "<system>"),
    ];
    const result = sanitize(input, findings);
    expect(result).toBe("AAA [REDACTED] BBB [REDACTED] CCC");
  });

  it("returns input unchanged when there are no findings", () => {
    const result = sanitize("Hello world", []);
    expect(result).toBe("Hello world");
  });
});

// ── Overlapping findings ────────────────────────────────────────

describe("sanitize — overlapping findings", () => {
  it("merges overlapping spans into one [REDACTED]", () => {
    //              0123456789012345678
    const input = "AB<system>evil</system>CD";
    // Finding 1 covers positions 2-13, finding 2 covers 10-23
    const findings = [
      makeFinding(2, 13, "<system>evil"),
      makeFinding(10, 23, "evil</system>"),
    ];
    const result = sanitize(input, findings);
    expect(result).toBe("AB[REDACTED]CD");
  });

  it("merges adjacent spans (end === start)", () => {
    const input = "AAABBBCCC";
    const findings = [
      makeFinding(0, 3, "AAA"),
      makeFinding(3, 6, "BBB"),
    ];
    const result = sanitize(input, findings);
    expect(result).toBe("[REDACTED]CCC");
  });

  it("handles unsorted findings by sorting them", () => {
    //                   0123456789012345678
    const input = "XXX <b>YYY</b> ZZZ";
    // Second finding comes first positionally but is listed second
    const findings = [
      makeFinding(10, 14, "</b>"),
      makeFinding(4, 7, "<b>"),
    ];
    const result = sanitize(input, findings);
    expect(result).toBe("XXX [REDACTED]YYY[REDACTED] ZZZ");
  });
});

// ── Findings without position data ──────────────────────────────

describe("sanitize — findings without position data", () => {
  it("falls back to indexOf for findings without position", () => {
    const input = "Hello <system> world";
    const findings = [makeFindingNoPos("<system>")];
    const result = sanitize(input, findings);
    expect(result).toBe("Hello [REDACTED] world");
  });

  it("leaves input unchanged when evidence string is not found", () => {
    const input = "Hello world";
    const findings = [makeFindingNoPos("not-in-input")];
    const result = sanitize(input, findings);
    expect(result).toBe("Hello world");
  });

  it("handles mix of findings with and without position", () => {
    const input = "AAA <system> BBB [from: System] CCC";
    const findings = [
      makeFinding(4, 12, "<system>"),
      makeFindingNoPos("[from: System]"),
    ];
    const result = sanitize(input, findings);
    expect(result).toBe("AAA [REDACTED] BBB [REDACTED] CCC");
  });
});

// ── Edge cases ──────────────────────────────────────────────────

describe("sanitize — edge cases", () => {
  it("handles empty input", () => {
    const result = sanitize("", [makeFinding(0, 0)]);
    expect(result).toBe("[REDACTED]");
  });

  it("handles finding spanning the entire input", () => {
    const input = "<system>all evil</system>";
    const findings = [makeFinding(0, input.length, input)];
    const result = sanitize(input, findings);
    expect(result).toBe("[REDACTED]");
  });

  it("handles finding at the very start", () => {
    const input = "<system> rest of message";
    const findings = [makeFinding(0, 8, "<system>")];
    const result = sanitize(input, findings);
    expect(result).toBe("[REDACTED] rest of message");
  });

  it("handles finding at the very end", () => {
    const input = "normal text <system>";
    const findings = [makeFinding(12, 20, "<system>")];
    const result = sanitize(input, findings);
    expect(result).toBe("normal text [REDACTED]");
  });
});
