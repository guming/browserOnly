import type { Page } from 'playwright-crx';
import type { WorkflowStep } from './types';
import { ReplayFailure, resolveReplayLocator } from './ReplayLocatorResolver';
export async function executeReplayStep(page: Page, step: WorkflowStep, input: string, signal: AbortSignal): Promise<string> {
  const separator = input.indexOf('|');
  const selector = step.toolName === 'browser_type' ? input.slice(0, separator) : input;
  const target = await resolveReplayLocator(page, { ...step, input: selector });
  if (signal.aborted) throw new ReplayFailure('locate', 'Workflow cancelled');
  try {
    if (step.toolName === 'browser_type') {
      if (separator < 0) throw new Error('Missing type value');
      await target.fill(input.slice(separator + 1), { timeout: step.timeoutMs });
    } else await target.click({ timeout: step.timeoutMs });
    return `Executed ${step.label}`;
  } catch (error) { throw new ReplayFailure('act', String(error)); }
}
