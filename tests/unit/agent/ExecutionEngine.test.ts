import { ExecutionEngine, ExecutionCallbacks } from '../../../src/agent/ExecutionEngine';
import { createMockProvider } from '../../mocks/providers';
import { createMockPage } from '../../mocks/playwright';
import { ToolManager } from '../../../src/agent/ToolManager';
import { PromptManager } from '../../../src/agent/PromptManager';
import { MemoryManager } from '../../../src/agent/MemoryManager';
import { ErrorHandler } from '../../../src/agent/ErrorHandler';
import { BrowserTool } from '../../../src/agent/tools/types';

// Mock dependencies
jest.mock('../../../src/tracking/tokenTrackingService', () => ({
  TokenTrackingService: {
    getInstance: jest.fn().mockReturnValue({
      trackInputTokens: jest.fn(),
      trackOutputTokens: jest.fn(),
    }),
  },
}));

jest.mock('../../../src/agent/approvalManager', () => ({
  requestApproval: jest.fn().mockResolvedValue(true),
}));

describe('ExecutionEngine', () => {
  let executionEngine: ExecutionEngine;
  let mockProvider: any;
  let mockPage: any;
  let toolManager: ToolManager;
  let promptManager: PromptManager;
  let memoryManager: MemoryManager;
  let errorHandler: ErrorHandler;
  let mockTools: BrowserTool[];
  let mockToolFunctions: jest.MockedFunction<any>[];

  beforeEach(() => {
    mockProvider = createMockProvider();
    mockPage = createMockPage();
    
    // Create mock tool functions
    mockToolFunctions = [
      jest.fn().mockResolvedValue('Screenshot taken successfully'),
      jest.fn().mockResolvedValue('Navigation completed'),
      jest.fn().mockResolvedValue('Element clicked'),
    ];
    
    // Create mock tools with proper Jest mocks
    mockTools = [
      {
        name: 'browser_screenshot',
        description: 'Take a screenshot of the current page',
        func: mockToolFunctions[0],
      },
      {
        name: 'browser_navigate',
        description: 'Navigate to a URL',
        func: mockToolFunctions[1],
      },
      {
        name: 'browser_click',
        description: 'Click an element',
        func: mockToolFunctions[2],
      },
    ];

    // Initialize components
    toolManager = new ToolManager(mockPage, mockTools);
    promptManager = new PromptManager(mockTools);
    memoryManager = new MemoryManager(mockTools);
    errorHandler = new ErrorHandler();

    executionEngine = new ExecutionEngine(
      mockProvider,
      toolManager,
      promptManager,
      memoryManager,
      errorHandler
    );

    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with all required components', () => {
      expect(executionEngine).toBeInstanceOf(ExecutionEngine);
    });
  });

  describe('executePrompt', () => {
    let mockCallbacks: ExecutionCallbacks;

    beforeEach(() => {
      mockCallbacks = {
        onLlmChunk: jest.fn(),
        onLlmOutput: jest.fn(),
        onToolOutput: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onToolStart: jest.fn(),
        onToolEnd: jest.fn(),
        onSegmentComplete: jest.fn(),
        onFallbackStarted: jest.fn(),
      };
    });

    it('scopes goal-run approvals to the owner tab even when another tab is active', async () => {
      mockCallbacks.executionContext = { runId: 'run-1', workflowId: 'w1', tabId: 2, ownerTabId: 1, windowId: 3 };
      mockCallbacks.onExecutionEnd = jest.fn();
      mockProvider.createMessage.mockReturnValueOnce((async function* () {
        yield { type: 'text', text: '<tool>browser_click</tool><input>button</input><requires_approval>true</requires_approval>' };
      })()).mockReturnValueOnce((async function* () { yield { type: 'text', text: '<finish status="completed">Done</finish>' }; })());
      (global as any).chrome.tabs.query.mockResolvedValue([{ id: 999 }]);
      await executionEngine.executePrompt('Submit', mockCallbacks, [], false, 'operator');
      expect(jest.requireMock('../../../src/agent/approvalManager').requestApproval).toHaveBeenCalledWith(2, 'browser_click', 'button', expect.any(String), 3, { runId: 'run-1', workflowId: 'w1', executionTabId: 2, ownerTabId: 1 });
      expect(mockCallbacks.onExecutionEnd).toHaveBeenCalledWith('completed', undefined);
    });

    it('reports non-retryable provider failures as failed outcomes', async () => {
      mockCallbacks.onExecutionEnd = jest.fn();
      mockProvider.createMessage.mockReturnValue((async function* () { throw new Error('Provider unavailable'); yield; })());
      await executionEngine.executePrompt('Research', mockCallbacks, [], false, 'operator');
      expect(mockCallbacks.onExecutionEnd).toHaveBeenCalledWith('failed', 'Provider unavailable');
    });

    const streamText = (text: string) => (async function* () { yield { type: 'text', text }; })();
    const invocation = (name: string, input = '{}') => `<tool>${name}</tool><input>${input}</input><requires_approval>false</requires_approval>`;

    it('executes link extraction regardless of request wording', async () => {
      const extract = jest.fn().mockResolvedValue('{"ok":true,"data":[]}');
      toolManager.addTools([{ name: 'browser_extract_links', description: '', func: extract }]);
      mockProvider.createMessage
        .mockImplementationOnce(() => streamText(invocation('browser_extract_links', 'all')))
        .mockImplementationOnce(() => streamText('<finish status="completed">Links checked.</finish>'));
      mockCallbacks.onExecutionOutcome = jest.fn();
      await executionEngine.executePrompt('把这些整理一下', mockCallbacks, [], false, 'operator');
      expect(extract).toHaveBeenCalledTimes(1);
      expect(mockCallbacks.onExecutionOutcome).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    });

    it.each([
      ['blocked', 'I cannot execute browser_click because requires_approval was denied.'],
      ['completed', 'The last instruction was: Now let me click the search button. It has been verified.'],
    ])('accepts a valid %s finish even when its summary mentions protocol or action words', async (status, message) => {
      mockCallbacks.onExecutionOutcome = jest.fn();
      mockProvider.createMessage.mockImplementation(() => streamText(`<finish status="${status}">${message}</finish>`));
      await executionEngine.executePrompt('Read', mockCallbacks, [], false, 'operator');
      expect(mockProvider.createMessage).toHaveBeenCalledTimes(1);
      expect(mockCallbacks.onExecutionOutcome).toHaveBeenCalledWith(expect.objectContaining({ status, message }));
    });

    it('keeps completed actions and history across fresh rate-limit errors', async () => {
      jest.spyOn(errorHandler, 'calculateBackoffTime').mockReturnValue(0);
      let calls = 0;
      mockProvider.createMessage.mockImplementation((_system: string, messages: any[]) => {
        calls++;
        if (calls === 1) return streamText(invocation('browser_screenshot'));
        expect(messages.some(message => String(message.content).includes('Screenshot taken successfully'))).toBe(true);
        if (calls < 4) { const error = new Error('Rate limit exceeded'); (error as any).error = { type: 'rate_limit_error', message: error.message }; throw error; }
        return streamText('<finish status="completed">Verified.</finish>');
      });
      await executionEngine.executePrompt('Read', mockCallbacks, [], false, 'operator');
      expect(mockToolFunctions[0]).toHaveBeenCalledTimes(1);
      expect(mockProvider.createMessage).toHaveBeenCalledTimes(4);
    });

    it('caps fresh provider errors without recursive restarts', async () => {
      jest.spyOn(errorHandler, 'calculateBackoffTime').mockReturnValue(0);
      mockCallbacks.onExecutionEnd = jest.fn();
      mockProvider.createMessage.mockImplementation(() => { const error = new Error('Rate limit exceeded'); (error as any).error = { type: 'rate_limit_error', message: error.message }; throw error; });
      await executionEngine.executePrompt('Read', mockCallbacks, [], false, 'operator');
      expect(mockProvider.createMessage).toHaveBeenCalledTimes(6);
      expect(mockCallbacks.onExecutionEnd).toHaveBeenCalledWith('failed', 'Rate limit exceeded');
    });

    it.each([false, true])('hides chunked finish markup from presentation in streaming=%s', async isStreaming => {
      mockProvider.createMessage.mockImplementation(() => (async function* () {
        for (const text of ['<fi', 'nish status="completed">', 'Verified.', '</finish>']) yield { type: 'text', text };
      })());
      await executionEngine.executePrompt('Read', mockCallbacks, [], isStreaming, 'operator');
      expect(mockCallbacks.onLlmOutput).toHaveBeenCalledWith('Verified.');
      expect((mockCallbacks.onLlmOutput as jest.Mock).mock.calls.flat().join('')).not.toContain('<finish');
      expect((mockCallbacks.onLlmChunk as jest.Mock).mock.calls.flat().join('')).not.toContain('<fi');
    });

    it('anchors a new Operator request ahead of obsolete window tasks', async () => {
      const current = '解释当前 MountainCar 页面中的例子';
      const historical = [{ role: 'user', content: '在京东搜索肽敏舒并加入购物车' }, { role: 'assistant', content: 'Next: lookup_memories www.jd.com then add to cart' }, { role: 'user', content: current }];
      mockProvider.createMessage.mockImplementation((_system: string, messages: any[]) => {
        expect(messages[0]).toEqual({ role: 'user', content: current });
        expect(messages.filter(message => message.content === '在京东搜索肽敏舒并加入购物车')).toHaveLength(0);
        expect(messages).toEqual([{ role: 'user', content: current }]);
        expect(JSON.stringify(messages)).not.toContain('www.jd.com');
        expect(messages[messages.length - 1].content).toBe(current);
        return streamText('<finish status="completed">MountainCar explained.</finish>');
      });
      mockCallbacks.onExecutionOutcome = jest.fn();
      await executionEngine.executePrompt(current, mockCallbacks, historical, false, 'operator');
      expect(mockCallbacks.onExecutionOutcome).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
      expect(mockProvider.createMessage).toHaveBeenCalledTimes(1);
    });

    it('preserves the complete Markdown answer inside the status wrapper', async () => {
      const answer = '这是强化学习教材的首页。\n\n## 主要内容\n\n- 基础概念与方法。\n- 项目、练习与下载入口。\n\n| 类型 | 内容 |\n| --- | --- |\n| 教材 | 强化学习 |';
      mockProvider.createMessage.mockImplementation(() => streamText(`<finish status="completed">${answer}</finish>`));
      mockCallbacks.onExecutionOutcome = jest.fn();
      await executionEngine.executePrompt('总结当前页面', mockCallbacks, [], true, 'operator');
      expect(mockCallbacks.onLlmOutput).toHaveBeenCalledWith(answer);
      expect(mockCallbacks.onExecutionOutcome).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', message: answer }));
    });

    it('executes native calls without parsing selector text as XML and retains API history', async () => {
      mockProvider.toolCallFormat = 'native';
      const input = 'span[data-value="</input>"]';
      mockProvider.createMessage
        .mockImplementationOnce(() => (async function* () {
          yield { type: 'text', text: '<tool>browser_read_text_enhanced</tool>' };
          yield { type: 'tool_call', toolCall: { id: 'native-one', name: 'browser_screenshot', input, requiresApproval: false } };
          yield { type: 'usage', inputTokens: 10, outputTokens: 3 };
        })())
        .mockImplementationOnce((_system: string, messages: any[]) => {
          expect(messages[messages.length - 2].tool_calls[0]).toMatchObject({ id: 'native-one', function: { name: 'browser_screenshot', arguments: JSON.stringify({ input, requires_approval: false }) } });
          expect(messages[messages.length - 1]).toMatchObject({ role: 'tool', tool_call_id: 'native-one' });
          return streamText('<finish status="completed">Screenshot verified.</finish>');
        });
      mockCallbacks.onExecutionOutcome = jest.fn();
      await executionEngine.executePrompt('Read', mockCallbacks, [], false, 'operator');
      expect(mockToolFunctions[0]).toHaveBeenCalledWith(input, undefined);
      expect(mockProvider.createMessage).toHaveBeenCalledTimes(2);
      expect(mockCallbacks.onExecutionOutcome).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
      expect((mockCallbacks.onToolOutput as jest.Mock).mock.calls.flat().join('')).not.toContain('Incomplete tool call');
    });

    it('never executes hand-written XML on a native-only provider', async () => {
      mockProvider.toolCallFormat = 'native';
      mockProvider.createMessage.mockImplementationOnce(() => streamText(invocation('browser_screenshot')))
        .mockImplementationOnce((_system: string, messages: any[]) => {
          expect(messages[messages.length - 1].content).toContain('native function');
          return streamText('<finish status="blocked">Tool protocol unavailable.</finish>');
        });
      await executionEngine.executePrompt('Read', mockCallbacks, [], false, 'operator');
      expect(mockToolFunctions[0]).not.toHaveBeenCalled();
    });

    it('does not let a second task reset a running execution', async () => {
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      mockProvider.createMessage.mockImplementation(() => (async function* () {
        await gate; yield { type: 'text', text: '<finish status="completed">First finished.</finish>' };
      })());
      const first = executionEngine.executePrompt('First', mockCallbacks, [], false, 'operator');
      const second = { ...mockCallbacks, onExecutionOutcome: jest.fn(), onComplete: jest.fn() };
      await executionEngine.executePrompt('Second', second, [], false, 'operator');
      expect(second.onExecutionOutcome).toHaveBeenCalledWith(expect.objectContaining({ reason: 'EXECUTION_BUSY', status: 'blocked' }));
      expect(mockProvider.createMessage).toHaveBeenCalledTimes(1);
      release(); await first;
    });

    it('passes streamed reasoning back on native tool turns and preserves it through rate-limit retries', async () => {
      mockProvider.toolCallFormat = 'native';
      jest.spyOn(errorHandler, 'calculateBackoffTime').mockReturnValue(0);
      const reasoning = 'fixture-part-one\nfixture-part-two';
      mockProvider.createMessage
        .mockImplementationOnce(() => (async function* () {
          yield { type: 'reasoning', reasoning: 'fixture-part-one\n' };
          yield { type: 'reasoning', reasoning: 'fixture-part-two' };
          yield { type: 'tool_call', toolCall: { id: 'thinking-call', name: 'browser_screenshot', input: '{}', requiresApproval: false } };
        })())
        .mockImplementationOnce((_system: string, messages: any[]) => {
          expect(messages[messages.length - 2].reasoning_content).toBe(reasoning);
          const error = new Error('Rate limited'); (error as any).status = 429; throw error;
        })
        .mockImplementationOnce((_system: string, messages: any[]) => {
          expect(messages[messages.length - 2].reasoning_content).toBe(reasoning);
          return streamText('<finish status="completed">Verified.</finish>');
        });
      mockCallbacks.onExecutionOutcome = jest.fn();
      await executionEngine.executePrompt('Read', mockCallbacks, [], true, 'operator');
      expect(mockProvider.createMessage).toHaveBeenCalledTimes(3);
      expect(mockToolFunctions[0]).toHaveBeenCalledTimes(1);
      expect(mockCallbacks.onExecutionOutcome).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
      expect((mockCallbacks.onLlmOutput as jest.Mock).mock.calls.flat().join('')).not.toContain(reasoning);
      expect((mockCallbacks.onLlmChunk as jest.Mock).mock.calls.flat().join('')).not.toContain(reasoning);
    });

    it('does not retry a provider 400 as a streaming fallback', async () => {
      mockCallbacks.onExecutionEnd = jest.fn();
      mockProvider.createMessage.mockImplementation(() => { const error = new Error('400 Invalid request'); (error as any).status = 400; throw error; });
      await executionEngine.executePrompt('Read', mockCallbacks, [], true, 'operator');
      expect(mockProvider.createMessage).toHaveBeenCalledTimes(1);
      expect(mockCallbacks.onFallbackStarted).not.toHaveBeenCalled();
      expect(mockCallbacks.onExecutionEnd).toHaveBeenCalledWith('failed', '400 Invalid request');
    });

    it('reflects only the captured task with no browser tools and waits for memory processing', async () => {
      const prompt = 'Summarize completed read steps as JSON';
      mockProvider.createMessage.mockImplementation((system: string, messages: any[], tools: any[]) => {
        expect(system).toContain('Do not execute browser tools');
        expect(tools).toEqual([]);
        expect(messages).toEqual([{ role: 'user', content: prompt }]);
        return streamText('{"taskDescription":"Summarize a repository"}');
      });
      let saved = false;
      mockCallbacks.onLlmOutput = jest.fn(async () => { await Promise.resolve(); saved = true; });
      mockCallbacks.onComplete = jest.fn(() => { expect(saved).toBe(true); });
      await executionEngine.executePrompt(prompt, mockCallbacks, [{ role: 'user', content: 'Old JD task' }], false, 'reflection');
      expect(mockProvider.createMessage).toHaveBeenCalledTimes(1);
      expect(mockCallbacks.onComplete).toHaveBeenCalledTimes(1);
      expect(mockToolFunctions[0]).not.toHaveBeenCalled();
    });

    it('never executes an unexpected native tool event during reflection', async () => {
      mockProvider.toolCallFormat = 'native';
      mockProvider.createMessage.mockImplementation(() => (async function* () {
        yield { type: 'tool_call', toolCall: { id: 'bad', name: 'browser_click', input: 'Buy', requiresApproval: false } };
      })());
      mockCallbacks.onExecutionEnd = jest.fn();
      await executionEngine.executePrompt('Reflect', mockCallbacks, [], false, 'reflection');
      expect(mockToolFunctions[2]).not.toHaveBeenCalled();
      expect(mockCallbacks.onExecutionEnd).toHaveBeenCalledWith('failed', 'Reflection cannot execute tools');
    });

    it('maps blocked to failed and never reports a completed candidate', async () => {
      mockCallbacks.onExecutionEnd = jest.fn();
      mockCallbacks.onExecutionOutcome = jest.fn();
      mockProvider.createMessage.mockImplementation(() => streamText('<finish status="blocked">Page unavailable.</finish>'));
      await executionEngine.executePrompt('Read page', mockCallbacks, [], false, 'operator');
      expect(mockCallbacks.onExecutionOutcome).toHaveBeenCalledWith(expect.objectContaining({ status: 'blocked', reason: 'MODEL_BLOCKED' }));
      expect(mockCallbacks.onExecutionEnd).toHaveBeenCalledWith('failed', 'Page unavailable.');
    });

    it('requires an operator finish declaration once, while experts retain ordinary prose', async () => {
      mockCallbacks.onExecutionOutcome = jest.fn();
      mockProvider.createMessage.mockImplementation(() => streamText('I stopped.'));
      await executionEngine.executePrompt('Read page', mockCallbacks, [], false, 'operator');
      expect(mockProvider.createMessage).toHaveBeenCalledTimes(2);
      expect(mockCallbacks.onExecutionOutcome).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'PROTOCOL_ERROR', status: 'failed' }));
      mockProvider.createMessage.mockClear();
      await executionEngine.executePrompt('Explain', mockCallbacks, [], false, 'books');
      expect(mockProvider.createMessage).toHaveBeenCalledTimes(1);
      expect(mockCallbacks.onExecutionOutcome).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed' }));
    });

    it('bounds repeated protocol errors and repeated tool failures', async () => {
      mockCallbacks.onExecutionOutcome = jest.fn();
      mockProvider.createMessage.mockImplementation(() => streamText('<tool>browser_query</tool>'));
      await executionEngine.executePrompt('Read', mockCallbacks, [], false, 'operator');
      expect(mockProvider.createMessage).toHaveBeenCalledTimes(4);
      expect(mockCallbacks.onExecutionOutcome).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'PROTOCOL_REPAIR_LIMIT' }));
      mockProvider.createMessage.mockClear();
      mockToolFunctions[0].mockResolvedValue('No nodes matched selector');
      mockProvider.createMessage.mockImplementation(() => streamText(invocation('browser_screenshot')));
      await executionEngine.executePrompt('Read', mockCallbacks, [], false, 'operator');
      expect(mockToolFunctions[0]).toHaveBeenCalledTimes(2);
      expect(mockCallbacks.onExecutionOutcome).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'REPEATED_FAILURE' }));
    });

    it('allows a summary after call 50 but stops a 51st tool call', async () => {
      mockCallbacks.onExecutionOutcome = jest.fn();
      let request = 0;
      mockProvider.createMessage.mockImplementation(() => streamText(++request <= 50 ? invocation('browser_screenshot') : '<finish status="completed">Verified.</finish>'));
      await executionEngine.executePrompt('Read', mockCallbacks, [], false, 'operator');
      expect(mockToolFunctions[0]).toHaveBeenCalledTimes(50);
      expect(mockCallbacks.onExecutionOutcome).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed' }));
      mockToolFunctions[0].mockClear();
      mockProvider.createMessage.mockImplementation(() => streamText(invocation('browser_screenshot')));
      await executionEngine.executePrompt('Read', mockCallbacks, [], false, 'operator');
      expect(mockToolFunctions[0]).toHaveBeenCalledTimes(50);
      expect(mockCallbacks.onExecutionOutcome).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'TOOL_BUDGET' }));
    });

    it('should execute a simple prompt without tools', async () => {
      // Mock provider to return simple text response
      const mockStream = (async function* () {
        yield { type: 'text', text: 'Hello, this is a simple response.' };
        yield { type: 'usage', inputTokens: 10, outputTokens: 8 };
      })();
      mockProvider.createMessage.mockReturnValue(mockStream);

      await executionEngine.executePrompt('Hello', mockCallbacks, [], false);

      expect(mockCallbacks.onLlmOutput).toHaveBeenCalledWith('Hello, this is a simple response.');
      expect(mockCallbacks.onComplete).toHaveBeenCalled();
    });

    it('should handle tool calls in the response', async () => {
      // Mock provider to return response with tool call
      const mockStream = (async function* () {
        yield { type: 'text', text: 'I\'ll take a screenshot for you.\n\n<tool>browser_screenshot</tool>\n<input>{}</input>\n<requires_approval>false</requires_approval>' };
        yield { type: 'usage', inputTokens: 15, outputTokens: 25 };
      })();
      mockProvider.createMessage.mockReturnValue(mockStream);

      await executionEngine.executePrompt('Take a screenshot', mockCallbacks, [], false);

      expect(mockCallbacks.onToolOutput).toHaveBeenCalledWith('🕹️ tool: browser_screenshot | args: {}');
      // The tool function is called with input and undefined context for non-approval tools
      expect(mockToolFunctions[0]).toHaveBeenCalledWith('{}', undefined);
      expect(mockCallbacks.onComplete).toHaveBeenCalled();
    });

    it('should execute tool calls containing a leaked DSML closing token', async () => {
      const mockStream = (async function* () {
        yield { type: 'text', text: '<tool>browser_screenshot</｜｜DS' };
        yield { type: 'text', text: 'ML｜｜ parameter>\n<input>{}</input>\n<requires_approval>false</requires_approval>\n</invoke>' };
      })();
      mockProvider.createMessage.mockReturnValue(mockStream);

      await executionEngine.executePrompt('Take a screenshot', mockCallbacks, [], false, 'operator');

      expect(mockToolFunctions[0]).toHaveBeenCalledWith('{}', undefined);
      expect(mockCallbacks.onToolOutput).toHaveBeenCalledWith('🕹️ tool: browser_screenshot | args: {}');
      expect(mockCallbacks.onLlmOutput).toHaveBeenCalledWith(expect.stringContaining('</tool>'));
      expect(mockCallbacks.onComplete).toHaveBeenCalled();
    });

    it('should retry malformed Markdown-escaped tool intent instead of completing', async () => {
      mockProvider.createMessage
        .mockImplementationOnce(() => (async function* () {
          yield { type: 'text', text: 'Continuing.\\<tool>browser\\_screenshot\\</input>\n\\<input>{}\\</input>\n\\<requires\\_approval>false\\</requires\\_approval>' };
        })())
        .mockImplementationOnce(() => (async function* () {
          yield { type: 'text', text: '<tool>browser_screenshot</tool>\n<input>{}</input>\n<requires_approval>false</requires_approval>' };
        })())
        .mockImplementationOnce(() => (async function* () {
          yield { type: 'text', text: '<finish status="completed">The screenshot was captured and the task is complete.</finish>' };
        })());

      await executionEngine.executePrompt('Take a screenshot', mockCallbacks, [], false, 'operator');

      expect(mockProvider.createMessage).toHaveBeenCalledTimes(3);
      expect(mockToolFunctions[0]).toHaveBeenCalledWith('{}', undefined);
      expect(mockCallbacks.onComplete).toHaveBeenCalledTimes(1);
    });

    it('repairs provider tool-argument parse failures instead of reporting success', async () => {
      mockCallbacks.onExecutionEnd = jest.fn();
      mockProvider.createMessage
        .mockImplementationOnce(() => (async function* () {
          yield { type: 'text', text: 'Error: Failed to parse tool call. Please try again.' };
        })())
        .mockImplementationOnce((_system: string, messages: any[]) => {
          expect(messages[messages.length - 1].content).toContain('valid JSON');
          return (async function* () {
            yield { type: 'text', text: '<tool>browser_screenshot</tool><input>{}</input><requires_approval>false</requires_approval>' };
          })();
        })
        .mockImplementationOnce(() => (async function* () {
          yield { type: 'text', text: '<finish status="completed">Screenshot captured.</finish>' };
        })());

      await executionEngine.executePrompt('Take a screenshot', mockCallbacks, [], false, 'operator');

      expect(mockProvider.createMessage).toHaveBeenCalledTimes(3);
      expect(mockToolFunctions[0]).toHaveBeenCalledTimes(1);
      expect(mockCallbacks.onExecutionEnd).toHaveBeenCalledWith('completed', undefined);
    });

    it('should continue when the model emits action narration without its tool call', async () => {
      mockProvider.createMessage
        .mockImplementationOnce(() => (async function* () {
          yield { type: 'text', text: '- [x] Click the search box\nNow let me type the search term.' };
        })())
        .mockImplementationOnce(() => (async function* () {
          yield { type: 'text', text: '<tool>browser_screenshot</tool>\n<input>{}</input>\n<requires_approval>false</requires_approval>' };
        })())
        .mockImplementationOnce(() => (async function* () {
          yield { type: 'text', text: '<finish status="completed">The requested browser task is verified complete.</finish>' };
        })());

      await executionEngine.executePrompt('Continue the browser task', mockCallbacks, [], false, 'operator');

      expect(mockProvider.createMessage).toHaveBeenCalledTimes(3);
      expect(mockToolFunctions[0]).toHaveBeenCalledWith('{}', undefined);
      expect(mockCallbacks.onComplete).toHaveBeenCalledTimes(1);
    });

    it('should tell the model to repair a failed stale selector', async () => {
      mockToolFunctions[0].mockResolvedValueOnce('Error: No nodes matched selector: .old');
      mockProvider.createMessage
        .mockImplementationOnce(() => (async function* () {
          yield { type: 'text', text: '<tool>browser_screenshot</tool>\n<input>.old</input>\n<requires_approval>false</requires_approval>' };
        })())
        .mockImplementationOnce((systemPrompt: string, messages: any[]) => {
          expect(messages).toEqual(expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining('Re-observe the current page, adapt any stale memory or selector'),
            }),
          ]));
          return (async function* () {
            yield { type: 'text', text: 'Unable to continue without another observation.' };
          })();
        });

      await executionEngine.executePrompt('Take a screenshot', mockCallbacks, [], false, 'operator');

      expect(mockProvider.createMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle tool calls requiring approval', async () => {
      // Mock provider to return response with tool call requiring approval
      const mockStream = (async function* () {
        yield { type: 'text', text: 'I\'ll click the purchase button.\n\n<tool>browser_click</tool>\n<input>button[data-action="purchase"]</input>\n<requires_approval>true</requires_approval>' };
        yield { type: 'usage', inputTokens: 20, outputTokens: 30 };
      })();
      mockProvider.createMessage.mockReturnValue(mockStream);

      // Mock chrome.tabs.query
      (global as any).chrome.tabs.query.mockResolvedValue([{ id: 123 }]);

      await executionEngine.executePrompt('Click the purchase button', mockCallbacks, [], false);

      expect(mockCallbacks.onToolOutput).toHaveBeenCalledWith('🕹️ tool: browser_click | args: button[data-action="purchase"]');
      expect(mockCallbacks.onToolOutput).toHaveBeenCalledWith('⚠️ This action requires approval: The AI assistant has determined this action requires your approval.');
      expect(mockCallbacks.onToolOutput).toHaveBeenCalledWith('✅ Action approved by user. Executing...');
      expect(mockToolFunctions[2]).toHaveBeenCalledWith('button[data-action="purchase"]', {
        requiresApproval: true,
        approvalReason: 'The AI assistant has determined this action requires your approval.',
      });
    });

    it('should handle incomplete tool calls gracefully', async () => {
      // Mock provider to return incomplete tool call
      const mockStream = (async function* () {
        yield { type: 'text', text: 'I\'ll take a screenshot.\n\n<tool>browser_screenshot</tool>\n<input>{}</input>' };
        yield { type: 'usage', inputTokens: 15, outputTokens: 20 };
      })();
      mockProvider.createMessage.mockReturnValue(mockStream);

      await executionEngine.executePrompt('Take a screenshot', mockCallbacks, [], false);

      // The execution engine should continue and add a message about the incomplete tool call
      expect(mockCallbacks.onLlmOutput).toHaveBeenCalled();
      expect(mockCallbacks.onComplete).toHaveBeenCalled();
    });

    it('should handle unknown tools gracefully', async () => {
      // Mock provider to return response with unknown tool
      const mockStream = (async function* () {
        yield { type: 'text', text: 'I\'ll use an unknown tool.\n\n<tool>unknown_tool</tool>\n<input>test</input>\n<requires_approval>false</requires_approval>' };
        yield { type: 'usage', inputTokens: 15, outputTokens: 20 };
      })();
      mockProvider.createMessage.mockReturnValue(mockStream);

      await executionEngine.executePrompt('Use unknown tool', mockCallbacks, [], false);

      // Should continue execution and provide error message about unknown tool
      expect(mockCallbacks.onLlmOutput).toHaveBeenCalled();
      expect(mockCallbacks.onComplete).toHaveBeenCalled();
    });

    it('should handle execution cancellation', async () => {
      // Mock provider to return a long response
      const mockStream = (async function* () {
        yield { type: 'text', text: 'Starting long operation...' };
        // Simulate cancellation during execution
        errorHandler.cancel();
        yield { type: 'text', text: 'This should not be processed' };
      })();
      mockProvider.createMessage.mockReturnValue(mockStream);

      await executionEngine.executePrompt('Long operation', mockCallbacks, [], false);

      expect(mockCallbacks.onLlmOutput).toHaveBeenCalledWith(expect.stringContaining('Execution cancelled by user'));
    });

    it('should handle streaming mode', async () => {
      const mockStream = (async function* () {
        yield { type: 'text', text: 'Hello' };
        yield { type: 'text', text: ' world' };
        yield { type: 'text', text: '!' };
        yield { type: 'usage', inputTokens: 5, outputTokens: 3 };
      })();
      mockProvider.createMessage.mockReturnValue(mockStream);

      await executionEngine.executePrompt('Hello', mockCallbacks, [], true);

      expect(mockCallbacks.onLlmChunk).toHaveBeenCalledWith('Hello');
      expect(mockCallbacks.onLlmChunk).toHaveBeenCalledWith(' world');
      expect(mockCallbacks.onLlmChunk).toHaveBeenCalledWith('!');
      expect(mockCallbacks.onComplete).toHaveBeenCalled();
    });

    it('should handle initial messages correctly', async () => {
      const mockStream = (async function* () {
        yield { type: 'text', text: 'Continuing conversation...' };
        yield { type: 'usage', inputTokens: 20, outputTokens: 5 };
      })();
      mockProvider.createMessage.mockReturnValue(mockStream);

      const initialMessages = [
        { role: 'user', content: 'Previous message' },
        { role: 'assistant', content: 'Previous response' },
      ];

      await executionEngine.executePrompt('Continue', mockCallbacks, initialMessages, false);

      expect(mockProvider.createMessage).toHaveBeenCalledWith(
        expect.any(String), // system prompt
        expect.arrayContaining([
          { role: 'user', content: 'Previous message' },
          { role: 'assistant', content: 'Previous response' },
          { role: 'user', content: 'Continue' },
        ]),
        expect.any(Array) // tools
      );
    });
  });

  describe('executePromptWithFallback', () => {
    let mockCallbacks: ExecutionCallbacks;

    beforeEach(() => {
      mockCallbacks = {
        onLlmChunk: jest.fn(),
        onLlmOutput: jest.fn(),
        onToolOutput: jest.fn(),
        onComplete: jest.fn(),
        onError: jest.fn(),
        onToolStart: jest.fn(),
        onToolEnd: jest.fn(),
        onSegmentComplete: jest.fn(),
        onFallbackStarted: jest.fn(),
      };

      // Mock ErrorHandler methods
      jest.spyOn(errorHandler, 'isStreamingSupported').mockResolvedValue(true);
      jest.spyOn(errorHandler, 'isRetryableError').mockReturnValue(false);
    });

    it('should execute normally when no errors occur', async () => {
      const mockStream = (async function* () {
        yield { type: 'text', text: 'Normal execution' };
        yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
      })();
      mockProvider.createMessage.mockReturnValue(mockStream);

      await executionEngine.executePromptWithFallback('Test', mockCallbacks);

      expect(mockCallbacks.onLlmOutput).toHaveBeenCalledWith('Normal execution');
      expect(mockCallbacks.onComplete).toHaveBeenCalled();
      expect(mockCallbacks.onFallbackStarted).not.toHaveBeenCalled();
    });

    it('should trigger fallback on streaming errors', async () => {
      // First call fails, second call succeeds
      let callCount = 0;
      mockProvider.createMessage.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Streaming failed');
        }
        return (async function* () {
          yield { type: 'text', text: 'Fallback execution' };
          yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
        })();
      });

      await executionEngine.executePromptWithFallback('Test', mockCallbacks);

      expect(mockCallbacks.onFallbackStarted).toHaveBeenCalled();
      expect(mockCallbacks.onLlmOutput).toHaveBeenCalledWith('Fallback execution');
      expect(mockCallbacks.onComplete).toHaveBeenCalled();
    });

    it('should handle retryable errors with backoff', async () => {
      // Mock rate limit error
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;

      // Mock ErrorHandler to recognize this as retryable
      jest.spyOn(errorHandler, 'isRetryableError').mockReturnValue(true);
      jest.spyOn(errorHandler, 'calculateBackoffTime').mockReturnValue(100);

      let callCount = 0;
      mockProvider.createMessage.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw rateLimitError;
        }
        return (async function* () {
          yield { type: 'text', text: 'Retry successful' };
          yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
        })();
      });

      await executionEngine.executePromptWithFallback('Test', mockCallbacks);

      expect(mockCallbacks.onFallbackStarted).toHaveBeenCalled();
      expect(mockCallbacks.onLlmOutput).toHaveBeenCalledWith('Retry successful');
      expect(mockCallbacks.onComplete).toHaveBeenCalled();
    });
  });

  describe('HTML entity decoding', () => {
    it('should decode HTML entities in responses', async () => {
      const mockStream = (async function* () {
        yield { type: 'text', text: 'Response with \\u003chtml\\u003e entities' };
        yield { type: 'usage', inputTokens: 10, outputTokens: 8 };
      })();
      mockProvider.createMessage.mockReturnValue(mockStream);

      const mockCallbacks: ExecutionCallbacks = {
        onLlmOutput: jest.fn(),
        onToolOutput: jest.fn(),
        onComplete: jest.fn(),
      };

      await executionEngine.executePrompt('Test', mockCallbacks, [], false);

      expect(mockCallbacks.onLlmOutput).toHaveBeenCalledWith('Response with <html> entities');
    });
  });

  describe('Token tracking', () => {
    it('should track token usage correctly', async () => {
      const mockStream = (async function* () {
        yield { type: 'text', text: 'Response' };
        yield { type: 'usage', inputTokens: 15, outputTokens: 10, cacheReadTokens: 5 };
      })();
      mockProvider.createMessage.mockReturnValue(mockStream);

      const mockCallbacks: ExecutionCallbacks = {
        onLlmOutput: jest.fn(),
        onToolOutput: jest.fn(),
        onComplete: jest.fn(),
      };

      await executionEngine.executePrompt('Test', mockCallbacks, [], false);

      const { TokenTrackingService } = require('../../../src/tracking/tokenTrackingService');
      const tokenTracker = TokenTrackingService.getInstance();
      
      expect(tokenTracker.trackInputTokens).toHaveBeenCalledWith(15, { read: 5, write: undefined });
      expect(tokenTracker.trackOutputTokens).toHaveBeenCalledWith(10);
    });
  });
});
