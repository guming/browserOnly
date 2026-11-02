import { decodeToolResult } from '../../../src/agent/ToolResult';

it('decodes legacy errors and successes consistently', () => {
  expect(decodeToolResult('No nodes matched selector: .old').ok).toBe(false);
  expect(decodeToolResult('Unable to read page').ok).toBe(false);
  expect(decodeToolResult('Action cancelled by user.').error?.repairable).toBe(false);
  expect(decodeToolResult('Screenshot captured').ok).toBe(true);
  expect(decodeToolResult('{"type":"screenshotRef","id":"s1"}').data).toEqual({ type: 'screenshotRef', id: 's1' });
});
it('validates structured errors and preserves metadata', () => {
  expect(decodeToolResult('{"ok":"false"}').error?.code).toBe('PROTOCOL_ERROR');
  expect(decodeToolResult('{"ok":false}').ok).toBe(false);
  expect(decodeToolResult('{"ok":true,"data":[],"meta":{"truncated":true}}').meta?.truncated).toBe(true);
  expect(decodeToolResult('{"ok":false,"error":{"code":"NO_MATCH","message":"Missing","repairable":true}}').error?.code).toBe('NO_MATCH');
});
