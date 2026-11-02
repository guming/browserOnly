import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function splitTasks(run, path, filename = 'tasks.json') {
  const tasks = { suiteId: run.suiteId, suiteVersion: run.suiteVersion, jobs: run.results.map(row => row.task) };
  if (tasks.jobs.some(job => !job)) throw new Error('Missing task snapshot');
  await writeFile(resolve(dirname(path), filename), `${JSON.stringify(tasks, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  run.tasksFile = filename;
  run.tasksSha256 = digest(tasks);
  for (const row of run.results) delete row.task;
  return run;
}
export async function hydrateTasks(run, path) {
  if (!run.tasksFile) return run; // Legacy embedded snapshots remain readable.
  const tasks = JSON.parse(await readFile(resolve(dirname(path), run.tasksFile), 'utf8'));
  if (digest(tasks) !== run.tasksSha256 || tasks.suiteId !== run.suiteId || tasks.suiteVersion !== run.suiteVersion) throw new Error('Task snapshot hash or suite identity mismatch');
  for (const row of run.results) {
    const task = tasks.jobs.find(job => job.id === row.jobId);
    if (!task) throw new Error(`Missing task ${row.jobId}`);
    if (row.task && JSON.stringify(row.task) !== JSON.stringify(task)) throw new Error(`${row.jobId}: task snapshot changed`);
    row.task = task;
  }
  return run;
}
export function reportOnly(run) {
  if (!run.tasksFile) return run;
  return { ...run, results: run.results.map(({ task, ...row }) => row) };
}
