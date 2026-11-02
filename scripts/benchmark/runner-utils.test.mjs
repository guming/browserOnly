import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelConfig, applyExecution, parseArgs } from './runner-utils.mjs';

test('require explicit provider/model and keep keys out of validation errors', () => {
  assert.throws(() => modelConfig({}), /BENCHMARK_PROVIDER/);
  assert.throws(() => modelConfig({ BENCHMARK_PROVIDER: 'openai' }), /BENCHMARK_MODEL/);
  assert.throws(() => modelConfig({ BENCHMARK_PROVIDER: 'openai', BENCHMARK_MODEL: 'model' }), /BENCHMARK_API_KEY/);
  const config = modelConfig({ BENCHMARK_PROVIDER: 'ollama', BENCHMARK_MODEL: 'local-model' });
  assert.equal(config.apiKey, '');
  assert.throws(() => modelConfig({ BENCHMARK_PROVIDER: 'openai-compatible', BENCHMARK_MODEL: 'model', BENCHMARK_API_KEY: 'secret' }), /BASE_URL/);
});

test('Agent completion and failures both remain unverified until independent review', () => {
  for (const status of ['completed', 'failed', 'cancelled', 'interrupted']) {
    const row = { checks: [{ id: 'correct', passed: null, evidence: '' }] };
    applyExecution(row, { status, answer: 'answer', toolCalls: 2, outcome: { reason: 'MODEL_FINAL' } }, '/tmp/evidence.json');
    assert.equal(row.agentStatus, status);
    assert.equal(row.outcome, 'pending');
    assert.equal(row.verificationStatus, 'unverified');
    assert.equal(row.checks[0].passed, null);
    assert.equal(row.observationEvidence, '/tmp/evidence.json');
    assert.equal(row.inputTokens, null);
  }
});

test('runner rejects ambiguous selection and missing option values', () => {
  assert.equal(parseArgs(['--job', '10']).login, undefined);
  assert.throws(() => parseArgs(['--job', '08', '--login', '--headless']), /visible browser/);
  assert.throws(() => parseArgs([]), /Choose/);
  assert.throws(() => parseArgs(['--job', '01', '--all']), /Choose/);
  assert.throws(() => parseArgs(['--job', '--all']), /requires a value/);
  assert.throws(() => parseArgs(['--wat']), /Unknown/);
  assert.deepEqual(parseArgs(['--smoke', '--headless']), { smoke: true, headless: true });
});
