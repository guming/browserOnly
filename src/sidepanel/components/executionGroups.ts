import type { Message } from '../types';

/** Group by stable task identity; intervening screenshots/status messages do not split a run. */
export function executionGroups(messages: Message[]) {
  const groups = new Map<string, { start: number; activity: Message; messages: Message[] }>();
  messages.forEach((message, index) => {
    if (message.activity && message.runId) groups.set(message.runId, { start: index, activity: message, messages: [] });
  });
  messages.forEach(message => {
    const group = message.runId && groups.get(message.runId);
    if (group && !message.activity) group.messages.push(message);
  });
  return groups;
}
