/** Decodes legacy string tools and structured results through one boundary. */
export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; repairable: boolean };
  meta?: Record<string, unknown>;
}

export function decodeToolResult(value: string): ToolResult {
  const text = String(value ?? '');
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
      if (typeof parsed.ok !== 'boolean' || (parsed.ok === false &&
        (!parsed.error || typeof parsed.error.code !== 'string' || typeof parsed.error.message !== 'string' || typeof parsed.error.repairable !== 'boolean'))) {
        return { ok: false, error: { code: 'PROTOCOL_ERROR', message: 'Invalid structured tool result', repairable: false } };
      }
      return { ok: parsed.ok, data: parsed.data, error: parsed.ok ? undefined : parsed.error,
        meta: parsed.meta && typeof parsed.meta === 'object' && !Array.isArray(parsed.meta) ? parsed.meta : undefined };
    }
    return { ok: true, data: parsed };
  } catch { /* Legacy text results remain supported. */ }
  const cancelled = /^(?:Action cancelled|Error in approval process)/i.test(text.trim());
  const noMatch = /^(?:No (?:nodes|elements) (?:matched|found)|Error: No (?:nodes|elements) (?:matched|found))/i.test(text.trim());
  if (cancelled || noMatch || /^(?:error\b|Unable to\b)/i.test(text.trim())) {
    return { ok: false, error: { code: cancelled ? 'APPROVAL_DENIED' : noMatch ? 'NO_MATCH' : 'UNKNOWN', message: text, repairable: !cancelled } };
  }
  return { ok: true, data: text };
}
