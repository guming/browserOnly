import type { Workflow, WorkflowRun, WorkflowStepRun, WorkflowVersion } from './types';

const DB_NAME = 'BrowserOnly-workflows';
const DB_VERSION = 1;

export class WorkflowStore {
  private static instance: WorkflowStore;
  private db: IDBDatabase | null = null;

  static getInstance(): WorkflowStore {
    if (!WorkflowStore.instance) WorkflowStore.instance = new WorkflowStore();
    return WorkflowStore.instance;
  }

  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('workflows')) {
          const store = db.createObjectStore('workflows', { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
          store.createIndex('status', 'status');
        }
        if (!db.objectStoreNames.contains('versions')) {
          const store = db.createObjectStore('versions', { keyPath: 'id' });
          store.createIndex('workflowId', 'workflowId');
        }
        if (!db.objectStoreNames.contains('runs')) {
          const store = db.createObjectStore('runs', { keyPath: 'id' });
          store.createIndex('workflowId', 'workflowId');
          store.createIndex('startedAt', 'startedAt');
        }
        if (!db.objectStoreNames.contains('stepRuns')) {
          const store = db.createObjectStore('stepRuns', { keyPath: 'id' });
          store.createIndex('runId', 'runId');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Unable to open workflow database'));
    });
    return this.db;
  }

  async listWorkflows(): Promise<Workflow[]> {
    const db = await this.open();
    return this.readAll<Workflow>(db, 'workflows');
  }

  async getWorkflow(id: string): Promise<Workflow | undefined> {
    const db = await this.open();
    return this.read<Workflow>(db, 'workflows', id);
  }

  async saveWorkflow(workflow: Workflow): Promise<void> {
    const db = await this.open();
    await this.put(db, 'workflows', workflow);
  }

  async archiveWorkflow(id: string): Promise<void> {
    const workflow = await this.getWorkflow(id);
    if (!workflow) throw new Error('Workflow not found');
    await this.saveWorkflow({ ...workflow, status: 'archived', updatedAt: Date.now() });
  }

  async saveVersion(version: WorkflowVersion): Promise<void> {
    const db = await this.open();
    await this.put(db, 'versions', version);
  }

  async getVersion(id: string): Promise<WorkflowVersion | undefined> {
    const db = await this.open();
    return this.read<WorkflowVersion>(db, 'versions', id);
  }

  async listVersions(workflowId: string): Promise<WorkflowVersion[]> {
    const db = await this.open();
    return this.readByIndex<WorkflowVersion>(db, 'versions', 'workflowId', workflowId);
  }

  async saveRun(run: WorkflowRun): Promise<void> {
    const db = await this.open();
    await this.put(db, 'runs', run);
  }

  async listRuns(workflowId?: string): Promise<WorkflowRun[]> {
    const db = await this.open();
    return workflowId
      ? this.readByIndex<WorkflowRun>(db, 'runs', 'workflowId', workflowId)
      : this.readAll<WorkflowRun>(db, 'runs');
  }

  async getRun(id: string): Promise<WorkflowRun | undefined> {
    const db = await this.open();
    return this.read<WorkflowRun>(db, 'runs', id);
  }

  async saveStepRun(stepRun: WorkflowStepRun): Promise<void> {
    const db = await this.open();
    await this.put(db, 'stepRuns', stepRun);
  }

  async listStepRuns(runId: string): Promise<WorkflowStepRun[]> {
    const db = await this.open();
    return this.readByIndex<WorkflowStepRun>(db, 'stepRuns', 'runId', runId);
  }

  private read<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  private readAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  private readByIndex<T>(db: IDBDatabase, storeName: string, indexName: string, value: IDBValidKey): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly').objectStore(storeName).index(indexName).getAll(value);
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  private put(db: IDBDatabase, storeName: string, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
