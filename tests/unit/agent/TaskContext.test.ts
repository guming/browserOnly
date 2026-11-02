import { operatorTaskMessages } from '../../../src/agent/TaskContext';
import { trimHistory } from '../../../src/agent/TokenManager';
const history = [
  { role: 'user', content: '在京东搜索肽敏舒，加入购物车' },
  { role: 'assistant', content: 'lookup_memories www.jd.com; TODO shopping' },
  { role: 'user', content: '解释 MountainCar 例子' },
  { role: 'assistant', content: 'MountainCar has position and velocity states.' },
];
it('does not send old shopping instructions to a new reading task', () => {
  const prompt = '总结当前 EasyRL 页面';
  expect(operatorTaskMessages(prompt, history)).toEqual([{ role: 'user', content: prompt }]);
});
it('continues only the latest task when continuation is explicitly requested', () => {
  const messages = operatorTaskMessages('继续', history);
  expect(messages[0].content).toBe('继续');
  expect(JSON.stringify(messages)).toContain('MountainCar');
  expect(JSON.stringify(messages)).not.toContain('jd.com');
  expect(messages[1].content).toContain('REFERENCE HISTORY');
});
it('keeps the active request when a long in-run result triggers history trimming', () => {
  const prompt = '解释 MountainCar 例子';
  const messages = [...operatorTaskMessages(prompt, history), { role: 'user', content: 'Tool result: ' + 'x'.repeat(10000) }];
  const trimmed = trimHistory(messages as any, 1000);
  expect(trimmed[0].content).toBe(prompt);
  expect(JSON.stringify(trimmed)).not.toContain('jd.com');
});
