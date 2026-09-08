import type { WorkflowPatch, WorkflowStep, WorkflowVersion } from './types';
import { WorkflowStore } from './WorkflowStore';

export class RepairCoordinator {
  private readonly store = WorkflowStore.getInstance();

  validatePatch(version: WorkflowVersion, patch: WorkflowPatch): { valid: boolean; error?: string } {
    const step = version.steps.find(candidate => candidate.id === patch.targetStepId);
    if (!step) return { valid: false, error: 'Target step not found' };
    if (!patch.reason.trim()) return { valid: false, error: 'Patch reason is required' };
    if (!Number.isFinite(patch.confidence) || patch.confidence < 0 || patch.confidence > 1) return { valid: false, error: 'Confidence must be between 0 and 1' };
    if (patch.changes.timeoutMs !== undefined && (patch.changes.timeoutMs < 100 || patch.changes.timeoutMs > 120000)) return { valid: false, error: 'Timeout is outside allowed range' };
    return { valid: true };
  }

  async applyPatch(workflowId: string, version: WorkflowVersion, patch: WorkflowPatch): Promise<WorkflowVersion> {
    const validation = this.validatePatch(version, patch);
    if (!validation.valid) throw new Error(validation.error);
    const steps = version.steps.map(step => step.id === patch.targetStepId ? mergeStep(step, patch) : step);
    const next: WorkflowVersion = { ...version, id: `version-${crypto.randomUUID()}`, version: version.version + 1, source: 'ai_repair', steps, createdAt: Date.now() };
    await this.store.saveVersion(next);
    const workflow = await this.store.getWorkflow(workflowId);
    if (workflow) await this.store.saveWorkflow({ ...workflow, activeVersionId: next.id, status: 'active', updatedAt: Date.now() });
    return next;
  }
}

function mergeStep(step: WorkflowStep, patch: WorkflowPatch): WorkflowStep {
  return { ...step, locator: patch.changes.locator ?? step.locator, timeoutMs: patch.changes.timeoutMs ?? step.timeoutMs, preconditions: patch.changes.preconditions ?? step.preconditions, postconditions: patch.changes.postconditions ?? step.postconditions };
}
