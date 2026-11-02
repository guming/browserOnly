import { jest } from '@jest/globals';
import { createMockPage, mockChromeAPIs, mockPageContextManager } from '../../../mocks/playwright';
import { 
  mockClickInteractions,
  mockFormInteractions,
  mockDialogScenarios,
  mockErrorScenarios
} from '../../../fixtures/toolTestData';

// Mock dependencies before importing the tools
jest.mock('../../../../src/agent/PageContextManager', () => mockPageContextManager);

// Mock Chrome APIs
global.chrome = mockChromeAPIs as any;

// Mock the utils module
jest.mock('../../../../src/agent/tools/utils', () => ({
  withActivePage: jest.fn().mockImplementation((page, fn) => fn(page)),
  installDialogListener: jest.fn(),
  lastDialog: null,
  resetDialog: jest.fn(),
}));

// Import the tools after mocking dependencies
import {
  browserClick,
  browserType,
  browserHandleDialog
} from '../../../../src/agent/tools/interactionTools';

describe('Interaction Tools', () => {
  let mockPage: any;
  let utilsMock: any;

  beforeEach(() => {
    mockPage = createMockPage();
    utilsMock = require('../../../../src/agent/tools/utils');
    jest.clearAllMocks();
    
    // Reset dialog state
    utilsMock.lastDialog = null;
  });

  describe('browserClick', () => {
    let locator: any;
    beforeEach(() => {
      locator = { and: jest.fn().mockReturnThis(), count: jest.fn().mockResolvedValue(1), click: jest.fn().mockResolvedValue(undefined), evaluate: jest.fn().mockResolvedValue({ disabled: false, checked: true }), evaluateAll: jest.fn().mockResolvedValue([{ text: 'Choice' }]) };
      mockPage.locator = jest.fn().mockReturnValue(locator);
      mockPage.getByText = jest.fn().mockReturnValue(locator);
      mockPage.getByRole = jest.fn().mockReturnValue(locator);
    });
    it('keeps legacy CSS and text inputs usable with unique visible targeting', async () => {
      expect(JSON.parse(await browserClick(mockPage).func('.cta-button')).ok).toBe(true);
      expect(mockPage.locator).toHaveBeenCalledWith('.cta-button');
      expect(JSON.parse(await browserClick(mockPage).func('Get Started')).data.verified).toBe(false);
      expect(mockPage.getByText).toHaveBeenCalledWith('Get Started', { exact: true });
      expect(locator.click).toHaveBeenCalledTimes(2);
    });
    it('returns ambiguity and never clicks any matching target', async () => {
      locator.count.mockResolvedValue(20);
      const result = JSON.parse(await browserClick(mockPage).func('Choice'));
      expect(result.error.code).toBe('AMBIGUOUS_TARGET');
      expect(result.meta.totalCount).toBe(20);
      expect(locator.click).not.toHaveBeenCalled();
    });
    it('does not retry a click whose response is uncertain', async () => {
      locator.click.mockRejectedValue(new Error('Connection closed after click'));
      const result = JSON.parse(await browserClick(mockPage).func('Choice'));
      expect(result.data.dispatched).toBe(true);
      expect(result.error.repairable).toBe(false);
      expect(locator.click).toHaveBeenCalledTimes(1);
    });
    it('verifies a requested explicit state and rejects invalid conditions before clicking', async () => {
      const tool = browserClick(mockPage);
      expect(JSON.parse(await tool.func('{"text":"Choice","verify":{"state":"checked","expected":true}}')).data).toMatchObject({ verified: true, dispatched: false, alreadySatisfied: true });
      expect(JSON.parse(await tool.func('{"text":"Choice","verify":{"state":"checked","expected":"true"}}')).error.code).toBe('INVALID_ARGUMENT');
      expect(locator.click).not.toHaveBeenCalled();
    });
    it('reports unknown state without repeating the action', async () => {
      locator.evaluate.mockResolvedValue({ disabled: false, checked: null });
      const result = JSON.parse(await browserClick(mockPage).func('{"text":"Choice","verify":{"state":"checked","expected":true,"timeoutMs":0}}'));
      expect(result.error.code).toBe('VERIFICATION_UNKNOWN');
      expect(result.error.repairable).toBe(false);
      expect(locator.click).toHaveBeenCalledTimes(1);
    });
  });

  describe('browserType', () => {
    it('should type text into specified selector', async () => {
      const tool = browserType(mockPage);
      mockPage.fill.mockResolvedValue(undefined);

      const result = await tool.func('input[name="name"]|John Doe');

      expect(result).toBe('Typed "John Doe" into input[name="name"]');
      expect(mockPage.fill).toHaveBeenCalledWith('input[name="name"]', 'John Doe');
    });

    it('should handle complex text with special characters', async () => {
      const tool = browserType(mockPage);
      mockPage.fill.mockResolvedValue(undefined);

      const complexText = 'Hello! @#$%^&*()_+ World\nNew Line';
      const result = await tool.func(`textarea[name="message"]|${complexText}`);

      expect(result).toBe(`Typed "${complexText}" into textarea[name="message"]`);
      expect(mockPage.fill).toHaveBeenCalledWith('textarea[name="message"]', complexText);
    });

    it('should handle email input correctly', async () => {
      const tool = browserType(mockPage);
      mockPage.fill.mockResolvedValue(undefined);

      const result = await tool.func('input[type="email"]|john@example.com');

      expect(result).toBe('Typed "john@example.com" into input[type="email"]');
      expect(mockPage.fill).toHaveBeenCalledWith('input[type="email"]', 'john@example.com');
    });

    it('should return error for invalid input format', async () => {
      const tool = browserType(mockPage);

      const result = await tool.func('invalid-format');

      expect(result).toBe('Error: expected \'selector|text\'');
      expect(mockPage.fill).not.toHaveBeenCalled();
    });

    it('should return error for missing selector', async () => {
      const tool = browserType(mockPage);

      const result = await tool.func('|text only');

      expect(result).toBe('Error: expected \'selector|text\'');
      expect(mockPage.fill).not.toHaveBeenCalled();
    });

    it('should return error for missing text', async () => {
      const tool = browserType(mockPage);

      const result = await tool.func('input[name="test"]|');

      expect(result).toBe('Error: expected \'selector|text\'');
      expect(mockPage.fill).not.toHaveBeenCalled();
    });

    it('should handle typing errors gracefully', async () => {
      const tool = browserType(mockPage);
      mockPage.fill.mockRejectedValue(new Error('Element not found'));

      const result = await tool.func('input[name="nonexistent"]|test');

      expect(result).toContain('Error typing into \'input[name="nonexistent"]|test\'');
      expect(result).toContain('Element not found');
    });

    it('should work with withActivePage utility', async () => {
      const tool = browserType(mockPage);
      mockPage.fill.mockResolvedValue(undefined);

      await tool.func('input|test');

      expect(utilsMock.withActivePage).toHaveBeenCalledWith(mockPage, expect.any(Function));
    });
  });

  describe('browserHandleDialog', () => {
    let mockDialog: any;

    beforeEach(() => {
      mockDialog = {
        type: jest.fn(),
        accept: jest.fn().mockResolvedValue(undefined),
        dismiss: jest.fn().mockResolvedValue(undefined)
      };
    });

    it('should install dialog listener on creation', () => {
      browserHandleDialog(mockPage);

      expect(utilsMock.installDialogListener).toHaveBeenCalledWith(mockPage);
    });

    it('should accept alert dialog', async () => {
      const tool = browserHandleDialog(mockPage);
      utilsMock.lastDialog = mockDialog;
      mockDialog.type.mockReturnValue('alert');

      const result = await tool.func('accept');

      expect(result).toBe('Accepted alert dialog.');
      expect(mockDialog.accept).toHaveBeenCalledWith(undefined);
      expect(utilsMock.resetDialog).toHaveBeenCalled();
    });

    it('should dismiss confirm dialog', async () => {
      const tool = browserHandleDialog(mockPage);
      utilsMock.lastDialog = mockDialog;
      mockDialog.type.mockReturnValue('confirm');

      const result = await tool.func('dismiss');

      expect(result).toBe('Dismissed confirm dialog.');
      expect(mockDialog.dismiss).toHaveBeenCalled();
      expect(utilsMock.resetDialog).toHaveBeenCalled();
    });

    it('should accept prompt dialog with text', async () => {
      const tool = browserHandleDialog(mockPage);
      utilsMock.lastDialog = mockDialog;
      mockDialog.type.mockReturnValue('prompt');

      const result = await tool.func('accept|John Doe');

      expect(result).toBe('Accepted prompt dialog.');
      // The implementation converts text to lowercase, so we expect lowercase
      expect(mockDialog.accept).toHaveBeenCalledWith('john doe');
      expect(utilsMock.resetDialog).toHaveBeenCalled();
    });

    it('should accept prompt dialog without text', async () => {
      const tool = browserHandleDialog(mockPage);
      utilsMock.lastDialog = mockDialog;
      mockDialog.type.mockReturnValue('prompt');

      const result = await tool.func('accept');

      expect(result).toBe('Accepted prompt dialog.');
      expect(mockDialog.accept).toHaveBeenCalledWith(undefined);
      expect(utilsMock.resetDialog).toHaveBeenCalled();
    });

    it('should handle case-insensitive input', async () => {
      const tool = browserHandleDialog(mockPage);
      utilsMock.lastDialog = mockDialog;
      mockDialog.type.mockReturnValue('alert');

      const result = await tool.func('ACCEPT');

      expect(result).toBe('Accepted alert dialog.');
      expect(mockDialog.accept).toHaveBeenCalled();
    });

    it('should handle whitespace in input', async () => {
      const tool = browserHandleDialog(mockPage);
      utilsMock.lastDialog = mockDialog;
      mockDialog.type.mockReturnValue('confirm');

      const result = await tool.func('  dismiss  ');

      expect(result).toBe('Dismissed confirm dialog.');
      expect(mockDialog.dismiss).toHaveBeenCalled();
    });

    it('should return error when no dialog is open', async () => {
      const tool = browserHandleDialog(mockPage);
      utilsMock.lastDialog = null;

      const result = await tool.func('accept');

      expect(result).toBe('Error: no dialog is currently open or was detected.');
    });

    it('should return error for invalid action', async () => {
      const tool = browserHandleDialog(mockPage);
      utilsMock.lastDialog = mockDialog;

      const result = await tool.func('invalid');

      expect(result).toBe('Error: first part must be `accept` or `dismiss`.');
    });

    it('should handle dialog operation errors', async () => {
      const tool = browserHandleDialog(mockPage);
      utilsMock.lastDialog = mockDialog;
      mockDialog.accept.mockRejectedValue(new Error('Dialog operation failed'));

      const result = await tool.func('accept');

      expect(result).toContain('Error handling dialog: Dialog operation failed');
    });

    it('should handle prompt with complex text', async () => {
      const tool = browserHandleDialog(mockPage);
      utilsMock.lastDialog = mockDialog;
      mockDialog.type.mockReturnValue('prompt');

      const complexText = 'Hello World! @#$%^&*()';
      const result = await tool.func(`accept|${complexText}`);

      expect(result).toBe('Accepted prompt dialog.');
      // The implementation converts text to lowercase, so we expect lowercase
      expect(mockDialog.accept).toHaveBeenCalledWith('hello world! @#$%^&*()');
    });
  });

  describe('Tool Integration', () => {
    let target: any;
    beforeEach(() => {
      target = { and: jest.fn().mockReturnThis(), count: jest.fn().mockResolvedValue(1), click: jest.fn().mockResolvedValue(undefined), evaluate: jest.fn().mockResolvedValue({ disabled: false }) };
      mockPage.locator = jest.fn().mockReturnValue(target);
    });
    it('should handle multiple interactions in sequence', async () => {
      const clickTool = browserClick(mockPage);
      const typeTool = browserType(mockPage);
      
      mockPage.click.mockResolvedValue(undefined);
      mockPage.fill.mockResolvedValue(undefined);

      // Simulate clicking a field then typing into it
      const clickResult = await clickTool.func('input[name="username"]');
      const typeResult = await typeTool.func('input[name="username"]|testuser');

      expect(JSON.parse(clickResult).data.dispatched).toBe(true);
      expect(typeResult).toBe('Typed "testuser" into input[name="username"]');
    });

    it('should work with all withActivePage calls', async () => {
      const clickTool = browserClick(mockPage);
      const typeTool = browserType(mockPage);
      
      mockPage.click.mockResolvedValue(undefined);
      mockPage.fill.mockResolvedValue(undefined);

      await clickTool.func('.button');
      await typeTool.func('input|text');

      expect(utilsMock.withActivePage).toHaveBeenCalledTimes(2);
    });

    it('should handle errors consistently across tools', async () => {
      const clickTool = browserClick(mockPage);
      const typeTool = browserType(mockPage);
      
      target.click.mockRejectedValue(mockErrorScenarios.elementNotFound);
      mockPage.fill.mockRejectedValue(mockErrorScenarios.elementNotFound);

      const clickResult = await clickTool.func('.nonexistent');
      const typeResult = await typeTool.func('input|text');

      expect(JSON.parse(clickResult).error.code).toBe('ACTION_UNCERTAIN');
      expect(typeResult).toContain('Error typing into');
    });
  });
});
