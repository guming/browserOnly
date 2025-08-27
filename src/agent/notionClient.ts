import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ListToolsRequest,
  ListToolsResultSchema,
  CallToolRequest,
  CallToolResultSchema,
} from "@modelcontextprotocol/sdk/types.js"

export interface NotionMCPToolOptions {
  url: string;
  bearToken: string;
  timeout?: number;
}

export interface CreatePageOptions {
  parent: string; // database_id or page_id
  title: string;
  properties?: Record<string, any>;
  children?: any[];
}

export interface UpdatePageOptions {
  pageId: string;
  properties?: Record<string, any>;
  archived?: boolean;
}

export interface QueryDatabaseOptions {
  databaseId: string;
  filter?: any;
  sorts?: any[];
  startCursor?: string;
  pageSize?: number;
}

export class NotionMCPClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  private connected: boolean = false;

  constructor(options: NotionMCPToolOptions) {
    const baseUrl = new URL(options?.url);
    this.transport = new StreamableHTTPClientTransport(baseUrl);
    this.client = new Client(
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
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    await this.client.connect(this.transport);
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    await this.client.close();
    this.connected = false;
  }

  async listTools(): Promise<void> {
    try {
      const toolsRequest: ListToolsRequest = {
        method: 'tools/list',
        params: {}
      };
      const toolsResult = await this.client.request(toolsRequest, ListToolsResultSchema);

      console.log('Available tools:');
      if (toolsResult.tools.length === 0) {
        console.log('  No tools available');
      } else {
        for (const tool of toolsResult.tools) {
          console.log(`  - ${tool.name}: ${tool.description}`);
        }
      }
    } catch (error) {
      console.log(`Tools not supported by this server: ${error}`);
    }
  }

  async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    try {
      const callToolRequest: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      };

      const callToolResult = await this.client.request(callToolRequest, CallToolResultSchema);
      return callToolResult;
    } catch (error) {
      console.error(`Failed to call tool "${toolName}": ${error}`);
      throw error;
    }
  }

  // Notion API 方法
  async createPage(options: CreatePageOptions): Promise<any> {
    return await this.callTool('create_page', options);
  }

  async updatePage(options: UpdatePageOptions): Promise<any> {
    return await this.callTool('update_page', options);
  }

  async getPage(pageId: string): Promise<any> {
    return await this.callTool('get_page', { pageId });
  }

  async queryDatabase(options: QueryDatabaseOptions): Promise<any> {
    return await this.callTool('query_database', options);
  }

  async search(query: string, options?: { filter?: any; sort?: any }): Promise<any> {
    return await this.callTool('search', { query, ...options });
  }

  async getDatabase(databaseId: string): Promise<any> {
    return await this.callTool('get_database', { databaseId });
  }

  async deletePage(pageId: string): Promise<any> {
    return await this.callTool('delete_page', { pageId });
  }

  async getPageBlocks(pageId: string): Promise<any> {
    return await this.callTool('get_page_blocks', { pageId });
  }

  async appendBlocks(pageId: string, children: any[]): Promise<any> {
    return await this.callTool('append_blocks', { pageId, children });
  }

  async updateBlock(blockId: string, properties: any): Promise<any> {
    return await this.callTool('update_block', { blockId, ...properties });
  }

  // 健康检查
  get isConnected(): boolean {
    return this.connected;
  }

  // 获取客户端信息
  getClientInfo() {
    return {
      name: "notion-mcp-client",
      version: "1.0.0",
      connected: this.connected
    };
  }
}