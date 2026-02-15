export interface ClassifierAdapter {
  classify(
    text: string,
  ): Promise<{ label: "benign" | "injection" | "jailbreak"; confidence: number }>;
  readonly model: string;
}
