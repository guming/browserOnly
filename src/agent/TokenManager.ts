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
  if (maxChars <= marker.length) return marker.slice(0, Math.max(0, maxChars));
  const available = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(available * 0.25);
  return `${text.slice(0, head)}${marker}${available > head ? text.slice(-(available - head)) : ''}`;
}

/** Trim native calls atomically with their tool results, never orphan either. */
export function trimNativeHistory(messages: any[], maxTokens = MAX_CONTEXT_TOKENS): any[] {
  if (!messages.length) return messages;
  const cost = (value: unknown) => approxTokens(JSON.stringify(value));
  if (messages.reduce((sum, message) => sum + cost(message), 0) <= maxTokens) return messages;
  const first = { ...messages[0] };
  if (cost(first) >= maxTokens) first.content = truncateContent(first.content, Math.max(0, (maxTokens - 40) * 4));
  let available = Math.max(0, maxTokens - cost(first));
  const groups: any[][] = [];
  for (let index = 1; index < messages.length; index++) {
    const message = messages[index];
    if (message.tool_calls) {
      const ids = new Set(message.tool_calls.map((call: any) => call.id));
      const group = [message];
      while (index + 1 < messages.length && messages[index + 1].role === 'tool' && ids.has(messages[index + 1].tool_call_id)) group.push(messages[++index]);
      if (group.length === ids.size + 1) groups.push(group);
    } else if (message.role !== 'tool') groups.push([message]);
  }
  const recent: any[] = [];
  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index];
    const tokens = group.reduce((sum, message) => sum + cost(message), 0);
    if (tokens <= available) { recent.unshift(...group); available -= tokens; continue; }
    if (!recent.length) {
      const copy = group.map(message => ({ ...message }));
      const last = copy[copy.length - 1];
      // Only text/result content may be clipped, never function arguments/IDs.
      const overhead = copy.reduce((sum, message) => sum + cost(message === last ? { ...message, content: '' } : message), 0);
      if (available > overhead + 20) {
        last.content = truncateContent(last.content, Math.floor((available - overhead - 20) * 2));
        if (copy.reduce((sum, message) => sum + cost(message), 0) <= available) recent.unshift(...copy);
      }
    }
    break;
  }
  return [first, ...recent];
}
