import { Client } from '@notionhq/client';
import type {
  CreatePageParameters,
  UpdatePageParameters,
  QueryDatabaseParameters,
  SearchParameters,
  ListBlockChildrenParameters,
  AppendBlockChildrenParameters,
  UpdateBlockParameters,
  CreateDatabaseParameters,
  UpdateDatabaseParameters,
} from '@notionhq/client/build/src/api-endpoints';

interface NotionClientOptions {
  auth: string; // Integration token
  notionVersion?: string;
  fetch?: typeof fetch; // 自定义 fetch 函数
}

// 修复 fetch 上下文问题的工具函数
function createBoundFetch(): typeof fetch {
  if (typeof window !== 'undefined' && window.fetch) {
    // 浏览器环境：绑定 fetch 到 window
    return window.fetch.bind(window);
  } else if (typeof globalThis !== 'undefined' && globalThis.fetch) {
    // Node.js 18+ 或其他环境
    return globalThis.fetch.bind(globalThis);
  } else {
    // 如果没有原生 fetch，需要 polyfill
    throw new Error('No fetch implementation available. Please install node-fetch or use a modern browser.');
  }
}

export class NotionSDKClient {
  private client: Client;
  private connected: boolean = false;

  constructor(options: NotionClientOptions) {

    const boundFetch = options.fetch || createBoundFetch();
    this.client = new Client({
      auth: options.auth,
      notionVersion: options.notionVersion || '2022-06-28',
      fetch: boundFetch
    });
    this.connected = true; 
  }

  // 健康检查 - 获取用户信息
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.users.me({});
      console.log('Connected as:', response.name || response.id);
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }

  // 页面相关操作
  async createPage(parameters: CreatePageParameters): Promise<any> {
    try {
      const response = await this.client.pages.create(parameters);
      return response;
    } catch (error) {
      console.error('Failed to create page:', error);
      throw error;
    }
  }

  async getPage(pageId: string): Promise<any> {
    try {
      const response = await this.client.pages.retrieve({ page_id: pageId });
      return response;
    } catch (error) {
      console.error(`Failed to get page ${pageId}:`, error);
      throw error;
    }
  }

  async updatePage(pageId: string, parameters: any): Promise<any> {
    try {
      const response = await this.client.pages.update({
        page_id: pageId,
        ...parameters
      });
      return response;
    } catch (error) {
      console.error(`Failed to update page ${pageId}:`, error);
      throw error;
    }
  }

  async deletePage(pageId: string): Promise<any> {
    try {
      const response = await this.client.pages.update({
        page_id: pageId,
        archived: true
      });
      return response;
    } catch (error) {
      console.error(`Failed to delete page ${pageId}:`, error);
      throw error;
    }
  }

  // 数据库相关操作
  async createDatabase(parameters: CreateDatabaseParameters): Promise<any> {
    try {
      const response = await this.client.databases.create(parameters);
      return response;
    } catch (error) {
      console.error('Failed to create database:', error);
      throw error;
    }
  }

  async getDatabase(databaseId: string): Promise<any> {
    try {
      const response = await this.client.databases.retrieve({ database_id: databaseId });
      return response;
    } catch (error) {
      console.error(`Failed to get database ${databaseId}:`, error);
      throw error;
    }
  }

  async updateDatabase(databaseId: string, parameters: any): Promise<any> {
    try {
      const response = await this.client.databases.update({
        database_id: databaseId,
        ...parameters
      });
      return response;
    } catch (error) {
      console.error(`Failed to update database ${databaseId}:`, error);
      throw error;
    }
  }

  async queryDatabase(databaseId: string, parameters?: any): Promise<any> {
    try {
      const response = await this.client.databases.query({
        database_id: databaseId,
        ...parameters
      });
      return response;
    } catch (error) {
      console.error(`Failed to query database ${databaseId}:`, error);
      throw error;
    }
  }

  // 查询所有数据库页面（自动分页）
  async queryDatabaseAll(databaseId: string, parameters?: any): Promise<any[]> {
    const allResults: any[] = [];
    let hasMore = true;
    let nextCursor: string | undefined = undefined;

    try {
      while (hasMore) {
        const response = await this.client.databases.query({
          database_id: databaseId,
          start_cursor: nextCursor,
          ...parameters
        });

        allResults.push(...response.results);
        hasMore = response.has_more;
        nextCursor = response.next_cursor || undefined;
      }

      return allResults;
    } catch (error) {
      console.error(`Failed to query all pages from database ${databaseId}:`, error);
      throw error;
    }
  }

  // 搜索功能
  async search(parameters: SearchParameters = {}): Promise<any> {
    try {
      const response = await this.client.search(parameters);
      return response;
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  // 搜索所有结果（自动分页）
  async searchAll(parameters: SearchParameters = {}): Promise<any[]> {
    const allResults: any[] = [];
    let hasMore = true;
    let nextCursor: string | undefined = undefined;

    try {
      while (hasMore) {
        const response = await this.client.search({
          start_cursor: nextCursor,
          ...parameters
        });

        allResults.push(...response.results);
        hasMore = response.has_more;
        nextCursor = response.next_cursor || undefined;
      }

      return allResults;
    } catch (error) {
      console.error('Search all failed:', error);
      throw error;
    }
  }

  // 块（Block）相关操作
  async getBlocks(blockId: string, parameters?: any): Promise<any> {
    try {
      const response = await this.client.blocks.children.list({
        block_id: blockId,
        ...parameters
      });
      return response;
    } catch (error) {
      console.error(`Failed to get blocks for ${blockId}:`, error);
      throw error;
    }
  }

  async getBlocksAll(blockId: string): Promise<any[]> {
    const allBlocks: any[] = [];
    let hasMore = true;
    let nextCursor: string | undefined = undefined;

    try {
      while (hasMore) {
        const response = await this.client.blocks.children.list({
          block_id: blockId,
          start_cursor: nextCursor
        });

        allBlocks.push(...response.results);
        hasMore = response.has_more;
        nextCursor = response.next_cursor || undefined;
      }

      return allBlocks;
    } catch (error) {
      console.error(`Failed to get all blocks for ${blockId}:`, error);
      throw error;
    }
  }

  async appendBlocks(blockId: string, children: any[]): Promise<any> {
    try {
      const response = await this.client.blocks.children.append({
        block_id: blockId,
        children: children
      });
      return response;
    } catch (error) {
      console.error(`Failed to append blocks to ${blockId}:`, error);
      throw error;
    }
  }

  async updateBlock(blockId: string, parameters: any): Promise<any> {
    try {
      const response = await this.client.blocks.update({
        block_id: blockId,
        ...parameters
      });
      return response;
    } catch (error) {
      console.error(`Failed to update block ${blockId}:`, error);
      throw error;
    }
  }

  async deleteBlock(blockId: string): Promise<any> {
    try {
      const response = await this.client.blocks.delete({
        block_id: blockId
      });
      return response;
    } catch (error) {
      console.error(`Failed to delete block ${blockId}:`, error);
      throw error;
    }
  }

  // 用户相关操作
  async getUsers(): Promise<any> {
    try {
      const response = await this.client.users.list({});
      return response;
    } catch (error) {
      console.error('Failed to get users:', error);
      throw error;
    }
  }

  async getUser(userId: string): Promise<any> {
    try {
      const response = await this.client.users.retrieve({ user_id: userId });
      return response;
    } catch (error) {
      console.error(`Failed to get user ${userId}:`, error);
      throw error;
    }
  }

  async getCurrentUser(): Promise<any> {
    try {
      const response = await this.client.users.me({});
      return response;
    } catch (error) {
      console.error('Failed to get current user:', error);
      throw error;
    }
  }

  // 实用工具方法
  async findDatabaseByTitle(title: string): Promise<any | null> {
    try {
      const response = await this.search({
        query: title,
        filter: { property: 'object', value: 'database' }
      });

      const database = response.results.find((result: any) => 
        result.title?.[0]?.plain_text === title
      );

      return database || null;
    } catch (error) {
      console.error(`Failed to find database with title "${title}":`, error);
      throw error;
    }
  }

  async findPageByTitle(title: string, parentId?: string): Promise<any | null> {
    try {
      const searchParams: SearchParameters = {
        query: title,
        filter: { property: 'object', value: 'page' }
      };

      const response = await this.search(searchParams);
      
      let page = response.results.find((result: any) => {
        const pageTitle = result.properties?.title?.title?.[0]?.plain_text || 
                         result.properties?.Name?.title?.[0]?.plain_text;
        return pageTitle === title;
      });

      // 如果指定了 parentId，进一步过滤
      if (page && parentId) {
        const pageDetail = await this.getPage(page.id);
        if (pageDetail.parent?.database_id !== parentId && 
            pageDetail.parent?.page_id !== parentId) {
          page = null;
        }
      }

      return page || null;
    } catch (error) {
      console.error(`Failed to find page with title "${title}":`, error);
      throw error;
    }
  }

  // 便捷的页面创建方法
  async createSimplePage(title: string, parentId: string, content?: any[]): Promise<any> {
    const pageData: CreatePageParameters = {
      parent: parentId.length === 32 ? 
        { database_id: parentId } : 
        { page_id: parentId },
      properties: {
        title: {
          title: [{ text: { content: title } }]
        }
      }
    };

    if (content && content.length > 0) {
      pageData.children = content;
    }

    return await this.createPage(pageData);
  }

  // 健康检查和连接状态
  get isConnected(): boolean {
    return this.connected;
  }

    getClientInfo() {
    return {
      name: "notion-ts-sdk-client",
      version: "1.0.0",
      connected: this.connected,
      notionSdkVersion: "2.2.3" // 或实际版本号
    };
  }
}

// 工厂函数
export const createNotionClient = (integrationToken: string, notionVersion?: string) => {
  return new NotionSDKClient({
    auth: integrationToken,
    notionVersion
  });
};