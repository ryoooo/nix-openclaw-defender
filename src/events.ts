import { EventEmitter } from "node:events";
import type {
  ScanFinding,
  ScanResult,
  ClassifierResult,
  LlmJudgment,
} from "./types.js";

export interface DefenceEvents {
  "scan:start": [{ input: string }];
  "scan:finding": [ScanFinding];
  "scan:complete": [ScanResult];
  "scan:blocked": [ScanResult];
  "scan:sanitized": [ScanResult];
  "classifier:result": [ClassifierResult];
  "llm:judgment": [LlmJudgment];
  "llm:error": [Error];
  error: [Error];
}

export class DefenceEventEmitter extends EventEmitter<DefenceEvents> {}
