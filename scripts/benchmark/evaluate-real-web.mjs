import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { applyEvaluation } from './evaluators/index.mjs';
import { hydrateTasks, reportOnly } from './run-storage.mjs';

try {
  const [input, output] = process.argv.slice(2);
  if (!input) throw new Error('Usage: npm run benchmark:evaluate -- <run.json> [new-output.json]');
  const path = resolve(input);
  const target = resolve(output || path.replace(/\.json$/, '') + '.evaluated.json');
  if (target === path) throw new Error('Use a new output file; do not overwrite original/manual results');
  const run = await hydrateTasks(JSON.parse(await readFile(path, 'utf8')), path);
  if (!Array.isArray(run.results)) throw new Error('Invalid run record');
  for (const row of run.results) {
    if (!row.agentStatus || (row.outcome === 'reviewed' && row.judgeType !== 'rules')) continue;
    const evidencePath = resolve(dirname(path), row.observationEvidence);
    const execution = JSON.parse(await readFile(evidencePath, 'utf8'));
    if (row.answer !== (execution.answer || execution.outputs?.at(-1) || '')) throw new Error(`${row.jobId}: answer differs from original evidence`);
    applyEvaluation(row, execution);
  }
  // Validate before writing a reviewable result. This does not visit the network.
  const cli = fileURLToPath(new URL('./real-web.mjs', import.meta.url));
  if (run.tasksFile) run.tasksFile = resolve(dirname(path), run.tasksFile);
  const temporary = await mkdtemp(join(tmpdir(), 'browseronly-evaluation-'));
  try {
    const candidate = join(temporary, 'run.json');
    await writeFile(candidate, JSON.stringify(run));
    execFileSync(process.execPath, [cli, 'check', candidate], { stdio: 'pipe' });
  } finally { await rm(temporary, { recursive: true, force: true }); }
  if (run.tasksFile) run.tasksFile = resolve(dirname(path), run.tasksFile);
  await writeFile(target, `${JSON.stringify(reportOnly(run), null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  const report = execFileSync(process.execPath, [cli, 'report', target], { encoding: 'utf8' });
  await writeFile(join(dirname(target), `${target.split('/').at(-1).replace(/\.json$/, '')}.md`), report, { flag: 'wx' });
  console.log(report);
  console.log(`Saved ${target}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
