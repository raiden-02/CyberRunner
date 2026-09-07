const SECRET_RE = /sk-ant-|sk-[a-zA-Z0-9]{12,}|OPENAI_API_KEY|ANTHROPIC_API_KEY|authorization|Bearer [A-Za-z0-9._-]+/i;
const THINKING_KEYS = new Set([
  "thinking",
  "reasoning",
  "encrypted_content",
  "redacted_thinking",
  "hidden_reasoning",
  "chain_of_thought",
]);

export function containsSecretMaterial(value: unknown): boolean {
  return SECRET_RE.test(JSON.stringify(value));
}

export function stripHiddenReasoning<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walk);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (THINKING_KEYS.has(key)) continue;
    if (key === "responseId" || key === "callId") continue;
    out[key] = walk(child);
  }
  return out;
}

export function assertPublicRecordedPayload(value: unknown): void {
  const text = JSON.stringify(value);
  if (SECRET_RE.test(text)) throw new Error("Recorded fixture contains secret material.");
  if (/[A-Za-z]:\\Users\\|\/home\/|\/Users\//.test(text)) {
    throw new Error("Recorded fixture contains a local file path.");
  }
  if (/"thinking"|encrypted_content|redacted_thinking|chain_of_thought/.test(text)) {
    throw new Error("Recorded fixture contains hidden model reasoning.");
  }
}
