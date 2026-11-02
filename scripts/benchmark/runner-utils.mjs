import { summarizeSteps } from './step-report.mjs';
export function modelConfig(env) {
  const provider = env.BENCHMARK_PROVIDER;
  const supported = ['anthropic', 'openai', 'gemini', 'ollama', 'openai-compatible', 'deepseek'];
  if (!supported.includes(provider)) throw new Error(`Set BENCHMARK_PROVIDER to one of: ${supported.join(', ')}`);
  if (!env.BENCHMARK_MODEL) throw new Error('Set BENCHMARK_MODEL to the full model ID');
  if (provider !== 'ollama' && !env.BENCHMARK_API_KEY) throw new Error('Set BENCHMARK_API_KEY (never pass it as a command argument)');
  if (provider === 'openai-compatible' && !env.BENCHMARK_BASE_URL) throw new Error('Set BENCHMARK_BASE_URL for openai-compatible');
  return { provider, apiModelId: env.BENCHMARK_MODEL, apiKey: env.BENCHMARK_API_KEY || '', ...(env.BENCHMARK_BASE_URL ? { baseUrl: env.BENCHMARK_BASE_URL } : {}) };
}

export function applyExecution(row, execution, evidencePath) {
  row.agentStatus = execution.status;
  row.verificationStatus = 'unverified';
  row.judgeType = 'manual';
  row.outcome = 'pending'; // Never turn Agent completion into a verified pass.
  row.startedAt = execution.startedAt;
  row.endedAt = execution.endedAt;
  row.answer = execution.answer || execution.outputs?.at(-1) || '';
  row.toolCalls = execution.toolCalls ?? null;
  row.inputTokens = execution.inputTokens ?? null;
  row.outputTokens = execution.outputTokens ?? null;
  row.reason = execution.reason || execution.outcome?.reason || '';
  row.observationEvidence = evidencePath;
  row.stepSummary = summarizeSteps(execution.steps);
  row.evidenceDurationMs = execution.evidenceDurationMs ?? null;
}

export function parseArgs(args) {
  const options = { headless: false, smoke: false };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--headless') options.headless = true;
    else if (flag === '--smoke') options.smoke = true;
    else if (flag === '--all') options.all = true;
    else if (flag === '--login') options.login = true;
    else if (['--job', '--output', '--executable'].includes(flag)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
      options[flag.slice(2)] = value;
    } else throw new Error(`Unknown argument: ${flag}`);
  }
  if (options.job && options.all) throw new Error('Choose --job or --all');
  if (options.login && options.headless) throw new Error('--login requires a visible browser; remove --headless');
  if (!options.job && !options.all && !options.smoke) throw new Error('Choose --job 01–10, --all, or --smoke');
  return options;
}
