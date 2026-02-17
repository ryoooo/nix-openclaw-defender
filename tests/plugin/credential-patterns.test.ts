import { describe, it, expect } from "vitest";
import {
  scanCredentials,
  redactCredentials,
} from "../../src/plugin/utils/credential-patterns.js";

describe("scanCredentials", () => {
  it("detects AWS access key", () => {
    const matches = scanCredentials("key = AKIAIOSFODNN7EXAMPLE");
    expect(matches.some((m) => m.type === "aws_access_key")).toBe(true);
  });

  it("detects GitHub PAT", () => {
    const matches = scanCredentials(
      "token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij",
    );
    expect(matches.some((m) => m.type === "github_pat")).toBe(true);
  });

  it("detects GitLab PAT", () => {
    const matches = scanCredentials("glpat-ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    expect(matches.some((m) => m.type === "gitlab_pat")).toBe(true);
  });

  it("detects Slack bot token", () => {
    // Build token dynamically to avoid GitHub push protection false positive
    const token = `${"xoxb"}-0000000000-0000000000-AAAAAAAAAAAAAAAAAAAAAAAA`;
    const matches = scanCredentials(token);
    expect(matches.some((m) => m.type === "slack_bot_token")).toBe(true);
  });

  it("detects Bearer token", () => {
    const matches = scanCredentials(
      "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9",
    );
    expect(matches.some((m) => m.type === "bearer_token")).toBe(true);
  });

  it("detects private key header", () => {
    const matches = scanCredentials(
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIB...",
    );
    expect(matches.some((m) => m.type === "private_key")).toBe(true);
  });

  it("detects generic secret assignment", () => {
    const matches = scanCredentials(
      'api_key = "sk_live_abcdefghijklmnopqrstuv"',
    );
    expect(matches.some((m) => m.type === "generic_secret")).toBe(true);
  });

  it("detects database URL", () => {
    const matches = scanCredentials(
      "postgres://admin:secret123@db.example.com:5432/mydb",
    );
    expect(matches.some((m) => m.type === "database_url")).toBe(true);
  });

  it("detects JWT token", () => {
    const matches = scanCredentials(
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    );
    expect(matches.some((m) => m.type === "jwt_token")).toBe(true);
  });

  it("returns empty array for clean text", () => {
    const matches = scanCredentials("Hello, this is a normal message.");
    expect(matches).toHaveLength(0);
  });

  it("detects multiple credentials in one text", () => {
    const text =
      "key=AKIAIOSFODNN7EXAMPLE token=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
    const matches = scanCredentials(text);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe("redactCredentials", () => {
  it("replaces matched credential with [CREDENTIAL_REDACTED]", () => {
    const text = "key = AKIAIOSFODNN7EXAMPLE rest";
    const matches = scanCredentials(text);
    const redacted = redactCredentials(text, matches);
    expect(redacted).toContain("[CREDENTIAL_REDACTED]");
    expect(redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("returns original text when no matches", () => {
    const text = "Hello world";
    expect(redactCredentials(text, [])).toBe(text);
  });

  it("handles multiple non-overlapping matches", () => {
    const text =
      "aws=AKIAIOSFODNN7EXAMPLE github=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
    const matches = scanCredentials(text);
    const redacted = redactCredentials(text, matches);
    expect(redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(redacted).not.toContain("ghp_");
    const count = (redacted.match(/\[CREDENTIAL_REDACTED\]/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
