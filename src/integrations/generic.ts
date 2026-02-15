import type { ScanContext, ScanResult } from "../types.js";
import type { Scanner } from "../scanner.js";

/**
 * Simple async scan wrapper for use in any integration.
 */
export async function scan(
  scanner: Scanner,
  input: string,
  context?: ScanContext,
): Promise<ScanResult> {
  return scanner.scan(input, context);
}

/**
 * Simple synchronous scan wrapper (Layer 1 only).
 */
export function scanSync(
  scanner: Scanner,
  input: string,
  context?: ScanContext,
): ScanResult {
  return scanner.scanSync(input, context);
}
