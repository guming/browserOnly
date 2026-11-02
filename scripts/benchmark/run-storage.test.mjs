import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { splitTasks, hydrateTasks, reportOnly } from './run-storage.mjs';

test('separate snapshots round-trip, preserve old versions and detect tampering', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'browseronly-split-'));
  const path = join(dir, 'run.json');
  try {
    const run = { suiteId: 'old-suite', suiteVersion: 'old-version', results: [{ jobId: 'a', task: { id: 'a', prompt: 'Original prompt' }, answer: 'Answer' }] };
    await splitTasks(run, path);
    assert.equal(run.results[0].task, undefined);
    assert.equal(run.results[0].answer, 'Answer');
    await hydrateTasks(run, path);
    assert.equal(run.results[0].task.prompt, 'Original prompt');
    assert.equal(reportOnly(run).results[0].task, undefined);
    const snapshot = JSON.parse(await readFile(join(dir, 'tasks.json'), 'utf8'));
    snapshot.jobs[0].prompt = 'Changed';
    await writeFile(join(dir, 'tasks.json'), JSON.stringify(snapshot));
    await assert.rejects(hydrateTasks(run, path), /hash/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
