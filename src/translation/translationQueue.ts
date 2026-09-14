import { TranslationRequest, TranslationResult, TranslationUnit } from './types';

interface QueueTask {
  request: TranslationRequest;
  unit: TranslationUnit;
  resolve: (result: TranslationResult[]) => void;
  reject: (error: unknown) => void;
}

interface PendingBatch {
  tasks: QueueTask[];
  chars: number;
  timer?: ReturnType<typeof setTimeout>;
}

interface ActiveBatch {
  tasks: QueueTask[];
  controller: AbortController;
}

/** Paragraph promises are micro-batched transparently for the provider. */
export class TranslationQueue {
  private pending = new Map<string, PendingBatch>();
  private ready: ActiveBatch[] = [];
  private active = new Set<ActiveBatch>();
  private cancelled = new Set<string>();

  constructor(
    private readonly execute: (request: TranslationRequest, signal: AbortSignal) => Promise<TranslationResult[]>,
    private readonly maxChars = 5000,
    private readonly maxItems = 12,
    private readonly batchDelayMs = 25,
  ) {}

  cancel(scope: string): void {
    this.cancelled.add(scope);
    for (const [key, batch] of this.pending) {
      const cancelledTasks = batch.tasks.filter((task) => task.request.pageSessionId === scope);
      const remainingTasks = batch.tasks.filter((task) => task.request.pageSessionId !== scope);
      cancelledTasks.forEach((task) => task.resolve([]));
      if (!remainingTasks.length) {
        if (batch.timer) clearTimeout(batch.timer);
        this.pending.delete(key);
      } else if (remainingTasks.length !== batch.tasks.length) {
        batch.tasks = remainingTasks;
        batch.chars = remainingTasks.reduce((sum, task) => sum + task.unit.text.length, 0);
      }
    }
    for (const batch of this.active) {
      if (batch.tasks.every((task) => this.cancelled.has(task.request.pageSessionId))) {
        batch.controller.abort();
      }
    }
    this.ready = this.ready.flatMap((batch) => {
      const cancelledTasks = batch.tasks.filter((task) => task.request.pageSessionId === scope);
      const remainingTasks = batch.tasks.filter((task) => task.request.pageSessionId !== scope);
      cancelledTasks.forEach((task) => task.resolve([]));
      return remainingTasks.length ? [{ ...batch, tasks: remainingTasks }] : [];
    });
  }

  isCancelled(scope: string): boolean {
    return this.cancelled.has(scope);
  }

  enqueue(request: TranslationRequest): Promise<TranslationResult[]> {
    if (this.isCancelled(request.pageSessionId)) return Promise.resolve([]);
    return Promise.all(request.units.map((unit) => this.enqueueUnit(request, unit)))
      .then((groups) => groups.flat());
  }

  private enqueueUnit(request: TranslationRequest, unit: TranslationUnit): Promise<TranslationResult[]> {
    return new Promise<TranslationResult[]>((resolve, reject) => {
      const task: QueueTask = { request, unit, resolve, reject };
      const key = this.getBatchKey(request);
      let batch = this.pending.get(key);
      if (batch && (batch.tasks.length >= this.maxItems || batch.chars + unit.text.length > this.maxChars)) {
        this.flush(key);
        batch = undefined;
      }
      if (!batch) {
        batch = { tasks: [], chars: 0 };
        this.pending.set(key, batch);
        batch.timer = setTimeout(() => this.flush(key), this.batchDelayMs);
      }
      batch.tasks.push(task);
      batch.chars += unit.text.length;
      if (batch.tasks.length >= this.maxItems || batch.chars >= this.maxChars) this.flush(key);
    });
  }

  private getBatchKey(request: TranslationRequest): string {
    return [request.engine, request.model, request.sourceLanguage, request.targetLanguage, request.style, request.context].join('|');
  }

  private flush(key: string): void {
    const pending = this.pending.get(key);
    if (!pending) return;
    this.pending.delete(key);
    if (pending.timer) clearTimeout(pending.timer);
    const tasks = pending.tasks.filter((task) => !this.isCancelled(task.request.pageSessionId));
    pending.tasks.filter((task) => this.isCancelled(task.request.pageSessionId)).forEach((task) => task.resolve([]));
    if (!tasks.length) return;
    const controller = new AbortController();
    this.ready.push({ tasks, controller });
    this.drain();
  }

  private drain(): void {
    while (this.active.size < 2 && this.ready.length) {
      const batch = this.ready.shift()!;
      this.active.add(batch);
      void this.executeBatch(batch.tasks, batch.controller.signal).finally(() => {
        this.active.delete(batch);
        this.drain();
      });
    }
  }

  private async executeBatch(tasks: QueueTask[], signal: AbortSignal): Promise<void> {
    const first = tasks[0].request;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const results = await this.execute({ ...first, units: tasks.map((task) => task.unit) }, signal);
        const resultsById = new Map(results.map((result) => [result.sourceId, result]));
        const missing = tasks.filter((task) => !resultsById.has(task.unit.sourceId));
        if (missing.length) {
          lastError = new Error('Translation result count mismatch');
          if (attempt < 2) continue;
          for (const task of tasks) {
            const result = resultsById.get(task.unit.sourceId);
            if (result) task.resolve([result]);
          }
          await this.executeIndividually(missing, signal);
          return;
        }
        for (const task of tasks) {
          if (this.isCancelled(task.request.pageSessionId)) task.resolve([]);
          else {
            const result = resultsById.get(task.unit.sourceId);
            if (result) task.resolve([result]);
            else task.reject(lastError || new Error(`Missing translation result for ${task.unit.sourceId}`));
          }
        }
        return;
      } catch (error) {
        lastError = error;
        if (signal.aborted || attempt === 2) break;
      }
    }
    for (const task of tasks) {
      if (this.isCancelled(task.request.pageSessionId)) task.resolve([]);
      else task.reject(lastError);
    }
  }

  private async executeIndividually(tasks: QueueTask[], signal: AbortSignal): Promise<void> {
    await Promise.allSettled(tasks.map(async (task) => {
      if (this.isCancelled(task.request.pageSessionId)) {
        task.resolve([]);
        return;
      }
      try {
        const results = await this.execute({ ...task.request, units: [task.unit] }, signal);
        const result = results.find((item) => item.sourceId === task.unit.sourceId);
        if (!result) throw new Error(`Missing translation result for ${task.unit.sourceId}`);
        task.resolve([result]);
      } catch (error) {
        if (this.isCancelled(task.request.pageSessionId)) task.resolve([]);
        else task.reject(error);
      }
    }));
  }
}
