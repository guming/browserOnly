import { valueText } from './normalizers';
import type { MonitorDiff, MonitorTrigger, NormalizedMonitorValue } from './types';

export interface TriggerResult { conditionMet: boolean; shouldNotify: boolean; nextTriggerActive: boolean; }

export function evaluateTrigger(trigger: MonitorTrigger, current: NormalizedMonitorValue, diff: MonitorDiff | undefined, active: boolean): TriggerResult {
  if (trigger.type === 'changed') {
    const conditionMet = diff?.changed === true;
    return { conditionMet, shouldNotify: conditionMet, nextTriggerActive: false };
  }
  if (current.type === 'price') {
    const delta = diff?.numericDelta;
    const sameCurrency = !('currency' in trigger) || !trigger.currency || trigger.currency === current.currency;
    const conditionMet = sameCurrency && (trigger.type === 'price_decreases' ? typeof delta === 'number' && delta < 0
      : trigger.type === 'price_increases' ? typeof delta === 'number' && delta > 0
      : trigger.type === 'price_below' ? current.amount < trigger.amount
      : trigger.type === 'price_above' ? current.amount > trigger.amount : false);
    const event = trigger.type === 'price_decreases' || trigger.type === 'price_increases';
    return { conditionMet, shouldNotify: conditionMet && (event || !active), nextTriggerActive: event ? false : conditionMet };
  }
  if (current.type === 'stock') {
    const conditionMet = current.state !== 'unknown' && (trigger.type === 'back_in_stock' ? current.state === 'in_stock' : trigger.type === 'out_of_stock' ? current.state === 'out_of_stock' : false);
    return { conditionMet, shouldNotify: conditionMet && !active, nextTriggerActive: conditionMet };
  }
  let haystack = valueText(current);
  let needle = 'text' in trigger ? trigger.text : '';
  if ('caseSensitive' in trigger && !trigger.caseSensitive) { haystack = haystack.toLocaleLowerCase(); needle = needle.toLocaleLowerCase(); }
  const conditionMet = trigger.type === 'text_appears' ? haystack.includes(needle)
    : trigger.type === 'text_disappears' ? !haystack.includes(needle) : false;
  return { conditionMet, shouldNotify: conditionMet && !active, nextTriggerActive: conditionMet };
}
