export interface LlmAdapter {
  judge(params: LlmJudgmentRequest): Promise<LlmJudgmentResponse>;
}

export interface LlmJudgmentRequest {
  message: string;
  findings: Array<{ ruleId: string; evidence: string; confidence: number }>;
  context?: { source: string; userId?: string };
  timeoutMs: number;
}

export interface LlmJudgmentResponse {
  isInjection: boolean;
  confidence: number;
  reasoning: string;
  model: string;
  durationMs: number;
}
