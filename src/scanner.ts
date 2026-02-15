import type {
  Action,
  Severity,
  ScanContext,
  ScanFinding,
  ScanResult,
  ClassifierResult,
  LlmJudgment,
  IntentAlignmentResult,
  RuleCategory,
} from "./types.js";
import type { Rule, RuleCheckParams } from "./rules/types.js";
import type { ClassifierAdapter } from "./classifier/types.js";
import type { LlmAdapter } from "./llm/types.js";
import {
  createDefaultConfig,
  mergeConfig,
  resolveClassifierConfig,
  resolveLlmConfig,
  resolveIntentAlignmentConfig,
} from "./config.js";
import type {
  DefenceConfig,
  ClassifierConfig,
  LlmConfig,
  IntentAlignmentConfig,
} from "./config.js";
import { normalize } from "./normalizer.js";
import { getBuiltinRules } from "./rules/index.js";
import { DefenceEventEmitter } from "./events.js";
import { resolveAction } from "./actions/index.js";
import { sanitize } from "./actions/sanitize.js";
import { createPromptGuardAdapter } from "./classifier/prompt-guard.js";
import { createDeBERTaAdapter } from "./classifier/deberta.js";
import { createApiShieldAdapter } from "./classifier/api-shield.js";
import { createCerebrasAdapter } from "./llm/adapter-cerebras.js";
import { createOpenAICompatibleAdapter } from "./llm/adapter-openai.js";
import { createAnthropicAdapter } from "./llm/adapter-anthropic.js";
import {
  INTENT_ALIGNMENT_PROMPT,
  buildIntentAlignmentMessage,
} from "./llm/intent-alignment.js";

// ── Severity ordering for fast-path logic ─────────────────────

const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export class Scanner {
  private config: DefenceConfig;
  private classifierConfig?: ClassifierConfig;
  private llmConfig?: LlmConfig;
  private intentAlignmentConfig?: IntentAlignmentConfig;
  private rules: Rule[];
  private classifierAdapter?: ClassifierAdapter;
  private llmAdapter?: LlmAdapter;
  private emitter: DefenceEventEmitter;

  constructor(config?: Partial<DefenceConfig>) {
    const base = createDefaultConfig();
    this.config = config ? mergeConfig(base, config) : base;

    // Resolve sub-configs
    this.classifierConfig = resolveClassifierConfig(this.config.classifier);
    this.llmConfig = resolveLlmConfig(this.config.llm);
    this.intentAlignmentConfig = resolveIntentAlignmentConfig(
      this.config.intentAlignment,
    );

    // Build rule set: built-in + custom, with per-rule config overrides.
    // Clone each rule object so that per-scanner overrides do not mutate
    // the shared built-in rule definitions.
    this.rules = [...getBuiltinRules(), ...this.config.customRules].map(
      (rule) => ({ ...rule }),
    );
    for (const rule of this.rules) {
      const ruleOverride = this.config.rules[rule.id];
      if (ruleOverride) {
        if (ruleOverride.enabled !== undefined) rule.enabled = ruleOverride.enabled;
        if (ruleOverride.severity !== undefined) rule.severity = ruleOverride.severity;
      }
    }

    // Create classifier adapter
    if (this.classifierConfig) {
      this.classifierAdapter = this.buildClassifierAdapter(this.classifierConfig);
    }

    // Create LLM adapter
    if (this.llmConfig) {
      this.llmAdapter = this.buildLlmAdapter(this.llmConfig);
    }

    this.emitter = new DefenceEventEmitter();
  }

  // ── Public API ──────────────────────────────────────────────

  async scan(input: string, context?: ScanContext): Promise<ScanResult> {
    const start = Date.now();
    this.emitter.emit("scan:start", { input });

    // 1. Allowlist check
    if (this.isAllowlisted(context)) {
      return this.cleanResult(input, "", Date.now() - start);
    }

    // 2. Truncate to maxInputLength
    const truncated = input.slice(0, this.config.maxInputLength);

    // 3. Normalize
    const normalized = normalize(truncated);

    // 4. Layer 1: Run all enabled rules, collect findings
    const findings = this.runRules(truncated, normalized, context);
    for (const finding of findings) {
      this.emitter.emit("scan:finding", finding);
    }

    // Fast-path: if highest severity is critical with confidence >= 0.9, skip Layer 2/3
    const highestFinding = this.getHighestSeverityFinding(findings);
    const fastPath =
      highestFinding &&
      highestFinding.severity === "critical" &&
      highestFinding.confidence >= 0.9;

    // 5. Layer 2: Classifier
    let classifierResult: ClassifierResult | undefined;
    if (!fastPath && this.classifierAdapter && this.classifierConfig) {
      try {
        const classStart = Date.now();
        const result = await this.classifierAdapter.classify(normalized);
        classifierResult = {
          label: result.label,
          confidence: result.confidence,
          model: this.classifierAdapter.model,
          durationMs: Date.now() - classStart,
        };
        this.emitter.emit("classifier:result", classifierResult);

        // Map non-benign classifier result to a finding
        if (
          result.label !== "benign" &&
          result.confidence >= this.classifierConfig.threshold
        ) {
          const classifierFinding: ScanFinding = {
            layer: 2,
            ruleId: `classifier.${this.classifierAdapter.model}`,
            category: result.label === "jailbreak"
              ? "instruction_override"
              : "structural_injection",
            severity: this.classifierConfidenceToSeverity(result.confidence),
            message: `Classifier detected ${result.label} (confidence: ${result.confidence.toFixed(2)})`,
            evidence: normalized.slice(0, 120),
            confidence: result.confidence,
          };
          findings.push(classifierFinding);
          this.emitter.emit("scan:finding", classifierFinding);
        }
      } catch (err) {
        this.emitter.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
    }

    // 6. Layer 3: LLM judgment
    let llmJudgment: LlmJudgment | undefined;
    if (!fastPath && this.llmAdapter && this.llmConfig) {
      const maxConfidence = this.getMaxConfidence(findings);
      const shouldTriggerLlm =
        maxConfidence >= this.llmConfig.triggerThreshold &&
        maxConfidence < this.llmConfig.confirmThreshold;

      if (shouldTriggerLlm) {
        try {
          const llmResult = await this.llmAdapter.judge({
            message: truncated,
            findings: findings.map((f) => ({
              ruleId: f.ruleId,
              evidence: f.evidence,
              confidence: f.confidence,
            })),
            context: context
              ? { source: context.source, userId: context.userId }
              : undefined,
            timeoutMs: this.llmConfig.timeoutMs,
          });

          llmJudgment = {
            isInjection: llmResult.isInjection,
            confidence: llmResult.confidence,
            reasoning: llmResult.reasoning,
            model: llmResult.model,
            durationMs: llmResult.durationMs,
          };
          this.emitter.emit("llm:judgment", llmJudgment);

          // Map LLM judgment to a finding
          if (llmResult.isInjection) {
            const llmFinding: ScanFinding = {
              layer: 3,
              ruleId: `llm.${llmResult.model}`,
              category: "structural_injection" as RuleCategory,
              severity: this.llmConfidenceToSeverity(llmResult.confidence),
              message: `LLM judgment: injection (confidence: ${llmResult.confidence.toFixed(2)}) - ${llmResult.reasoning}`,
              evidence: truncated.slice(0, 120),
              confidence: llmResult.confidence,
            };
            findings.push(llmFinding);
            this.emitter.emit("scan:finding", llmFinding);
          }
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          this.emitter.emit("llm:error", error);
          this.emitter.emit("error", error);
        }
      }
    }

    // 7. Resolve action
    const action = resolveAction(
      this.config,
      findings,
      classifierResult,
      llmJudgment,
    );

    // 8. Execute action (sanitize if needed)
    let sanitized: string | undefined;
    if (action === "sanitize") {
      sanitized = sanitize(truncated, findings);
    }

    // 9. Build result
    const result: ScanResult = {
      input: this.config.includeRawInput ? input : "",
      normalized,
      findings,
      classifierResult,
      llmJudgment,
      action,
      blocked: action === "block",
      sanitized,
      durationMs: Date.now() - start,
      timestamp: new Date(),
    };

    // 10. Emit events
    this.emitter.emit("scan:complete", result);
    if (result.blocked) {
      this.emitter.emit("scan:blocked", result);
    }
    if (result.sanitized !== undefined) {
      this.emitter.emit("scan:sanitized", result);
    }

    return result;
  }

  /**
   * Synchronous scan: Layer 1 only (no classifier or LLM).
   * Useful for hot paths where async overhead is unacceptable.
   */
  scanSync(input: string, context?: ScanContext): ScanResult {
    const start = Date.now();

    // Allowlist check
    if (this.isAllowlisted(context)) {
      return this.cleanResult(input, "", Date.now() - start);
    }

    // Truncate + normalize
    const truncated = input.slice(0, this.config.maxInputLength);
    const normalized = normalize(truncated);

    // Layer 1 only
    const findings = this.runRules(truncated, normalized, context);

    // Resolve action
    const action = resolveAction(this.config, findings);

    // Sanitize if needed
    let sanitized: string | undefined;
    if (action === "sanitize") {
      sanitized = sanitize(truncated, findings);
    }

    return {
      input: this.config.includeRawInput ? input : "",
      normalized,
      findings,
      action,
      blocked: action === "block",
      sanitized,
      durationMs: Date.now() - start,
      timestamp: new Date(),
    };
  }

  /**
   * Check whether a proposed tool call aligns with the user's apparent intent.
   * Requires an LLM adapter to be configured.
   */
  async checkIntentAlignment(params: {
    userMessage: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
  }): Promise<IntentAlignmentResult> {
    if (!this.llmAdapter || !this.llmConfig) {
      throw new Error(
        "Intent alignment requires an LLM adapter. Configure the llm section in DefenceConfig.",
      );
    }

    const userContent = buildIntentAlignmentMessage(params);

    const result = await this.llmAdapter.judge({
      message: userContent,
      findings: [],
      context: { source: "intent_alignment" },
      timeoutMs: this.llmConfig.timeoutMs,
    });

    // The LLM adapter returns a judgment response, but for intent alignment
    // we parse differently. We need to re-call with the intent prompt.
    // Use a direct fetch with the intent alignment prompt instead.
    const alignmentResult = await this.callIntentAlignment(params);
    return alignmentResult;
  }

  addRule(rule: Rule): void {
    const override = this.config.rules[rule.id];
    if (override) {
      if (override.enabled !== undefined) rule.enabled = override.enabled;
      if (override.severity !== undefined) rule.severity = override.severity;
    }
    this.rules.push(rule);
  }

  get events(): DefenceEventEmitter {
    return this.emitter;
  }

  // ── Private helpers ─────────────────────────────────────────

  private isAllowlisted(context?: ScanContext): boolean {
    if (!context) return false;
    if (
      context.userId &&
      this.config.allowlist.userIds.includes(context.userId)
    ) {
      return true;
    }
    if (context.roles) {
      for (const role of context.roles) {
        if (this.config.allowlist.roleIds.includes(role)) return true;
      }
    }
    return false;
  }

  private runRules(
    original: string,
    normalized: string,
    context?: ScanContext,
  ): ScanFinding[] {
    const findings: ScanFinding[] = [];
    const params: RuleCheckParams = { original, normalized, context };

    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      const ruleFindings = rule.check(params);
      for (const rf of ruleFindings) {
        findings.push({
          layer: 1,
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          message: rf.detail ?? rule.description,
          evidence: rf.evidence,
          confidence: rf.confidence,
          position: rf.position,
        });
      }
    }

    return findings;
  }

  private getHighestSeverityFinding(
    findings: ScanFinding[],
  ): ScanFinding | undefined {
    if (findings.length === 0) return undefined;
    return findings.reduce((a, b) =>
      SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a,
    );
  }

  private getMaxConfidence(findings: ScanFinding[]): number {
    if (findings.length === 0) return 0;
    return Math.max(...findings.map((f) => f.confidence));
  }

  private classifierConfidenceToSeverity(confidence: number): Severity {
    if (confidence >= 0.95) return "critical";
    if (confidence >= 0.85) return "high";
    if (confidence >= 0.7) return "medium";
    if (confidence >= 0.5) return "low";
    return "info";
  }

  private llmConfidenceToSeverity(confidence: number): Severity {
    if (confidence >= 0.9) return "critical";
    if (confidence >= 0.8) return "high";
    if (confidence >= 0.6) return "medium";
    if (confidence >= 0.4) return "low";
    return "info";
  }

  private buildClassifierAdapter(
    config: ClassifierConfig,
  ): ClassifierAdapter | undefined {
    if (config.factory) {
      return config.factory() as ClassifierAdapter;
    }
    switch (config.adapter) {
      case "prompt-guard":
        return createPromptGuardAdapter({
          endpoint: config.apiUrl,
        });
      case "deberta":
        return createDeBERTaAdapter({
          endpoint: config.apiUrl,
        });
      case "api-shield":
        if (!config.apiUrl || !config.apiKey) {
          throw new Error(
            "API Shield adapter requires apiUrl and apiKey in classifier config.",
          );
        }
        return createApiShieldAdapter({
          apiUrl: config.apiUrl,
          apiKey: config.apiKey,
        });
      case "custom":
        throw new Error(
          "Custom classifier adapter requires a factory function in config.classifier.factory.",
        );
      default:
        return undefined;
    }
  }

  private buildLlmAdapter(config: LlmConfig): LlmAdapter | undefined {
    if (config.factory) {
      return config.factory() as LlmAdapter;
    }
    if (!config.apiKey) {
      throw new Error(
        `LLM adapter "${config.adapter}" requires an apiKey in config.llm.`,
      );
    }
    switch (config.adapter) {
      case "cerebras":
        return createCerebrasAdapter({
          apiKey: config.apiKey,
          model: config.model,
          baseUrl: config.baseUrl,
        });
      case "openai":
        return createOpenAICompatibleAdapter({
          apiKey: config.apiKey,
          model: config.model,
          baseUrl: config.baseUrl,
        });
      case "anthropic":
        return createAnthropicAdapter({
          apiKey: config.apiKey,
          model: config.model,
        });
      case "custom":
        throw new Error(
          "Custom LLM adapter requires a factory function in config.llm.factory.",
        );
      default:
        return undefined;
    }
  }

  private async callIntentAlignment(params: {
    userMessage: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
  }): Promise<IntentAlignmentResult> {
    if (!this.llmAdapter || !this.llmConfig) {
      throw new Error("LLM adapter required for intent alignment.");
    }

    // Build intent alignment message
    const message = buildIntentAlignmentMessage(params);

    // We reuse the LLM adapter's underlying fetch but with the intent alignment prompt.
    // Since the adapter is designed for judgment, we call it with the alignment message
    // and parse the response accordingly.
    const result = await this.llmAdapter.judge({
      message: `${INTENT_ALIGNMENT_PROMPT}\n\n${message}`,
      findings: [],
      context: { source: "intent_alignment" },
      timeoutMs: this.llmConfig.timeoutMs,
    });

    // Parse the reasoning field which should contain the intent alignment JSON
    // The judge adapter returns a LlmJudgmentResponse, so we need to extract
    // the alignment-specific fields from the reasoning.
    try {
      const jsonMatch = result.reasoning.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          aligned?: boolean;
          confidence?: number;
          reasoning?: string;
          userIntent?: string;
          proposedAction?: string;
        };
        return {
          aligned: parsed.aligned === true,
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : result.confidence,
          reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : result.reasoning,
          userIntent: parsed.userIntent ?? "Unknown",
          proposedAction: parsed.proposedAction ?? `${params.toolName}(...)`,
        };
      }
    } catch {
      // Fall through to default mapping
    }

    // Default mapping from judgment response
    return {
      aligned: !result.isInjection,
      confidence: result.confidence,
      reasoning: result.reasoning,
      userIntent: "Could not determine",
      proposedAction: `${params.toolName}(${JSON.stringify(params.toolArgs).slice(0, 80)})`,
    };
  }

  private cleanResult(
    input: string,
    normalized: string,
    durationMs: number,
  ): ScanResult {
    return {
      input: this.config.includeRawInput ? input : "",
      normalized,
      findings: [],
      action: "log" as Action,
      blocked: false,
      durationMs,
      timestamp: new Date(),
    };
  }
}

/**
 * Factory function for creating a Scanner instance.
 */
export function createScanner(config?: Partial<DefenceConfig>): Scanner {
  return new Scanner(config);
}
