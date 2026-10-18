import type { TestCaseRecord, TestCaseRun, TestCaseVersion, TestStepResult, TestSuiteDocument, TestSuiteRecord, TestSuiteRun } from './types';

const DB_NAME = 'BrowserOnly-tests';
const DB_VERSION = 1;
type StoreName = 'suites' | 'cases' | 'caseVersions' | 'suiteRuns' | 'caseRuns' | 'stepResults' | 'evidence';

export class TestStore {
  private static instance: TestStore;
  private db?: IDBDatabase;
  static getInstance(): TestStore { return this.instance ??= new TestStore(); }

  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const ensure = (name: StoreName, indexes: Array<[string, string]>) => {
          const store = db.objectStoreNames.contains(name) ? request.transaction!.objectStore(name) : db.createObjectStore(name, { keyPath: 'id' });
          for (const [index, key] of indexes) if (!store.indexNames.contains(index)) store.createIndex(index, key);
        };
        ensure('suites', [['updatedAt', 'updatedAt']]);
        ensure('cases', [['suiteId', 'suiteId']]);
        ensure('caseVersions', [['caseId', 'caseId'], ['suiteId', 'suiteId']]);
        ensure('suiteRuns', [['suiteId', 'suiteId'], ['createdAt', 'createdAt']]);
        ensure('caseRuns', [['suiteRunId', 'suiteRunId'], ['caseId', 'caseId']]);
        ensure('stepResults', [['caseRunId', 'caseRunId']]);
        ensure('evidence', [['caseRunId', 'caseRunId']]);
      };
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); this.db = undefined; }; resolve(request.result); };
      request.onerror = () => reject(request.error ?? new Error('Unable to open test database'));
      request.onblocked = () => reject(new Error('Test database upgrade is blocked. Close other BrowserOnly views and retry.'));
    });
    return this.db;
  }

  async listSuites(): Promise<TestSuiteRecord[]> { return this.all('suites'); }
  async getSuite(id: string): Promise<TestSuiteRecord | undefined> { return this.get('suites', id); }
  async listCases(suiteId: string): Promise<TestCaseRecord[]> { return this.byIndex('cases', 'suiteId', suiteId); }
  async getCase(id: string): Promise<TestCaseRecord | undefined> { return this.get('cases', id); }
  async getVersion(id: string): Promise<TestCaseVersion | undefined> { return this.get('caseVersions', id); }
  async createUnactivatedVersion(suiteId: string, definition: TestCaseVersion['definition'], source: TestCaseVersion['source'] = 'generated'): Promise<TestCaseVersion> {
    const db = await this.open();
    const caseId = `${suiteId}:${definition.id}`;
    let created: TestCaseVersion | undefined;
    await this.transaction(db, ['caseVersions'], tx => {
      const versions = tx.objectStore('caseVersions');
      const count = versions.index('caseId').count(caseId);
      count.onsuccess = () => {
        created = { id: crypto.randomUUID(), suiteId, caseId, version: count.result + 1, definition, source, createdAt: Date.now() };
        versions.put(created);
      };
    });
    if (!created) throw new Error('Could not create test draft version.');
    return created;
  }
  async listVersions(caseId: string): Promise<TestCaseVersion[]> { return this.byIndex('caseVersions', 'caseId', caseId); }
  async listSuiteRuns(suiteId: string): Promise<TestSuiteRun[]> { return this.byIndex('suiteRuns', 'suiteId', suiteId); }
  async listCaseRuns(suiteRunId: string): Promise<TestCaseRun[]> { return this.byIndex('caseRuns', 'suiteRunId', suiteRunId); }
  async listStepResults(caseRunId: string): Promise<TestStepResult[]> { return this.byIndex('stepResults', 'caseRunId', caseRunId); }
  async saveSuiteDraft(suiteId: string, yaml?: string): Promise<void> { const suite = await this.getSuite(suiteId); if (!suite) throw new Error('Test suite not found'); const updated = { ...suite, updatedAt: Date.now() }; if (yaml === undefined) delete updated.draftYaml; else updated.draftYaml = yaml; await this.put('suites', updated); }
  async backupSuiteDraft(suiteId: string, yaml: string): Promise<void> { const suite = await this.getSuite(suiteId); if (!suite) throw new Error('Test suite not found'); await this.put('suites', { ...suite, previousDraftYaml: yaml, updatedAt: Date.now() }); }
  async updateSuiteMetadata(suiteId: string, values: Pick<TestSuiteDocument, 'name' | 'site' | 'allowedDomains'>): Promise<void> { const suite = await this.getSuite(suiteId); if (!suite) throw new Error('Test suite not found'); await this.put('suites', { ...suite, ...values, updatedAt: Date.now() }); }

  async importNewSuite(document: TestSuiteDocument): Promise<void> {
    const db = await this.open();
    await this.transaction(db, ['suites', 'cases', 'caseVersions'], tx => {
      const now = Date.now();
      const suite: TestSuiteRecord = { schemaVersion: 1, suiteId: document.suiteId, name: document.name, site: document.site, allowedDomains: document.allowedDomains, createdAt: now, updatedAt: now };
      tx.objectStore('suites').put({ ...suite, id: suite.suiteId });
      for (const definition of document.cases) {
        const versionId = crypto.randomUUID();
        const version: TestCaseVersion = { id: versionId, suiteId: suite.suiteId, caseId: `${suite.suiteId}:${definition.id}`, version: 1, definition, source: 'import', createdAt: now };
        const item: TestCaseRecord = { id: `${suite.suiteId}:${definition.id}`, suiteId: suite.suiteId, name: definition.name, activeVersionId: versionId, updatedAt: now };
        tx.objectStore('caseVersions').put(version);
        tx.objectStore('cases').put(item);
      }
    });
  }

  async removeEmptySuite(suiteId: string): Promise<void> {
    const db = await this.open();
    await this.transaction(db, ['suites', 'cases'], tx => {
      const count = tx.objectStore('cases').index('suiteId').count(suiteId);
      count.onsuccess = () => { if (count.result === 0) tx.objectStore('suites').delete(suiteId); };
    });
  }

  /** Remove a case from the active suite while retaining versions referenced by past reports. */
  async deleteCase(suiteId: string, caseId: string): Promise<void> {
    const db = await this.open();
    await this.transaction(db, ['cases', 'suites'], tx => {
      const cases = tx.objectStore('cases');
      cases.delete(`${suiteId}:${caseId}`);
      const suiteStore = tx.objectStore('suites');
      const request = suiteStore.get(suiteId);
      request.onsuccess = () => {
        const suite = request.result as TestSuiteRecord | undefined;
        if (suite) suiteStore.put({ ...suite, updatedAt: Date.now() });
      };
    });
  }

  async applyImportedCases(suiteId: string, definitions: TestCaseVersion['definition'][]): Promise<void> {
    const db = await this.open();
    await this.transaction(db, ['cases', 'caseVersions', 'suites'], tx => {
      const now = Date.now();
      for (const definition of definitions) {
        const caseId = `${suiteId}:${definition.id}`;
        const getRequest = tx.objectStore('cases').get(caseId);
        getRequest.onsuccess = () => {
          const current = getRequest.result as TestCaseRecord | undefined;
          const versionId = crypto.randomUUID();
          const countRequest = tx.objectStore('caseVersions').index('caseId').count(caseId);
          countRequest.onsuccess = () => {
            const version: TestCaseVersion = { id: versionId, suiteId, caseId, version: countRequest.result + 1, definition, source: 'import', createdAt: now };
            tx.objectStore('caseVersions').put(version);
            tx.objectStore('cases').put({ id: caseId, suiteId, name: definition.name, activeVersionId: versionId, updatedAt: now, ...(current?.draftYaml ? { draftYaml: current.draftYaml } : {}) });
          };
        };
      }
      const suiteReq = tx.objectStore('suites').get(suiteId);
      suiteReq.onsuccess = () => { if (suiteReq.result) tx.objectStore('suites').put({ ...suiteReq.result, updatedAt: now }); };
    });
  }

  async activateDefinitions(suiteId: string, definitions: TestCaseVersion['definition'][], source: TestCaseVersion['source'] = 'edit', expectedVersions?: Record<string, string>): Promise<void> {
    const db = await this.open();
    await this.transaction(db, ['cases', 'caseVersions', 'suites'], tx => {
      const now = Date.now();
      const casesStore = tx.objectStore('cases'), versionsStore = tx.objectStore('caseVersions');
      for (const definition of definitions) {
        const caseId = `${suiteId}:${definition.id}`;
        const request = casesStore.get(caseId);
        request.onsuccess = () => {
          const current = request.result as TestCaseRecord | undefined;
          if (expectedVersions && Object.prototype.hasOwnProperty.call(expectedVersions, definition.id) && current?.activeVersionId !== expectedVersions[definition.id]) { tx.abort(); return; }
          const count = versionsStore.index('caseId').count(caseId);
          count.onsuccess = () => {
            const versionId = crypto.randomUUID();
            versionsStore.put({ id: versionId, suiteId, caseId, version: count.result + 1, definition, source, createdAt: now } satisfies TestCaseVersion);
            casesStore.put({ id: caseId, suiteId, name: definition.name, activeVersionId: versionId, updatedAt: now } satisfies TestCaseRecord);
          };
        };
      }
      const suiteRequest = tx.objectStore('suites').get(suiteId);
      suiteRequest.onsuccess = () => { if (suiteRequest.result) tx.objectStore('suites').put({ ...suiteRequest.result, updatedAt: now, draftYaml: undefined }); };
    });
  }

  async activateDefinitionsAndMetadata(suiteId: string, definitions: TestCaseVersion['definition'][], metadata: Pick<TestSuiteDocument, 'name' | 'site' | 'allowedDomains'>, expectedVersions: Record<string, string>): Promise<void> {
    const db = await this.open();
    await this.transaction(db, ['cases', 'caseVersions', 'suites'], tx => {
      const casesStore = tx.objectStore('cases'), versionsStore = tx.objectStore('caseVersions'), suitesStore = tx.objectStore('suites');
      const suiteRequest = suitesStore.get(suiteId);
      suiteRequest.onsuccess = () => {
        const suite = suiteRequest.result as TestSuiteRecord | undefined;
        if (!suite) { tx.abort(); return; }
        const host = new URL(metadata.site).hostname.toLowerCase();
        const includesHost = metadata.allowedDomains.some(domain => { const normalized = domain.toLowerCase().replace(/^\*\./, ''); return host === normalized || host.endsWith(`.${normalized}`); });
        if (!includesHost) { tx.abort(); return; }
        let remaining = definitions.length;
        const commitSuite = () => { if (remaining === 0) { const updated = { ...suite, ...metadata, updatedAt: Date.now() }; delete updated.draftYaml; suitesStore.put(updated); } };
        commitSuite();
        for (const definition of definitions) {
          const caseId = `${suiteId}:${definition.id}`;
          const request = casesStore.get(caseId);
          request.onsuccess = () => {
            const current = request.result as TestCaseRecord | undefined;
            if ((current?.activeVersionId ?? '') !== expectedVersions[definition.id]) { tx.abort(); return; }
            const count = versionsStore.index('caseId').count(caseId);
            count.onsuccess = () => {
              const versionId = crypto.randomUUID();
              versionsStore.put({ id: versionId, suiteId, caseId, version: count.result + 1, definition, source: 'edit', createdAt: Date.now() } satisfies TestCaseVersion);
              casesStore.put({ id: caseId, suiteId, name: definition.name, activeVersionId: versionId, updatedAt: Date.now() } satisfies TestCaseRecord);
              remaining -= 1;
              commitSuite();
            };
          };
        }
      };
    });
  }

  async setActiveVersion(suiteId: string, caseId: string, versionId: string, expectedVersionId: string): Promise<void> {
    const db = await this.open();
    await this.transaction(db, ['cases', 'caseVersions'], tx => {
      const casesStore = tx.objectStore('cases'), versionsStore = tx.objectStore('caseVersions');
      const caseRequest = casesStore.get(`${suiteId}:${caseId}`), versionRequest = versionsStore.get(versionId);
      caseRequest.onsuccess = () => {
        const current = caseRequest.result as TestCaseRecord | undefined;
        if (!current || current.activeVersionId !== expectedVersionId) { tx.abort(); return; }
        versionRequest.onsuccess = () => {
          const version = versionRequest.result as TestCaseVersion | undefined;
          if (!version || version.suiteId !== suiteId || version.caseId !== current.id) { tx.abort(); return; }
          casesStore.put({ ...current, name: version.definition.name, activeVersionId: versionId, updatedAt: Date.now() });
        };
      };
    });
  }

  async restoreVersionAsNew(suiteId: string, caseId: string, versionId: string, expectedVersionId: string): Promise<TestCaseVersion> {
    const db = await this.open();
    let restored: TestCaseVersion | undefined;
    await this.transaction(db, ['cases', 'caseVersions'], tx => {
      const casesStore = tx.objectStore('cases'), versionsStore = tx.objectStore('caseVersions');
      const caseRequest = casesStore.get(`${suiteId}:${caseId}`), versionRequest = versionsStore.get(versionId);
      caseRequest.onsuccess = () => {
        const current = caseRequest.result as TestCaseRecord | undefined;
        if (!current || current.activeVersionId !== expectedVersionId) { tx.abort(); return; }
        versionRequest.onsuccess = () => {
          const previous = versionRequest.result as TestCaseVersion | undefined;
          if (!previous || previous.suiteId !== suiteId || previous.caseId !== current.id) { tx.abort(); return; }
          const countRequest = versionsStore.index('caseId').count(current.id);
          countRequest.onsuccess = () => {
            restored = { id: crypto.randomUUID(), suiteId, caseId: current.id, version: countRequest.result + 1, definition: previous.definition, source: 'restore', createdAt: Date.now() };
            versionsStore.put(restored);
            casesStore.put({ ...current, name: previous.definition.name, activeVersionId: restored.id, updatedAt: Date.now() });
          };
        };
      };
    });
    if (!restored) throw new Error('Could not restore test case version.');
    return restored;
  }

  async putRun(run: TestSuiteRun): Promise<void> { await this.put('suiteRuns', run); }
  async putCaseRun(run: TestCaseRun): Promise<void> { await this.put('caseRuns', run); }
  async putStepResult(result: TestStepResult): Promise<void> { await this.put('stepResults', result); }
  async putEvidence(id: string, caseRunId: string, data: string): Promise<void> { await this.put('evidence', { id, caseRunId, data, createdAt: Date.now() }); }
  async getEvidence(id: string): Promise<{ id: string; caseRunId: string; data: string } | undefined> { return this.get('evidence', id); }

  private async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> { const db = await this.open(); return new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).get(key); req.onsuccess = () => resolve(req.result as T | undefined); req.onerror = () => reject(req.error); }); }
  private async all<T>(store: StoreName): Promise<T[]> { const db = await this.open(); return new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess = () => resolve(req.result as T[]); req.onerror = () => reject(req.error); }); }
  private async byIndex<T>(store: StoreName, index: string, key: IDBValidKey): Promise<T[]> { const db = await this.open(); return new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).index(index).getAll(key); req.onsuccess = () => resolve(req.result as T[]); req.onerror = () => reject(req.error); }); }
  private async put(store: StoreName, value: unknown): Promise<void> { const db = await this.open(); await this.transaction(db, [store], tx => { tx.objectStore(store).put(value); }); }
  private transaction(db: IDBDatabase, stores: StoreName[], queue: (tx: IDBTransaction) => void): Promise<void> { return new Promise((resolve, reject) => { const tx = db.transaction(stores, 'readwrite'); tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Test store transaction failed')); queue(tx); }); }
}
