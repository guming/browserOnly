import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { summarizeSteps, stepsCsv, stepsMarkdown } from './step-report.mjs';
const api = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../../src/benchmark/StepRecorder.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(api);
test('counts actual execution attempts, failure and interrupted calls independently', () => {
  const recorder = new api.StepRecorder();
  const event = { executionId: 'a', toolName: 'browser_click', startedAt: 1000, executed: true };
  recorder.start(event);
  recorder.finish({ ...event, endedAt: 1020, durationMs: 20, result: { ok: false, error: { code: 'NO_MATCH' } } });
  recorder.start({ ...event, startedAt: 1030 }); // actual retry, same parent trace ID
  recorder.finish({ ...event, endedAt: 1080, durationMs: 50, result: { ok: true } });
  recorder.finish({ executionId: 'denied', executed: false });
  recorder.start({ ...event, executionId: 'b' });
  recorder.interrupt(false);
  assert.deepEqual(summarizeSteps(recorder.steps), { count: 3, succeeded: 1, failed: 1, unfinished: 1, toolDurationMs: 70 });
  assert.equal(recorder.steps[2].durationMs, undefined);
  assert.match(stepsCsv(recorder.steps), /NO_MATCH/);
  assert.match(stepsMarkdown(recorder.steps), /interrupted/);
  assert.equal(summarizeSteps(undefined), null);
});
