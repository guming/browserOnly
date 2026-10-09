import type { Page } from 'playwright-crx';
import type { WorkflowStep } from './types';
export class ReplayFailure extends Error {
  constructor(public phase: 'locate' | 'act' | 'verify', message: string) { super(message); }
}
export async function resolveReplayLocator(page: Page, step: WorkflowStep) {
  const locator = step.locator;
  if (!locator) throw new ReplayFailure('locate', 'No replay locator recorded');
  for (const kind of locator.fallbackOrder) {
    let target;
    try {
      target = kind === 'role' && locator.role ? page.getByRole(locator.role as any, { name: locator.accessibleName, exact: true })
        : kind === 'label' && locator.label ? page.getByLabel(locator.label, { exact: true })
        : kind === 'testId' && locator.testId ? page.getByTestId(locator.testId)
        : kind === 'text' && locator.text ? page.getByText(locator.text, { exact: true })
        : kind === 'css' && locator.css ? page.locator(locator.css) : undefined;
      if (!target) continue;
      const count = await target.count();
      if (count > 1) throw new ReplayFailure('locate', 'Ambiguous replay target');
      if (count === 1 && await target.isVisible() && await target.isEnabled()) return target;
    } catch (error) { if (error instanceof ReplayFailure) throw error; }
  }
  throw new ReplayFailure('locate', 'Replay target is missing or not actionable');
}
