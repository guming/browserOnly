import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, mkdtemp, rm, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { modelConfig, applyExecution, parseArgs } from './runner-utils.mjs';
import { outputContract } from './evaluators/contracts.mjs';
import { applyEvaluation } from './evaluators/index.mjs';
import { stepsCsv, stepsMarkdown } from './step-report.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const suiteRoot = join(repo, 'benchmarks/real-web');
const extension = join(repo, 'dist-benchmark');
const cli = join(repo, 'scripts/benchmark/real-web.mjs');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
async function save(path, value) {
  await writeFile(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
async function remote(worker, fn, arg) {
  let timer;
  try {
    return await Promise.race([worker.evaluate(fn, arg), new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('BRIDGE_RESPONSE_TIMEOUT')), 15000);
    })]);
  } finally { clearTimeout(timer); }
}

async function openBrowser(options) {
  const profile = await mkdtemp(join(tmpdir(), 'browseronly-benchmark-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: options.headless,
      ...(options.executable ? { executablePath: resolve(options.executable) } : {}),
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    let worker = context.serviceWorkers().find(value => value.url().startsWith('chrome-extension://'));
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if (await remote(worker, () => globalThis.__browserOnlyBenchmark?.version === 1)) return { context, worker, profile };
      await delay(200);
    }
    throw new Error('Benchmark bridge not found; run npm run build:benchmark first');
  } catch (error) {
    await context?.close().catch(() => {});
    await rm(profile, { recursive: true, force: true });
    throw error;
  }
}

async function closeBrowser(browser) {
  await browser.context.close().catch(() => {});
  await rm(browser.profile, { recursive: true, force: true });
}

async function writeEvidence(dir, execution) {
  await mkdir(dir, { recursive: true });
  for (const step of execution.steps || []) {
    if (step.status === 'running') step.status = execution.status === 'cancelled' ? 'cancelled' : 'interrupted';
  }
  let index = 0;
  for (const event of execution.events || []) {
    if (event.pngBase64) {
      const name = `screenshot-${String(index++).padStart(3, '0')}.png`;
      await writeFile(join(dir, name), Buffer.from(event.pngBase64, 'base64'), { mode: 0o600 });
      event.screenshot = name;
      delete event.pngBase64;
    }
  }
  await save(join(dir, 'execution.json'), execution);
  if (Array.isArray(execution.steps)) {
    await writeFile(join(dir, 'steps.csv'), stepsCsv(execution.steps));
    await writeFile(join(dir, 'steps.md'), stepsMarkdown(execution.steps));
  }
}

async function smoke(options, output) {
  let modelCalls = 0;
  const server = createServer((request, response) => {
    if (request.url === '/v1/chat/completions') {
      request.resume();
      const content = modelCalls++ === 0
        ? '<tool>browser_read_text</tool><input></input><requires_approval>false</requires_approval>'
        : '<finish status="completed">BrowserOnly bridge ready</finish>';
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' });
      response.end(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\ndata: [DONE]\n\n`);
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Benchmark smoke</title><h1>BrowserOnly bridge ready</h1>');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  let browser;
  try {
    browser = await openBrowser(options);
    const url = `http://127.0.0.1:${server.address().port}/`;
    const result = await remote(browser.worker, url => globalThis.__browserOnlyBenchmark.probe(url), url);
    if (result.title !== 'Benchmark smoke' || !result.text.includes('BrowserOnly bridge ready')) throw new Error('Smoke observation mismatch');
    await save(join(output, 'smoke.json'), result);
    await closeBrowser(browser);
    browser = undefined;
    const execution = await runJob(options, { id: 'smoke-agent', startUrl: url }, 'Read this page and return its heading.', {
      provider: 'openai-compatible', apiModelId: 'benchmark-smoke', apiKey: 'local-test-only', baseUrl: `${url}v1`,
    }, output);
    if (execution.status !== 'completed' || execution.toolCalls < 1 || !execution.answer.includes('BrowserOnly bridge ready')) {
      throw new Error(`Agent smoke failed: ${execution.status}, ${execution.reason || execution.outcome?.reason || 'unknown'}; see ${output}`);
    }
    if ((execution.events || []).filter(event => event.kind === 'screenshot').length < 2 || execution.evidenceErrors?.length) {
      throw new Error(`Screenshot evidence smoke failed; see ${output}`);
    }
    console.log(`Smoke passed: real extension + Agent loop + browser tool + evidence (local stub model, not a benchmark score). Evidence: ${output}`);
  } finally {
    if (browser) await closeBrowser(browser);
    await new Promise(resolve => server.close(resolve));
  }
}

async function runJob(options, job, prompt, config, output) {
  const dir = join(output, job.id);
  await mkdir(dir, { recursive: true });
  let browser;
  let runId;
  let execution;
  const startedAt = new Date().toISOString();
  try {
    browser = await openBrowser(options);
    if (job.interactiveLogin && options.login) {
      const loginPage = await browser.context.newPage();
      await loginPage.goto(job.startUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const terminal = createInterface({ input: process.stdin, output: process.stdout });
      try { await terminal.question(`Sign in manually for ${job.id}, then press Enter here to start the task: `); }
      finally { terminal.close(); }
      await loginPage.close();
    }
    runId = `${job.id}-${crypto.randomUUID()}`;
    // The key stays in the disposable Profile; don't save or log the start payload.
    await remote(browser.worker, input => globalThis.__browserOnlyBenchmark.start(input), {
      runId, jobId: job.id, startUrl: job.startUrl, prompt, timeoutSeconds: options.smoke ? 20 : 300, config,
    });
    const deadline = Date.now() + (options.smoke ? 20000 : 300000);
    let cancellationAt;
    while (true) {
      const status = await remote(browser.worker, id => globalThis.__browserOnlyBenchmark.status(id), runId);
      if (!status.busy) break;
      if (!cancellationAt && Date.now() > deadline) {
        cancellationAt = Date.now();
        await remote(browser.worker, id => globalThis.__browserOnlyBenchmark.cancel(id, 'TIMEOUT'), runId);
      }
      if (cancellationAt && Date.now() - cancellationAt > 10000) {
        execution = await remote(browser.worker, id => globalThis.__browserOnlyBenchmark.result(id), runId);
        execution.status = 'failed';
        execution.reason = 'TIMEOUT_FORCE_CLOSED';
        execution.endedAt = new Date().toISOString();
        break; // finally closes the entire browser, so no previous Agent can overlap.
      }
      await delay(500);
    }
    execution ||= await remote(browser.worker, id => globalThis.__browserOnlyBenchmark.result(id), runId);
    execution.browserVersion = browser.context.browser()?.version() || 'unknown';
  } catch (error) {
    // Recover the last durable checkpoint if the worker is gone.
    if (browser) {
      try { execution = await remote(browser.worker, async () => (await chrome.storage.local.get('benchmarkRun')).benchmarkRun); }
      catch { /* Browser may have closed; report interruption with available evidence. */ }
    }
    execution ||= { runId, jobId: job.id, startedAt, events: [], outputs: [], toolCalls: 0, inputTokens: 0, outputTokens: 0 };
    execution.status = 'interrupted';
    execution.reason = String(error.message || error).split(config.apiKey || '\0').join('[REDACTED]');
    execution.endedAt = new Date().toISOString();
  } finally {
    try { if (execution) await writeEvidence(dir, execution); }
    finally { if (browser) await closeBrowser(browser); }
  }
  return execution;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const suite = await json(join(suiteRoot, 'suite.json'));
  const jobs = await Promise.all(suite.jobs.map(path => json(join(suiteRoot, path))));
  const selected = options.smoke ? [] : options.all ? jobs : jobs.filter(job => job.id === options.job || job.id.startsWith(`${options.job}-`));
  if (!options.smoke && !selected.length) throw new Error('Unknown job; use 01–10');
  if (selected.some(job => job.requiresLogin) && !options.login) throw new Error('Selected jobs require manual sign-in. Add --login and use a visible browser.');
  const config = options.smoke ? undefined : modelConfig(process.env);
  await readFile(join(extension, 'manifest.json')); // Fail before creating an output directory.
  const output = resolve(options.output || join(suiteRoot, 'runs', `auto-${new Date().toISOString().replaceAll(':', '-')}`));
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output, { recursive: false }); // Never overwrite a previous run.
  if (options.smoke) return smoke(options, output);
  const runPath = join(output, 'run.json');
  execFileSync(process.execPath, [cli, 'init', runPath], { stdio: 'pipe' });
  const run = await json(runPath);
  const manifest = await json(join(extension, 'manifest.json'));
  Object.assign(run.environment, { extensionVersion: manifest.version, model: config.apiModelId,
    provider: config.provider, chromeVersion: 'not-started', runner: 'real-extension-v2', answerFormat: 'json-v1' });
  await save(runPath, run);
  for (const job of selected) {
    console.log(`Running ${job.id}…`);
    const prompt = execFileSync(process.execPath, [cli, 'prompt', job.id], { encoding: 'utf8' }) + outputContract(job.id);
    const execution = await runJob(options, job, prompt, config, output);
    run.environment.chromeVersion = execution.browserVersion || run.environment.chromeVersion;
    const row = run.results.find(row => row.jobId === job.id);
    applyExecution(row, execution, join(output, job.id, 'execution.json'));
    applyEvaluation(row, execution, job);
    await save(runPath, run);
    console.log(`${job.id}: ${execution.status}; ${row.verificationStatus}`);
  }
  await writeFile(join(output, 'report.md'), execFileSync(process.execPath, [cli, 'report', runPath], { encoding: 'utf8' }));
  console.log(`Saved ${runPath}. Null checks require independent review; no extra model calls were made for judging.`);
  if (run.results.some(row => row.agentStatus && (row.agentStatus !== 'completed' || row.checks.some(check => check.passed === false)))) process.exitCode = 1;
  else if (run.results.some(row => row.agentStatus && row.checks.some(check => check.passed === null))) process.exitCode = 2;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
