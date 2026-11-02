export function summarizeSteps(steps) {
  if (!Array.isArray(steps)) return null;
  return { count: steps.length, succeeded: steps.filter(step => step.status === 'succeeded').length,
    failed: steps.filter(step => step.status === 'failed').length,
    unfinished: steps.filter(step => !['succeeded', 'failed'].includes(step.status)).length,
    toolDurationMs: steps.reduce((total, step) => total + (Number.isFinite(step.durationMs) ? step.durationMs : 0), 0) };
}
const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
export function stepsCsv(steps = []) {
  const fields = ['sequence', 'executionId', 'toolName', 'startedAt', 'endedAt', 'durationMs', 'status', 'errorCode'];
  return [fields.join(','), ...steps.map(step => fields.map(key => cell(step[key])).join(','))].join('\n') + '\n';
}
export function stepsMarkdown(steps = []) {
  return ['# 工具执行步骤', '', '| Step | 工具 | 耗时(ms) | 状态 | 错误 |', '|---:|---|---:|---|---|',
    ...steps.map(step => `| ${step.sequence} | ${step.toolName} | ${step.durationMs === undefined ? '未知' : step.durationMs.toFixed(1)} | ${step.status} | ${step.errorCode || ''} |`)].join('\n') + '\n';
}
