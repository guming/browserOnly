import type { Monitor, MonitorDiff, MonitorRun, MonitorScreenshot, MonitorSnapshot } from './types';

const DB_NAME = 'BrowserOnly-monitors';
const DB_VERSION = 1;
type StoreName = 'monitors' | 'runs' | 'snapshots' | 'diffs' | 'screenshots';

export class MonitorStore {
  private static instance: MonitorStore;
  private db: IDBDatabase | null = null;
  static getInstance(): MonitorStore { return this.instance ??= new MonitorStore(); }

  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const ensure = (name: StoreName, indexes: Array<[string, string | string[]]>) => {
          if (db.objectStoreNames.contains(name)) return;
          const store = db.createObjectStore(name, { keyPath: 'id' });
          for (const [index, path] of indexes) store.createIndex(index, path);
        };
        ensure('monitors', [['status', 'status'], ['nextRunAt', 'nextRunAt'], ['updatedAt', 'updatedAt']]);
        ensure('runs', [['monitorId', 'monitorId'], ['startedAt', 'startedAt'], ['monitorStartedAt', ['monitorId', 'startedAt']]]);
        ensure('snapshots', [['monitorId', 'monitorId'], ['observedAt', 'observedAt'], ['monitorObservedAt', ['monitorId', 'observedAt']]]);
        ensure('diffs', [['monitorId', 'monitorId'], ['createdAt', 'createdAt'], ['monitorCreatedAt', ['monitorId', 'createdAt']]]);
        ensure('screenshots', [['monitorId', 'monitorId'], ['createdAt', 'createdAt']]);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Unable to open monitor database'));
    });
    return this.db as IDBDatabase;
  }

  async listMonitors(): Promise<Monitor[]> { return this.all('monitors'); }
  async getMonitor(id: string): Promise<Monitor | undefined> { return this.get('monitors', id); }
  async saveMonitor(value: Monitor): Promise<void> { return this.put('monitors', value); }
  async saveRun(value: MonitorRun): Promise<void> { return this.put('runs', value); }
  async saveSnapshot(value: MonitorSnapshot): Promise<void> { return this.put('snapshots', value); }
  async saveDiff(value: MonitorDiff): Promise<void> { return this.put('diffs', value); }
  async saveScreenshot(value: MonitorScreenshot): Promise<void> { return this.put('screenshots', value); }
  async getSnapshot(id: string): Promise<MonitorSnapshot | undefined> { return this.get('snapshots', id); }
  async getDiff(id: string): Promise<MonitorDiff | undefined> { return this.get('diffs', id); }
  async listRuns(monitorId: string): Promise<MonitorRun[]> { return this.byIndex('runs', 'monitorId', monitorId); }
  async listSnapshots(monitorId: string): Promise<MonitorSnapshot[]> { return this.byIndex('snapshots', 'monitorId', monitorId); }
  async listDiffs(monitorId: string): Promise<MonitorDiff[]> { return this.byIndex('diffs', 'monitorId', monitorId); }
  async listScreenshots(monitorId: string): Promise<MonitorScreenshot[]> { return this.byIndex('screenshots', 'monitorId', monitorId); }
  async latestSnapshot(monitorId: string): Promise<MonitorSnapshot | undefined> {
    return (await this.listSnapshots(monitorId)).sort((a, b) => b.observedAt - a.observedAt)[0];
  }
  async listDueMonitors(now = Date.now()): Promise<Monitor[]> {
    const db = await this.open();
    const due = await requestResult<Monitor[]>(db.transaction('monitors').objectStore('monitors').index('nextRunAt').getAll(IDBKeyRange.upperBound(now)));
    return due.filter(item => item.status === 'active').sort((a, b) => (a.nextRunAt ?? 0) - (b.nextRunAt ?? 0));
  }
  async deleteMonitor(id: string): Promise<void> {
    const db = await this.open();
    const names: StoreName[] = ['monitors', 'runs', 'snapshots', 'diffs', 'screenshots'];
    const tx = db.transaction(names, 'readwrite');
    tx.objectStore('monitors').delete(id);
    for (const name of names.slice(1)) {
      const index = tx.objectStore(name).index('monitorId');
      const request = index.openKeyCursor(IDBKeyRange.only(id));
      request.onsuccess = () => { const cursor = request.result; if (cursor) { tx.objectStore(name).delete(cursor.primaryKey); cursor.continue(); } };
    }
    await complete(tx);
  }

  async cleanupMonitor(monitorId: string): Promise<void> {
    const runs = (await this.listRuns(monitorId)).sort((a, b) => b.startedAt - a.startedAt);
    for (const run of runs.slice(100)) await this.deleteKey('runs', run.id);
    const snapshots = (await this.listSnapshots(monitorId)).sort((a, b) => b.observedAt - a.observedAt);
    const removed = new Set(snapshots.slice(50).map(item => item.id));
    for (const snapshot of snapshots.slice(50)) await this.deleteKey('snapshots', snapshot.id);
    for (const diff of await this.listDiffs(monitorId)) if (removed.has(diff.previousSnapshotId) || removed.has(diff.currentSnapshotId)) await this.deleteKey('diffs', diff.id);
    const screenshots = (await this.listScreenshots(monitorId)).sort((a, b) => b.createdAt - a.createdAt);
    for (const screenshot of screenshots.slice(20)) await this.deleteKey('screenshots', screenshot.id);
  }

  private async get<T>(name: StoreName, key: IDBValidKey): Promise<T | undefined> { const db = await this.open(); return requestResult(db.transaction(name).objectStore(name).get(key)); }
  private async all<T>(name: StoreName): Promise<T[]> { const db = await this.open(); return requestResult(db.transaction(name).objectStore(name).getAll()); }
  private async byIndex<T>(name: StoreName, index: string, key: IDBValidKey): Promise<T[]> { const db = await this.open(); return requestResult(db.transaction(name).objectStore(name).index(index).getAll(key)); }
  private async put(name: StoreName, value: unknown): Promise<void> { const db = await this.open(); await requestResult(db.transaction(name, 'readwrite').objectStore(name).put(value)); }
  private async deleteKey(name: StoreName, key: IDBValidKey): Promise<void> { const db = await this.open(); await requestResult(db.transaction(name, 'readwrite').objectStore(name).delete(key)); }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function complete(tx: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
