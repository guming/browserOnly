import type { Page } from 'playwright-crx';
import type { WorkflowStep } from './types';
import { ReplayFailure, resolveReplayLocator } from './ReplayLocatorResolver';
export async function executeReplayStep(page: Page, step: WorkflowStep, input: string, signal: AbortSignal): Promise<string> {
  const separator = input.indexOf('|');
  const selector = ['browser_type', 'browser_select'].includes(step.toolName ?? '') ? input.slice(0, separator) : input;
  const target = await resolveReplayLocator(page, { ...step, input: selector });
  if (signal.aborted) throw new ReplayFailure('locate', 'Workflow cancelled');
  try {
    if (step.toolName === 'browser_type' || step.toolName === 'browser_select') {
      if (separator < 0) throw new Error('Missing input value');
      if (step.toolName === 'browser_select') await target.selectOption(input.slice(separator + 1), { timeout: step.timeoutMs });
      else await target.fill(input.slice(separator + 1), { timeout: step.timeoutMs });
    } else await target.click({ timeout: step.timeoutMs });
    return `Executed ${step.label}`;
  } catch (error) { throw new ReplayFailure('act', String(error)); }
}
