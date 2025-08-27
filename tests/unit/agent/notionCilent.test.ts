import { jest } from '@jest/globals';
import { NotionMCPClient, NotionMCPToolOptions } from '../../../src/agent/notionClient';

// Mock the MCP SDK modules
jest.unstable_mockModule('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn()
}));

jest.unstable_mockModule('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: jest.fn()
}));

// Import mocked modules
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');

const MockedClient = Client as jest.MockedClass<typeof Client>;
const MockedTransport = StreamableHTTPClientTransport as jest.MockedClass<typeof StreamableHTTPClientTransport>;

describe('NotionMCPClient', () => {
  let mockClient: {
    connect: jest.Mock;
    close: jest.Mock;
    request: jest.Mock;
  };
  let mockTransport: StreamableHTTPClientTransport;
  let notionClient: NotionMCPClient;
  let options: NotionMCPToolOptions;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock objects
    mockClient = {
      connect: jest.fn(),
      close: jest.fn(),
      request: jest.fn()
    };

    mockTransport = {} as StreamableHTTPClientTransport;

    // Mock the constructors
    MockedClient.mockImplementation(() => mockClient as any);
    MockedTransport.mockImplementation(() => mockTransport);

    options = {
      url: 'http://localhost:3000',
      bearToken: 'test-token',
      timeout: 5000
    };

    notionClient = new NotionMCPClient(options);
  });

  afterEach(async () => {
    if (notionClient.isConnected) {
      await notionClient.disconnect();
    }
  });

  describe('Constructor', () => {
    it('should create a NotionMCPClient instance with correct options', () => {
      expect(MockedClient).toHaveBeenCalledWith(
        {
          name: "notion-mcp-client",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );
      expect(MockedTransport).toHaveBeenCalledWith(new URL(options.url));
    });

    it('should initialize as disconnected', () => {
      expect(notionClient.isConnected).toBe(false);
    });
  });

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      mockClient.connect.mockResolvedValue(undefined);

      await notionClient.connect();

      expect(mockClient.connect).toHaveBeenCalledWith(mockTransport);
      expect(notionClient.isConnected).toBe(true);
    });

    it('should not connect twice', async () => {
      mockClient.connect.mockResolvedValue(undefined);

      await notionClient.connect();
      await notionClient.connect();

      expect(mockClient.connect).toHaveBeenCalledTimes(1);
    });

    it('should disconnect successfully', async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.close.mockResolvedValue(undefined);

      await notionClient.connect();
      await notionClient.disconnect();

      expect(mockClient.close).toHaveBeenCalled();
      expect(notionClient.isConnected).toBe(false);
    });

    it('should not disconnect when not connected', async () => {
      await notionClient.disconnect();

      expect(mockClient.close).not.toHaveBeenCalled();
    });

    it('should handle connection error', async () => {
      const newClient = new NotionMCPClient(options);
      mockClient.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(newClient.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('Tool Operations', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      await notionClient.connect();
    });

    it('should list tools successfully', async () => {
      const mockToolsResult = {
        tools: [
          { name: 'create_page', description: 'Create a new page' },
          { name: 'update_page', description: 'Update a page' }
        ]
      };
      mockClient.request.mockResolvedValue(mockToolsResult);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await notionClient.listTools();

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'tools/list',
          params: {}
        },
        expect.any(Object)
      );
      expect(consoleSpy).toHaveBeenCalledWith('Available tools:');
      expect(consoleSpy).toHaveBeenCalledWith('  - create_page: Create a new page');

      consoleSpy.mockRestore();
    });

    it('should handle empty tools list', async () => {
      mockClient.request.mockResolvedValue({ tools: [] });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await notionClient.listTools();

      expect(consoleSpy).toHaveBeenCalledWith('  No tools available');
      consoleSpy.mockRestore();
    });

    it('should handle tools list error', async () => {
      mockClient.request.mockRejectedValue(new Error('Network error'));
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await notionClient.listTools();

      expect(consoleSpy).toHaveBeenCalledWith('Tools not supported by this server: Error: Network error');
      consoleSpy.mockRestore();
    });

    it('should call tool successfully', async () => {
      const mockResult = { success: true, data: 'test result' };
      mockClient.request.mockResolvedValue(mockResult);

      const result = await notionClient.callTool('test_tool', { arg1: 'value1' });

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'test_tool',
            arguments: { arg1: 'value1' }
          }
        },
        expect.any(Object)
      );
      expect(result).toEqual(mockResult);
    });

    it('should handle tool call error', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockClient.request.mockRejectedValue(new Error('Tool error'));

      await expect(notionClient.callTool('test_tool', {})).rejects.toThrow('Tool error');
      expect(errorSpy).toHaveBeenCalledWith('Failed to call tool "test_tool": Error: Tool error');

      errorSpy.mockRestore();
    });
  });

  describe('Notion API Methods', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      await notionClient.connect();
    });

    it('should create page', async () => {
      const mockResult = { id: 'page-123', title: 'Test Page' };
      mockClient.request.mockResolvedValue(mockResult);

      const options = {
        parent: 'database-123',
        title: 'Test Page',
        properties: { Status: { select: { name: 'Draft' } } }
      };

      const result = await notionClient.createPage(options);

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'create_page',
            arguments: options
          }
        },
        expect.any(Object)
      );
      expect(result).toEqual(mockResult);
    });

    it('should update page', async () => {
      const mockResult = { id: 'page-123', updated: true };
      mockClient.request.mockResolvedValue(mockResult);

      const options = {
        pageId: 'page-123',
        properties: { Status: { select: { name: 'Published' } } }
      };

      const result = await notionClient.updatePage(options);

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'update_page',
            arguments: options
          }
        },
        expect.any(Object)
      );
      expect(result).toEqual(mockResult);
    });

    it('should get page', async () => {
      const mockResult = { id: 'page-123', properties: {} };
      mockClient.request.mockResolvedValue(mockResult);

      const result = await notionClient.getPage('page-123');

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'get_page',
            arguments: { pageId: 'page-123' }
          }
        },
        expect.any(Object)
      );
      expect(result).toEqual(mockResult);
    });

    it('should query database', async () => {
      const mockResult = { results: [{ id: 'page-1' }, { id: 'page-2' }] };
      mockClient.request.mockResolvedValue(mockResult);

      const options = {
        databaseId: 'database-123',
        filter: { property: 'Status', select: { equals: 'Published' } },
        pageSize: 10
      };

      const result = await notionClient.queryDatabase(options);

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'query_database',
            arguments: options
          }
        },
        expect.any(Object)
      );
      expect(result).toEqual(mockResult);
    });

    it('should search', async () => {
      const mockResult = { results: [{ id: 'page-1' }] };
      mockClient.request.mockResolvedValue(mockResult);

      const result = await notionClient.search('test query', { filter: { value: 'page' } });

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: { query: 'test query', filter: { value: 'page' } }
          }
        },
        expect.any(Object)
      );
      expect(result).toEqual(mockResult);
    });

    it('should get database', async () => {
      const mockResult = { id: 'database-123', title: [{ plain_text: 'Test DB' }] };
      mockClient.request.mockResolvedValue(mockResult);

      const result = await notionClient.getDatabase('database-123');

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'get_database',
            arguments: { databaseId: 'database-123' }
          }
        },
        expect.any(Object)
      );
      expect(result).toEqual(mockResult);
    });

    it('should delete page', async () => {
      const mockResult = { id: 'page-123', archived: true };
      mockClient.request.mockResolvedValue(mockResult);

      const result = await notionClient.deletePage('page-123');

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'delete_page',
            arguments: { pageId: 'page-123' }
          }
        },
        expect.any(Object)
      );
      expect(result).toEqual(mockResult);
    });

    it('should get page blocks', async () => {
      const mockResult = { results: [{ id: 'block-1' }, { id: 'block-2' }] };
      mockClient.request.mockResolvedValue(mockResult);

      const result = await notionClient.getPageBlocks('page-123');

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'get_page_blocks',
            arguments: { pageId: 'page-123' }
          }
        },
        expect.any(Object)
      );
      expect(result).toEqual(mockResult);
    });

    it('should append blocks', async () => {
      const mockResult = { results: [{ id: 'new-block-1' }] };
      mockClient.request.mockResolvedValue(mockResult);

      const children = [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: 'Hello World' } }]
          }
        }
      ];

      const result = await notionClient.appendBlocks('page-123', children);

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'append_blocks',
            arguments: { pageId: 'page-123', children }
          }
        },
        expect.any(Object)
      );
      expect(result).toEqual(mockResult);
    });

    it('should update block', async () => {
      const mockResult = { id: 'block-123', updated: true };
      mockClient.request.mockResolvedValue(mockResult);

      const properties = {
        paragraph: {
          rich_text: [{ type: 'text', text: { content: 'Updated content' } }]
        }
      };

      const result = await notionClient.updateBlock('block-123', properties);

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'update_block',
            arguments: { blockId: 'block-123', ...properties }
          }
        },
        expect.any(Object)
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      await notionClient.connect();
    });

    it('should handle tool call error and log it', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockClient.request.mockRejectedValue(new Error('Tool call failed'));

      await expect(notionClient.callTool('test_tool', {})).rejects.toThrow('Tool call failed');
      expect(errorSpy).toHaveBeenCalledWith('Failed to call tool "test_tool": Error: Tool call failed');

      errorSpy.mockRestore();
    });

    it('should propagate errors from API methods', async () => {
      mockClient.request.mockRejectedValue(new Error('API Error'));

      await expect(notionClient.createPage({ parent: 'db-123', title: 'Test' })).rejects.toThrow('API Error');
      await expect(notionClient.updatePage({ pageId: 'page-123' })).rejects.toThrow('API Error');
      await expect(notionClient.getPage('page-123')).rejects.toThrow('API Error');
      await expect(notionClient.queryDatabase({ databaseId: 'db-123' })).rejects.toThrow('API Error');
      await expect(notionClient.search('test')).rejects.toThrow('API Error');
    });

    it('should handle network timeout', async () => {
      mockClient.request.mockRejectedValue(new Error('Request timeout'));

      await expect(notionClient.callTool('test_tool', {})).rejects.toThrow('Request timeout');
    });
  });

  describe('Client Info', () => {
    it('should return correct client info when disconnected', () => {
      const info = notionClient.getClientInfo();

      expect(info).toEqual({
        name: "notion-mcp-client",
        version: "1.0.0",
        connected: false
      });
    });

    it('should return correct client info when connected', async () => {
      mockClient.connect.mockResolvedValue(undefined);
      await notionClient.connect();

      const info = notionClient.getClientInfo();

      expect(info).toEqual({
        name: "notion-mcp-client",
        version: "1.0.0",
        connected: true
      });
    });
  });

  describe('Integration Tests', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      await notionClient.connect();
    });

    it('should perform a complete page creation workflow', async () => {
      // Mock successful responses
      const createPageResult = { id: 'page-123', title: 'New Page' };
      const getPageResult = { 
        id: 'page-123', 
        properties: { 
          title: { 
            title: [{ plain_text: 'New Page' }] 
          } 
        } 
      };
      
      mockClient.request
        .mockResolvedValueOnce(createPageResult) // createPage call
        .mockResolvedValueOnce(getPageResult);   // getPage call

      // Create page
      const createResult = await notionClient.createPage({
        parent: 'database-123',
        title: 'New Page',
        properties: { Status: { select: { name: 'Draft' } } }
      });

      // Verify page
      const getResult = await notionClient.getPage('page-123');

      expect(createResult).toEqual(createPageResult);
      expect(getResult).toEqual(getPageResult);
      expect(mockClient.request).toHaveBeenCalledTimes(2);
    });

    it('should handle complex database query', async () => {
      const mockResult = {
        results: [
          { id: 'page-1', properties: { Name: { title: [{ plain_text: 'Page 1' }] } } },
          { id: 'page-2', properties: { Name: { title: [{ plain_text: 'Page 2' }] } } }
        ],
        has_more: false,
        next_cursor: null
      };
      mockClient.request.mockResolvedValue(mockResult);

      const options = {
        databaseId: 'database-123',
        filter: {
          and: [
            { property: 'Status', select: { equals: 'Published' } },
            { property: 'Created', date: { past_week: {} } }
          ]
        },
        sorts: [
          { property: 'Created', direction: 'descending' }
        ],
        pageSize: 50
      };

      const result = await notionClient.queryDatabase(options);

      expect(result).toEqual(mockResult);
      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'query_database',
            arguments: options
          }
        },
        expect.any(Object)
      );
    });

    it('should handle block operations workflow', async () => {
      const getBlocksResult = { results: [{ id: 'block-1' }] };
      const appendResult = { results: [{ id: 'new-block-1' }] };
      const updateResult = { id: 'block-1', updated: true };

      mockClient.request
        .mockResolvedValueOnce(getBlocksResult)  // getPageBlocks
        .mockResolvedValueOnce(appendResult)     // appendBlocks  
        .mockResolvedValueOnce(updateResult);    // updateBlock

      // Get existing blocks
      const blocks = await notionClient.getPageBlocks('page-123');

      // Append new blocks
      const newBlocks = [
        {
          object: 'block',
          type: 'heading_1',
          heading_1: {
            rich_text: [{ type: 'text', text: { content: 'New Heading' } }]
          }
        }
      ];
      const appendedBlocks = await notionClient.appendBlocks('page-123', newBlocks);

      // Update existing block
      const updatedBlock = await notionClient.updateBlock('block-1', {
        paragraph: {
          rich_text: [{ type: 'text', text: { content: 'Updated text' } }]
        }
      });

      expect(blocks).toEqual(getBlocksResult);
      expect(appendedBlocks).toEqual(appendResult);
      expect(updatedBlock).toEqual(updateResult);
      expect(mockClient.request).toHaveBeenCalledTimes(3);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      await notionClient.connect();
    });

    it('should handle search with no options', async () => {
      const mockResult = { results: [] };
      mockClient.request.mockResolvedValue(mockResult);

      const result = await notionClient.search('test query');

      expect(mockClient.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'search',
            arguments: { query: 'test query' }
          }
        },
        expect.any(Object)
      );
      expect(result).toEqual(mockResult);
    });

    it('should handle empty strings and null values', async () => {
      mockClient.request.mockResolvedValue({});

      // Test with empty string
      await notionClient.getPage('');
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            arguments: { pageId: '' }
          })
        }),
        expect.any(Object)
      );

      // Test with null-like values
      await notionClient.search('', { filter: null });
      expect(mockClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            arguments: { query: '', filter: null }
          })
        }),
        expect.any(Object)
      );
    });

    it('should handle invalid URL in constructor', () => {
      expect(() => {
        new NotionMCPClient({ url: 'invalid-url', bearToken: 'token' });
      }).toThrow();
    });

    it('should handle concurrent operations', async () => {
      const mockResults = [
        { id: 'page-1', title: 'Page 1' },
        { id: 'page-2', title: 'Page 2' },
        { id: 'page-3', title: 'Page 3' }
      ];

      mockClient.request
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1])
        .mockResolvedValueOnce(mockResults[2]);

      const promises = [
        notionClient.getPage('page-1'),
        notionClient.getPage('page-2'),
        notionClient.getPage('page-3')
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual(mockResults);
      expect(mockClient.request).toHaveBeenCalledTimes(3);
    });
  });

  describe('Performance Tests', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      await notionClient.connect();
    });

    it('should handle large query results', async () => {
      const largeResult = {
        results: new Array(100).fill(null).map((_, i) => ({ id: `page-${i}` })),
        has_more: true,
        next_cursor: 'cursor-123'
      };
      mockClient.request.mockResolvedValue(largeResult);

      const result = await notionClient.queryDatabase({
        databaseId: 'database-123',
        pageSize: 100
      });

      expect(result.results).toHaveLength(100);
      expect(result.has_more).toBe(true);
    });

    it('should handle rapid successive calls', async () => {
      mockClient.request.mockResolvedValue({ success: true });

      const promises = new Array(10).fill(null).map((_, i) => 
        notionClient.getPage(`page-${i}`)
      );

      await Promise.all(promises);

      expect(mockClient.request).toHaveBeenCalledTimes(10);
    });
  });
});