import { parseDocument, stringify } from 'yaml';
import type { TestAction, TestCaseDefinition, TestImportDiff, TestSuiteDocument, TestTarget } from './types';

export const MAX_TEST_FILE_BYTES = 1_048_576;
export const MAX_TEST_CASES = 50;
export const MAX_STEPS_PER_CASE = 40;
const ALLOWED_ASSERTIONS = new Set(['url_matches', 'element_visible', 'element_absent', 'text_present', 'value_equals']);
const ALLOWED_KEYS = new Set(['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp']);

export class TestProtocolError extends Error {
  constructor(message: string, readonly line?: number, readonly column?: number) { super(message); this.name = 'TestProtocolError'; }
}

export function parseTestSuite(source: string): TestSuiteDocument {
  if (new TextEncoder().encode(source).length > MAX_TEST_FILE_BYTES) throw new TestProtocolError('File exceeds 1 MB');
  if (/(^|\s)!(?:!|<|[a-z])/im.test(source)) throw new TestProtocolError('Custom YAML tags are not supported');
  const doc = parseDocument(source, { uniqueKeys: true, prettyErrors: true });
  if (doc.errors.length) {
    const error: any = doc.errors[0];
    throw new TestProtocolError(error.message, error.linePos?.[0]?.line, error.linePos?.[0]?.col);
  }
  const value = doc.toJS({ maxAliasCount: 20 });
  return validateTestSuite(value);
}

export function validateTestSuite(value: unknown): TestSuiteDocument {
  const root = record(value, 'root');
  exactKeys(root, ['schemaVersion', 'suiteId', 'name', 'site', 'allowedDomains', 'cases'], 'root');
  if (root.schemaVersion !== 1) invalid('schemaVersion', 'must equal 1');
  const suiteId = identifier(root.suiteId, 'suiteId');
  const name = text(root.name, 'name', 1, 120);
  const site = httpUrl(root.site, 'site');
  const allowedDomains = stringArray(root.allowedDomains, 'allowedDomains', 1, 20);
  const siteHost = new URL(site).hostname.toLowerCase();
  if (!allowedDomains.some(domain => domainMatches(siteHost, domain))) invalid('allowedDomains', 'must include the site host');
  if (!Array.isArray(root.cases) || root.cases.length > MAX_TEST_CASES) invalid('cases', `must contain 0-${MAX_TEST_CASES} cases`);
  const ids = new Set<string>();
  const cases = root.cases.map((item, index) => {
    const path = `cases[${index}]`;
    const itemRecord = record(item, path);
    exactKeys(itemRecord, ['id', 'name', 'description', 'needsReview', 'steps'], path);
    const id = identifier(itemRecord.id, `${path}.id`);
    if (ids.has(id)) invalid(`${path}.id`, 'must be unique within the suite');
    ids.add(id);
    if (itemRecord.needsReview !== undefined && typeof itemRecord.needsReview !== 'boolean') invalid(`${path}.needsReview`, 'must be a boolean');
    if (!Array.isArray(itemRecord.steps) || itemRecord.steps.length < 1 || itemRecord.steps.length > MAX_STEPS_PER_CASE) invalid(`${path}.steps`, `must contain 1-${MAX_STEPS_PER_CASE} steps`);
    const stepIds = new Set<string>();
    itemRecord.steps.forEach((step: unknown, stepIndex: number) => {
      const stepRecord = record(step, `${path}.steps[${stepIndex}]`);
      const stepId = text(stepRecord.id, `${path}.steps[${stepIndex}].id`, 1, 100);
      if (stepIds.has(stepId)) invalid(`${path}.steps[${stepIndex}].id`, 'must be unique within the case');
      stepIds.add(stepId);
    });
    return {
      id,
      name: text(itemRecord.name, `${path}.name`, 1, 160),
      ...(itemRecord.description !== undefined ? { description: text(itemRecord.description, `${path}.description`, 0, 1000) } : {}),
      ...(itemRecord.needsReview === true ? { needsReview: true } : {}),
      steps: itemRecord.steps.map((step, stepIndex) => validateStep(step, `${path}.steps[${stepIndex}]`, allowedDomains)),
    } satisfies TestCaseDefinition;
  });
  return { schemaVersion: 1, suiteId, name, site, allowedDomains, cases };
}

function validateStep(value: unknown, path: string, domains: string[]): TestCaseDefinition['steps'][number] {
  const step = record(value, path);
  if (('act' in step) === ('assert' in step)) invalid(path, 'must contain exactly one of act or assert');
  if ('act' in step) {
    exactKeys(step, ['id', 'act'], path);
    const actionValue = record(step.act, `${path}.act`);
    const type = text(actionValue.type, `${path}.act.type`, 1, 30);
    let act: TestAction;
    if (type === 'navigate') {
      exactKeys(actionValue, ['type', 'url'], `${path}.act`);
      const url = httpUrl(actionValue.url, `${path}.act.url`);
      if (!domains.some(domain => domainMatches(new URL(url).hostname.toLowerCase(), domain))) invalid(`${path}.act.url`, 'host is outside allowedDomains');
      act = { type, url };
    } else if (type === 'click' || type === 'fill') {
      exactKeys(actionValue, type === 'click' ? ['type', 'target', 'risk'] : ['type', 'target', 'value', 'sensitive'], `${path}.act`);
      const target = validateTarget(actionValue.target, `${path}.act.target`);
      if (type === 'click') {
        if (actionValue.risk !== undefined && actionValue.risk !== 'read' && actionValue.risk !== 'write') invalid(`${path}.act.risk`, 'must be read or write');
        act = { type, target, ...(actionValue.risk ? { risk: actionValue.risk } : {}) };
      }
      else {
        if (actionValue.sensitive !== undefined && typeof actionValue.sensitive !== 'boolean') invalid(`${path}.act.sensitive`, 'must be a boolean');
        act = { type, target, value: text(actionValue.value, `${path}.act.value`, 0, 2000), ...(actionValue.sensitive === true ? { sensitive: true } : {}) };
      }
    } else if (type === 'press') {
      exactKeys(actionValue, ['type', 'key'], `${path}.act`);
      const key = text(actionValue.key, `${path}.act.key`, 1, 30);
      if (!ALLOWED_KEYS.has(key)) invalid(`${path}.act.key`, 'is not an allowed key');
      act = { type, key: key as Extract<TestAction, { type: 'press' }>['key'] };
    } else invalid(`${path}.act.type`, 'is not supported');
    return { id: text(step.id, `${path}.id`, 1, 100), act: act! };
  }
  exactKeys(step, ['id', 'assert'], path);
  const assertion = record(step.assert, `${path}.assert`);
  exactKeys(assertion, ['type', 'target', 'expected', 'timeoutMs'], `${path}.assert`);
  const type = text(assertion.type, `${path}.assert.type`, 1, 40);
  if (!ALLOWED_ASSERTIONS.has(type)) invalid(`${path}.assert.type`, 'is not supported');
  const needsTarget = type === 'element_visible' || type === 'element_absent' || type === 'value_equals';
  if (needsTarget !== (assertion.target !== undefined)) invalid(`${path}.assert.target`, needsTarget ? 'is required' : 'is not allowed');
  const timeoutMs = assertion.timeoutMs === undefined ? 5000 : Number(assertion.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) invalid(`${path}.assert.timeoutMs`, 'must be an integer from 1000 to 30000');
  const checksPresence = type === 'element_visible' || type === 'element_absent';
  if (checksPresence && assertion.expected !== undefined) invalid(`${path}.assert.expected`, 'is not used for visibility assertions');
  const expected = checksPresence ? undefined : text(assertion.expected, `${path}.assert.expected`, type === 'value_equals' ? 0 : 1, 1000);
  if (expected && /^REPLACE_WITH_[A-Z0-9_]+$/.test(expected)) invalid(`${path}.assert.expected`, 'is a placeholder; enter a real expected value');
  return { id: text(step.id, `${path}.id`, 1, 100), assert: { type: type as any, ...(needsTarget ? { target: validateTarget(assertion.target, `${path}.assert.target`) } : {}), ...(expected !== undefined ? { expected } : {}), timeoutMs } };
}

function validateTarget(value: unknown, path: string): TestTarget {
  const target = record(value, path);
  exactKeys(target, ['placeholder', 'role', 'name', 'label', 'testId', 'css'], path);
  const output: TestTarget = {};
  for (const key of ['placeholder', 'role', 'name', 'label', 'testId', 'css'] as const) if (target[key] !== undefined) output[key] = text(target[key], `${path}.${key}`, 1, 300);
  if (!Object.keys(output).length) invalid(path, 'must include a locator');
  return output;
}

export function stringifyTestSuite(suite: TestSuiteDocument): string { return stringify(suite, { lineWidth: 100 }); }

export function diffTestSuiteImport(incoming: TestSuiteDocument, existing: Array<{ id: string; definition: TestCaseDefinition }>): TestImportDiff {
  const oldById = new Map(existing.map(item => [item.id, item]));
  const seen = new Set<string>();
  const added: TestCaseDefinition[] = [], changed: TestCaseDefinition[] = [], unchanged: TestCaseDefinition[] = [];
  for (const item of incoming.cases) {
    const current = oldById.get(item.id);
    seen.add(item.id);
    if (!current) added.push(item);
    else if (stableStringify(current.definition) === stableStringify(item)) unchanged.push(item);
    else changed.push(item);
  }
  return { added, changed, unchanged, missing: existing.filter(item => !seen.has(item.id)).map(item => ({ id: item.id, suiteId: incoming.suiteId, name: item.definition.name, activeVersionId: '', updatedAt: 0 })) };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
function domainMatches(host: string, domain: string): boolean { const normalized = domain.toLowerCase().replace(/^\*\./, ''); return host === normalized || host.endsWith(`.${normalized}`); }
function record(value: unknown, path: string): Record<string, any> { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'must be an object'); return value as Record<string, any>; }
function text(value: unknown, path: string, min: number, max: number): string { if (typeof value !== 'string' || value.length < min || value.length > max) invalid(path, `must be a string of ${min}-${max} characters`); return value as string; }
function identifier(value: unknown, path: string): string { const result = text(value, path, 1, 100); if (!/^[a-zA-Z0-9_-]+$/.test(result)) invalid(path, 'may contain only letters, numbers, hyphen, and underscore'); return result; }
function stringArray(value: unknown, path: string, min: number, max: number): string[] { if (!Array.isArray(value) || value.length < min || value.length > max) invalid(path, `must contain ${min}-${max} items`); return value.map((item, index) => text(item, `${path}[${index}]`, 1, 253)); }
function httpUrl(value: unknown, path: string): string { const url = text(value, path, 1, 2048); let parsed: URL; try { parsed = new URL(url); } catch { invalid(path, 'must be an absolute URL'); } if (!['http:', 'https:'].includes(parsed!.protocol) || parsed!.username || parsed!.password) invalid(path, 'must be an HTTP(S) URL without credentials'); return parsed!.toString(); }
function exactKeys(value: Record<string, any>, allowed: string[], path: string): void { const unknown = Object.keys(value).find(key => !allowed.includes(key)); if (unknown) invalid(`${path}.${unknown}`, 'is not allowed'); }
function invalid(path: string, message: string): never { throw new TestProtocolError(`${path}: ${message}`); }
