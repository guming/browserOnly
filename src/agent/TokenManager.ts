import Anthropic from "@anthropic-ai/sdk";

interface GenericMessage {
  role: string;
  content: string | any;
}

const MAX_CONTEXT_TOKENS = 12_000;

/** Very cheap "char/4" token estimator. */
export const approxTokens = (text: string) => Math.ceil(text.length / 4);

export const contextTokenCount = (msgs: Anthropic.MessageParam[] | GenericMessage[]) =>
  msgs.reduce((sum, m) => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return sum + approxTokens(content);
  }, 0);

/** Keep the original request and the newest conversation that fits the budget. */
export function trimHistory(msgs: Anthropic.MessageParam[], maxTokens = MAX_CONTEXT_TOKENS) {
  if (contextTokenCount(msgs) <= maxTokens || msgs.length <= 1) return msgs;

  const original = msgs[0];
  const originalTokens = contextTokenCount([original]);
  const trimmedOriginal = originalTokens > maxTokens
    ? { ...original, content: truncateContent(original.content, maxTokens * 4) }
    : original;
  const remainingTokens = Math.max(0, maxTokens - contextTokenCount([trimmedOriginal]));
  const recent: Anthropic.MessageParam[] = [];
  let recentTokens = 0;

  // Keep a contiguous suffix so recent assistant/tool-result exchanges stay in order.
  for (let index = msgs.length - 1; index >= 1; index--) {
    const message = msgs[index];
    const tokens = contextTokenCount([message]);
    if (recentTokens + tokens <= remainingTokens) {
      recent.unshift(message);
      recentTokens += tokens;
      continue;
    }
    const available = remainingTokens - recentTokens;
    if (available > 0 && recent.length === 0) {
      recent.unshift({ ...message, content: truncateContent(message.content, available * 4) });
    }
    break;
  }

  return [trimmedOriginal, ...recent];
}

function truncateContent(content: unknown, maxChars: number): string {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  if (text.length <= maxChars) return text;
  const marker = '\n[…earlier context trimmed…]\n';
  const available = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(available * 0.25);
  return `${text.slice(0, head)}${marker}${text.slice(-(available - head))}`;
}
