import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hydrateTasks, splitTasks } from './run-storage.mjs';

const root = fileURLToPath(new URL('../../benchmarks/real-web/', import.meta.url));
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const fail = message => { throw new Error(message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const validDate = value => nonempty(value) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const suite = await readJson(resolve(root, 'suite.json'));
const jobs = await Promise.all(suite.jobs.map(path => readJson(resolve(root, path))));
const ids = jobs.map(job => job.id);
if (suite.schemaVersion !== 1 || new Set(ids).size !== jobs.length || jobs.length !== 10) fail('Expected ten unique jobs');
for (const job of jobs) {
  if (!nonempty(job.prompt) || !nonempty(job.name) || !job.allowedHosts.includes(new URL(job.startUrl).hostname)) fail(`Invalid job ${job.id}`);
  if (!['live', 'stable', 'snapshot'].includes(job.answerMode)) fail(`Invalid answer mode: ${job.id}`);
  if (!job.checks.length || new Set(job.checks.map(check => check.id)).size !== job.checks.length) fail(`Invalid checks: ${job.id}`);
  if (job.checks.some(check => !nonempty(check.id) || !nonempty(check.description))) fail(`Empty check: ${job.id}`);
}

function validate(run) {
  if (run.schemaVersion !== 1) fail('Run schema mismatch');
  const runJobs = run.tasksFile ? run.results.map(row => row.task) : jobs;
  if (!validDate(run.createdAt)) fail('createdAt must be an ISO timestamp with timezone');
  if (!run.environment || ['extensionVersion', 'model', 'provider', 'chromeVersion'].some(key => !nonempty(run.environment[key]))) fail('Fill all environment fields');
  if (run.environment.memory !== 'off' || run.environment.concurrency !== 1) fail('Baseline requires memory off and concurrency 1');
  if (!Array.isArray(run.results) || run.results.length !== runJobs.length || new Set(run.results.map(row => row.jobId)).size !== runJobs.length) fail('Run must contain each suite job exactly once');
  for (const row of run.results) {
    const job = runJobs.find(item => item.id === row.jobId);
    if (!job) fail(`Unknown job ${row.jobId}`);
    if (!['pending', 'reviewed', 'evaluated', 'blocked', 'cancelled'].includes(row.outcome)) fail(`${row.jobId}: invalid outcome`);
    if (JSON.stringify(row.task) !== JSON.stringify(job)) fail(`${row.jobId}: task snapshot changed; use a new suite version`);
    if (!Array.isArray(row.checks) || row.checks.length !== job.checks.length || new Set(row.checks.map(check => check.id)).size !== job.checks.length) fail(`${row.jobId}: checks missing or duplicated`);
    for (const check of row.checks) {
      if (!job.checks.some(item => item.id === check.id) || ![null, true, false].includes(check.passed) || typeof check.evidence !== 'string') fail(`${row.jobId}: invalid check`);
      if (check.passed !== null && !nonempty(check.evidence)) fail(`${row.jobId}/${check.id}: provide evidence or failure reason`);
    }
    for (const key of ['toolCalls', 'inputTokens', 'outputTokens']) {
      if (row[key] !== null && (!Number.isInteger(row[key]) || row[key] < 0)) fail(`${row.jobId}: invalid ${key}`);
    }
    if (row.outcome === 'pending') continue;
    if (!validDate(row.startedAt) || !validDate(row.endedAt) || Date.parse(row.endedAt) < Date.parse(row.startedAt)) fail(`${row.jobId}: invalid start/end time`);
    if (!nonempty(row.reviewer)) fail(`${row.jobId}: reviewer required`);
    if (row.outcome === 'reviewed' || row.outcome === 'evaluated') {
      if (row.outcome === 'reviewed' && row.checks.some(check => check.passed === null)) fail(`${row.jobId}: review every check`);
      if (row.outcome === 'evaluated' && (row.judgeType !== 'rules' || !row.automaticEvaluation?.evidenceSha256)) fail(`${row.jobId}: missing automatic evaluation provenance`);
      if ((!nonempty(row.answer) && !(row.outcome === 'evaluated' && row.agentStatus && row.agentStatus !== 'completed')) || !nonempty(row.observationEvidence)) fail(`${row.jobId}: answer and observation evidence required`);
    } else if (!nonempty(row.reason)) fail(`${row.jobId}: blocked/cancelled reason required`);
  }
}

function status(row) {
  if (row.outcome === 'pending' && row.agentStatus) return 'unverified';
  if (row.outcome !== 'reviewed' && row.outcome !== 'evaluated') return row.outcome;
  if (row.agentStatus && row.agentStatus !== 'completed') return 'failed';
  const seconds = (Date.parse(row.endedAt) - Date.parse(row.startedAt)) / 1000;
  if (seconds > suite.defaults.timeoutSeconds || row.toolCalls > suite.defaults.maxToolCalls) return 'failed';
  if (row.checks.some(check => check.passed === null) && !row.checks.some(check => check.passed === false)) return 'needs_review';
  const count = row.checks.filter(check => check.passed).length;
  return count === row.checks.length ? 'passed' : count > 0 ? 'partial' : 'failed';
}

const escape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const [command = 'help', arg] = process.argv.slice(2);
try {
  if (command === 'list') {
    jobs.forEach(job => console.log(`${job.id}\t${job.name}\t${job.answerMode}`));
  } else if (command === 'prompt') {
    const selected = arg === 'all' ? jobs : jobs.filter(job => job.id === arg || job.id.startsWith(`${arg}-`));
    if (!selected.length) fail('Use a job ID, 01–10, or all');
    for (const job of selected) {
      const english = job.language === 'en';
      console.log(`# ${job.id} ${job.name}\n\n${job.instructions || (english ? suite.instructionsEnglish : suite.instructions)}\n${english ? 'Allowed hosts' : '允许访问'}：${job.allowedHosts.join(', ')}\n${english ? 'Starting page' : '起始页面'}：${job.startUrl}\n\n${job.prompt}\n`);
    }
  } else if (command === 'init') {
    if (!arg) fail('init requires an output JSON path');
    const run = {
      schemaVersion: 1, suiteId: suite.id, suiteVersion: suite.version, createdAt: new Date().toISOString(),
      environment: { extensionVersion: '', model: '', provider: '', chromeVersion: '', memory: 'off', concurrency: 1 },
      results: jobs.map(job => ({ jobId: job.id, task: job, outcome: 'pending', startedAt: null, endedAt: null,
        toolCalls: null, inputTokens: null, outputTokens: null, answer: '', observationEvidence: '',
        reviewer: '', reason: '', checks: job.checks.map(check => ({ id: check.id, passed: null, evidence: '' })) })),
    };
    await mkdir(dirname(resolve(arg)), { recursive: true });
    await splitTasks(run, resolve(arg), `${arg.split('/').at(-1).replace(/\.json$/, '')}.tasks.json`);
    await writeFile(arg, `${JSON.stringify(run, null, 2)}\n`, { flag: 'wx' });
    console.log(`Created ${resolve(arg)}; fill environment fields before check/report.`);
  } else if (command === 'check' || command === 'report') {
    if (!arg) fail(`${command} requires a run JSON path`);
    const run = await hydrateTasks(await readJson(arg), resolve(arg));
    validate(run);
    if (command === 'check') console.log('Valid run record. Record validation does not itself verify website answers.');
    else {
      const counts = {};
      run.results.forEach(row => { const value = status(row); counts[value] = (counts[value] ?? 0) + 1; });
      console.log(`# ${suite.name}\n\nSuite: ${run.suiteVersion} · ${run.createdAt}`);
      console.log(`\n通过 ${counts.passed ?? 0}/${run.results.length}；部分 ${counts.partial ?? 0}；失败 ${counts.failed ?? 0}；受阻 ${counts.blocked ?? 0}；取消 ${counts.cancelled ?? 0}；未运行 ${counts.pending ?? 0}；待验收 ${counts.unverified ?? 0}；待复核 ${counts.needs_review ?? 0}`);
      console.log(`\n模型：${escape(run.environment.model)} · 提供商：${escape(run.environment.provider)} · 扩展：${escape(run.environment.extensionVersion)} · Chrome：${escape(run.environment.chromeVersion)}`);
      console.log('\n| 任务 | 验收结果 | Agent 状态 | 验收方式 | 耗时(秒) | 工具次数 | 说明 |\n|---|---|---|---|---:|---:|---|');
      for (const row of run.results) {
        const seconds = row.startedAt && row.endedAt ? Math.round((Date.parse(row.endedAt) - Date.parse(row.startedAt)) / 1000) : '—';
        console.log(`| ${row.jobId} | ${status(row)} | ${escape(row.agentStatus || '—')} | ${row.judgeType || 'manual'} | ${seconds} | ${row.toolCalls ?? '未记录'} | ${escape(row.reason)} |`);
      }
      console.log('\n工具步骤耗时（不包含模型等待和验收取证）：\n');
      for (const row of run.results.filter(row => row.stepSummary)) {
        const summary = row.stepSummary;
        console.log(`- ${row.jobId}：${summary.count} steps，成功 ${summary.succeeded}，失败 ${summary.failed}，未结束 ${summary.unfinished}；已完成工具耗时 ${(summary.toolDurationMs / 1000).toFixed(2)} 秒；取证 ${(Number(row.evidenceDurationMs || 0) / 1000).toFixed(2)} 秒。`);
      }
      console.log('\n验收方式区分 rules / manual；证据不足保留待复核。超出 300 秒或已记录工具调用超过 50 次计失败。未知调用量不视为 0。');
    }
  } else if (command === 'validate-suite') console.log(`Valid suite: ${suite.id}@${suite.version}, ${jobs.length} jobs.`);
  else if (command === 'help') console.log('node scripts/benchmark/real-web.mjs list | prompt <01–10|all> | init <run.json> | check <run.json> | report <run.json> | validate-suite');
  else fail(`Unknown command: ${command}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
