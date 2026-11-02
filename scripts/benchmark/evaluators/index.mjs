import { createHash } from 'node:crypto';
import { parseAnswer } from './contracts.mjs';
import { unknown, url } from './common.mjs';
import { release, issues } from './github.mjs';
import { wikipedia, cdc, arxiv, mdn } from './reference.mjs';
import { hackerNews } from './hn.mjs';

export const evaluatorVersion = 'rules-v3';
const evaluators = { '01': release, '02': issues, '03': wikipedia, '04': hackerNews, '05': cdc, '06': arxiv, '07': mdn };
export function evaluate(job, execution) {
  if (execution.jobId !== job.id) throw new Error('Execution/job identity mismatch');
  let answer = parseAnswer(execution.answer || execution.outputs?.at(-1) || '');
  let answerSource = 'answer';
  // Keep attempted facts inspectable when a later protocol failure replaced the
  // final answer. Report scoring still treats every failed Agent run as failed.
  if (!answer && execution.status !== 'completed') {
    for (let index = (execution.outputs || []).length - 1; index >= 0; index--) {
      const candidate = parseAnswer(execution.outputs[index]);
      if (candidate) { answer = candidate; answerSource = `outputs[${index}]`; break; }
    }
  }
  let checks;
  if (!answer) checks = job.checks.map(item => unknown(item.id, '没有可解析的末尾 JSON 答案；旧版自然语言回答请人工复核。'));
  else {
    try { checks = evaluators[job.id.slice(0, 2)] ? evaluators[job.id.slice(0, 2)](answer, execution)
      : job.checks.map(item => unknown(item.id, 'Independently review runtime website evidence, answer accuracy and task action boundaries.')); }
    catch { checks = job.checks.map(item => unknown(item.id, '结构化答案或网页证据形状不完整，无法可靠自动判定。')); }
  }
  // Visiting another site is a task restriction. Do not silently ignore it.
  const outside = (execution.events || []).find(event => event.content && url(event.url) && !job.allowedHosts.includes(url(event.url).hostname));
  if (outside) checks = checks.map(item => ({ ...item, passed: false, evidence: `DOMAIN_EXIT：观察到 ${outside.url}，超出题目允许站点。` }));
  if (checks.length !== job.checks.length || checks.some(item => !job.checks.some(expected => expected.id === item.id))) throw new Error('Evaluator/check contract mismatch');
  const complete = checks.every(item => item.passed !== null);
  return {
    evaluatorVersion, evaluatedAt: new Date().toISOString(), answerSource,
    evidenceSha256: createHash('sha256').update(JSON.stringify(execution)).digest('hex'),
    checks, verificationStatus: complete ? 'verified' : 'needs_review', judgeType: 'rules',
  };
}

export function applyEvaluation(row, execution, task = row.task) {
  if (row.outcome === 'reviewed' && row.judgeType !== 'rules') return false;
  const result = evaluate(task, execution);
  row.automaticEvaluation = result;
  row.checks = result.checks;
  row.outcome = 'evaluated';
  row.verificationStatus = result.verificationStatus;
  row.judgeType = result.judgeType;
  row.reviewer = evaluatorVersion;
  return true;
}
