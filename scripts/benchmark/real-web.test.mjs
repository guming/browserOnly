import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyExecution } from './runner-utils.mjs';
import { hydrateTasks } from './run-storage.mjs';
import { outputContract } from './evaluators/contracts.mjs';

const cli = fileURLToPath(new URL('./real-web.mjs', import.meta.url));
const invoke = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('job 10 is a signed-out Maps task with no shopping actions or login requirement', () => {
  const suite = JSON.parse(readFileSync(new URL('../../benchmarks/real-web/suite.json', import.meta.url), 'utf8'));
  const job = JSON.parse(readFileSync(new URL('../../benchmarks/real-web/jobs/10-google-maps-route.json', import.meta.url), 'utf8'));
  assert.equal(suite.jobs.length, 10);
  assert.ok(suite.jobs.includes('jobs/10-google-maps-route.json'));
  assert.equal(job.requiresLogin, false);
  assert.equal(job.interactiveLogin, false);
  const prompt = invoke('prompt', '10');
  assert.match(prompt, /British Museum/);
  assert.match(prompt, /King's Cross/);
  assert.match(prompt, /Without signing in/);
  assert.doesNotMatch(prompt, /Amazon|ASIN|cart|checkout/);
});

test('prompt 07 is entirely English including shared instructions and labels', () => {
  const prompt = invoke('prompt', '07');
  assert.match(prompt, /Answer in English/);
  assert.match(prompt, /Array.prototype.toSorted/);
  assert.match(prompt, /Allowed hosts/);
  assert.doesNotMatch(prompt, /[\u3400-\u9fff]/);
});

test('all task prompts and automated output contracts are English', async () => {
  const { outputContract } = await import('./evaluators/contracts.mjs');
  for (const id of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']) {
    const prompt = invoke('prompt', id);
    assert.match(prompt, /Answer in English/);
    assert.doesNotMatch(prompt + outputContract(id), /[\u3400-\u9fff]/);
  }
});

test('offline evaluation produces a new report and preserves source records', () => {
  const dir = mkdtempSync(join(tmpdir(), 'browseronly-offline-eval-'));
  const path = join(dir, 'run.json');
  const evaluator = fileURLToPath(new URL('./evaluate-real-web.mjs', import.meta.url));
  try {
    invoke('init', path);
    const run = JSON.parse(readFileSync(path, 'utf8'));
    Object.assign(run.environment, { extensionVersion: 'test', model: 'test', provider: 'test', chromeVersion: 'test' });
    const personUrl = 'https://en.wikipedia.org/wiki/Marie_Curie', cityUrl = 'https://en.wikipedia.org/wiki/Warsaw';
    const answer = JSON.stringify({ birthDate: '1867-11-07', city: 'Warsaw', country: 'Poland', personUrl, cityUrl });
    const execution = { jobId: run.results[2].jobId, status: 'completed', answer, toolCalls: 2, inputTokens: 10, outputTokens: 10,
      startedAt: '2026-11-02T10:00:00+08:00', endedAt: '2026-11-02T10:01:00+08:00', events: [
        { at: '2026-11-02T10:00:00+08:00', url: personUrl, content: { text: '7 November 1867', links: [{ href: cityUrl }] } },
        { kind: 'tool', trace: { toolName: 'browser_click', result: { ok: true } } },
        { at: '2026-11-02T10:00:10+08:00', url: cityUrl, content: { text: 'Country Poland' } },
      ] };
    const evidence = join(dir, 'execution.json');
    writeFileSync(evidence, JSON.stringify(execution));
    applyExecution(run.results[2], execution, evidence);
    writeFileSync(path, JSON.stringify(run));
    const original = readFileSync(path, 'utf8');
    const report = execFileSync(process.execPath, [evaluator, path], { encoding: 'utf8' });
    assert.match(report, /通过 1\/10/);
    assert.equal(readFileSync(path, 'utf8'), original);
    const evaluatedPath = join(dir, 'run.evaluated.json');
    const evaluated = JSON.parse(readFileSync(evaluatedPath, 'utf8'));
    assert.equal(evaluated.results[2].judgeType, 'rules');
    assert.equal(evaluated.results[2].outcome, 'evaluated');
    assert.match(evaluated.results[2].automaticEvaluation.evidenceSha256, /^[a-f0-9]{64}$/);
    evaluated.results[2].agentStatus = 'failed';
    writeFileSync(evaluatedPath, JSON.stringify(evaluated));
    assert.match(invoke('report', evaluatedPath), /通过 0\/10.*失败 1/);
    assert.equal(spawnSync(process.execPath, [evaluator, path]).status, 1);
    execution.answer = 'Changed answer';
    writeFileSync(evidence, JSON.stringify(execution));
    const rejected = spawnSync(process.execPath, [evaluator, path, join(dir, 'different.json')], { encoding: 'utf8' });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /differs from original evidence/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('prompts expose goals without evaluator answers', () => {
  assert.match(invoke('validate-suite'), /10 jobs/);
  const prompt = invoke('prompt', '03');
  assert.match(prompt, /Marie Curie/);
  assert.doesNotMatch(prompt, /1867-11-07|Poland|"checks"/);
});

test('manual run validation, scoring, budget and overwrite protection', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'browseronly-benchmark-'));
  const path = join(dir, 'run.json');
  const save = run => writeFileSync(path, JSON.stringify(run));
  const rejected = pattern => {
    const result = spawnSync(process.execPath, [cli, 'check', path], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, pattern);
  };
  try {
    invoke('init', path);
    const raw = readFileSync(path, 'utf8');
    assert.equal(spawnSync(process.execPath, [cli, 'init', path]).status, 1);
    assert.equal(readFileSync(path, 'utf8'), raw);
    rejected(/environment/);
    const run = await hydrateTasks(JSON.parse(raw), path);
    Object.assign(run.environment, { extensionVersion: 'test-build', model: 'test-model', provider: 'test-provider', chromeVersion: 'test-chrome' });
    save(run);
    assert.match(invoke('report', path), /通过 0\/10.*未运行 10/);
    for (const [index, row] of run.results.entries()) {
      row.outcome = 'reviewed';
      row.startedAt = '2026-11-02T10:00:00+08:00';
      row.endedAt = '2026-11-02T10:01:00+08:00';
      row.reviewer = 'test reviewer';
      row.answer = 'Synthetic test answer, not a real Agent result';
      row.observationEvidence = 'Synthetic validation fixture';
      row.toolCalls = 10;
      row.checks.forEach(check => { check.passed = true; check.evidence = 'Synthetic evidence'; });
      if (index === 1) row.checks[0].passed = false;
      if (index === 2) row.checks.forEach(check => { check.passed = false; });
      if (index === 3) { row.outcome = 'blocked'; row.reason = 'Synthetic network failure'; }
      if (index === 4) { row.outcome = 'cancelled'; row.reason = 'Synthetic user cancellation'; }
      if (index === 5) row.endedAt = '2026-11-02T10:05:01+08:00';
      if (index === 6) row.toolCalls = 51;
    }
    save(run);
    assert.match(invoke('report', path), /通过 4\/10；部分 1；失败 3；受阻 1；取消 1；未运行 0/);
    run.results[0].checks[0].evidence = '';
    save(run);
    rejected(/provide evidence/);
    run.results[0].checks[0].evidence = 'Synthetic evidence';
    run.results[0].checks[0].passed = null;
    save(run);
    rejected(/review every check/);
    run.results[0].checks[0].passed = true;
    run.results[0].task.prompt = 'Changed task';
    save(run);
    rejected(/snapshot changed/);
    run.results[0].task = (await hydrateTasks(JSON.parse(raw), path)).results[0].task;
    run.results[1].jobId = run.results[0].jobId;
    save(run);
    rejected(/exactly once|snapshot changed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

 test('all ten tasks require no login and public task contracts match their goals', () => {
  const root = new URL('../../benchmarks/real-web/', import.meta.url);
  const suite = JSON.parse(readFileSync(new URL('suite.json', root), 'utf8'));
  assert.equal(suite.jobs.length, 10);
  for (const path of suite.jobs) {
    const job = JSON.parse(readFileSync(new URL(path, root), 'utf8'));
    assert.notEqual(job.requiresLogin, true);
    assert.notEqual(job.interactiveLogin, true);
  }
  const catalog = invoke('prompt', '08');
  assert.match(catalog, /Gutenberg/);
  assert.match(outputContract('08-gutenberg-catalog'), /ebookNumber/);
  const news = invoke('prompt', '09');
  assert.match(news, /NASA/);
  assert.match(outputContract('09-nasa-news-summary'), /archiveUrl/);
  assert.doesNotMatch(catalog + news, /conversations|starred|publishedAt|Twitter|Gmail/);
});
