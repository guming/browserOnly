import { DynamicTool } from "@langchain/core/tools";
import { NotionSDKClient } from "../notionClient.js";
import type { 
  CreatePageParameters,
  UpdatePageParameters,
  QueryDatabaseParameters 
} from '@notionhq/client/build/src/api-endpoints';

export type NotionToolFactory = (client: NotionSDKClient) => DynamicTool;

// 定义接口以保持向后兼容
interface CreatePageOptions {
  parent: { database_id: string } | { page_id: string };
  title: string;
  properties?: Record<string, any>;
  children?: any[];
}

interface UpdatePageOptions {
  pageId: string;
  properties?: Record<string, any>;
  archived?: boolean;
}

interface QueryDatabaseOptions {
  databaseId: string;
  filter?: any;
  sorts?: any[];
  start_cursor?: string;
  page_size?: number;
}

// 创建页面工具
export const notionCreatePage: NotionToolFactory = (client: NotionSDKClient) =>
  new DynamicTool({
    name: "notion_create_page",
    description: `Create a new page in Notion. 
      Input should be a JSON string with:
      - parent: object with database_id or page_id where the page should be created
      - title: the title of the page
      - properties: optional page properties object
      - children: optional array of block children`,
    func: async (input: string) => {
      try {
        const options: CreatePageOptions = JSON.parse(input);
        
        if (!options.parent || !options.title) {
          return "Error: Both 'parent' and 'title' are required fields";
        }

        // 构建 SDK 兼容的参数
        const createParams: CreatePageParameters = {
          parent: options.parent,
          properties: {
            title: {
              title: [{ text: { content: options.title } }]
            },
            ...options.properties
          },
          ...(options.children && { children: options.children })
        };

        const result = await client.createPage(createParams);
        return `Successfully created page "${options.title}". Page ID: ${result.id || 'unknown'}`;
      } catch (error) {
        if (error instanceof SyntaxError) {
          return `Error: Invalid JSON input. Please provide valid JSON with parent and title fields.`;
        }
        return `Error creating page: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

// 更新页面工具
export const notionUpdatePage: NotionToolFactory = (client: NotionSDKClient) =>
  new DynamicTool({
    name: "notion_update_page",
    description: `Update an existing page in Notion.
      Input should be a JSON string with:
      - pageId: the ID of the page to update
      - properties: optional properties to update
      - archived: optional boolean to archive/unarchive the page`,
    func: async (input: string) => {
      try {
        const options: UpdatePageOptions = JSON.parse(input);
        
        if (!options.pageId) {
          return "Error: 'pageId' is required";
        }

        const updateParams: any = {};
        if (options.properties) {
          updateParams.properties = options.properties;
        }
        if (typeof options.archived === 'boolean') {
          updateParams.archived = options.archived;
        }

        await client.updatePage(options.pageId, updateParams);
        return `Successfully updated page ${options.pageId}`;
      } catch (error) {
        if (error instanceof SyntaxError) {
          return `Error: Invalid JSON input. Please provide valid JSON with pageId field.`;
        }
        return `Error updating page: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

// 获取页面工具
export const notionGetPage: NotionToolFactory = (client: NotionSDKClient) =>
  new DynamicTool({
    name: "notion_get_page",
    description: "Get a page from Notion by its ID. Input should be a page ID string.",
    func: async (pageId: string) => {
      try {
        if (!pageId || pageId.trim() === '') {
          return "Error: Page ID is required";
        }

        const result = await client.getPage(pageId.trim());
        const title = result.properties?.title?.title?.[0]?.plain_text || 
                     result.properties?.Name?.title?.[0]?.plain_text || 
                     'No title';
        return `Successfully retrieved page ${pageId}. Title: ${title}`;
      } catch (error) {
        return `Error getting page: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

// 查询数据库工具
export const notionQueryDatabase: NotionToolFactory = (client: NotionSDKClient) =>
  new DynamicTool({
    name: "notion_query_database",
    description: `Query a Notion database.
      Input should be a JSON string with:
      - databaseId: the ID of the database to query
      - filter: optional filter object
      - sorts: optional array of sort objects
      - start_cursor: optional cursor for pagination
      - page_size: optional number of results per page (max 100)`,
    func: async (input: string) => {
      try {
        const options: QueryDatabaseOptions = JSON.parse(input);
        
        if (!options.databaseId) {
          return "Error: 'databaseId' is required";
        }

        const queryParams: any = {};
        if (options.filter) queryParams.filter = options.filter;
        if (options.sorts) queryParams.sorts = options.sorts;
        if (options.start_cursor) queryParams.start_cursor = options.start_cursor;
        if (options.page_size) queryParams.page_size = options.page_size;

        const result = await client.queryDatabase(options.databaseId, queryParams);
        const count = result.results?.length || 0;
        return `Successfully queried database ${options.databaseId}. Found ${count} results.`;
      } catch (error) {
        if (error instanceof SyntaxError) {
          return `Error: Invalid JSON input. Please provide valid JSON with databaseId field.`;
        }
        return `Error querying database: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

// 搜索工具
export const notionSearch: NotionToolFactory = (client: NotionSDKClient) =>
  new DynamicTool({
    name: "notion_search",
    description: `Search for pages and databases in Notion workspace.
      Input should be a JSON string with:
      - query: the search query string
      - filter: optional filter object to limit search scope
      - sort: optional sort object
      - page_size: optional number of results per page`,
    func: async (input: string) => {
      try {
        const options = JSON.parse(input);
        
        if (!options.query) {
          return "Error: 'query' is required";
        }

        const searchParams: any = { query: options.query };
        if (options.filter) searchParams.filter = options.filter;
        if (options.sort) searchParams.sort = options.sort;
        if (options.page_size) searchParams.page_size = options.page_size;

        const result = await client.search(searchParams);
        const count = result.results?.length || 0;
        return `Search completed for "${options.query}". Found ${count} results.`;
      } catch (error) {
        if (error instanceof SyntaxError) {
          return `Error: Invalid JSON input. Please provide valid JSON with query field.`;
        }
        return `Error searching: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

// 获取数据库工具
export const notionGetDatabase: NotionToolFactory = (client: NotionSDKClient) =>
  new DynamicTool({
    name: "notion_get_database",
    description: "Get a database from Notion by its ID. Input should be a database ID string.",
    func: async (databaseId: string) => {
      try {
        if (!databaseId || databaseId.trim() === '') {
          return "Error: Database ID is required";
        }

        const result = await client.getDatabase(databaseId.trim());
        const title = result.title?.[0]?.plain_text || 'No title';
        return `Successfully retrieved database ${databaseId}. Title: ${title}`;
      } catch (error) {
        return `Error getting database: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

// 删除页面工具
export const notionDeletePage: NotionToolFactory = (client: NotionSDKClient) =>
  new DynamicTool({
    name: "notion_delete_page",
    description: "Delete (archive) a page in Notion. Input should be a page ID string.",
    func: async (pageId: string) => {
      try {
        if (!pageId || pageId.trim() === '') {
          return "Error: Page ID is required";
        }

        await client.deletePage(pageId.trim());
        return `Successfully deleted page ${pageId}`;
      } catch (error) {
        return `Error deleting page: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

// 获取页面块工具
export const notionGetPageBlocks: NotionToolFactory = (client: NotionSDKClient) =>
  new DynamicTool({
    name: "notion_get_page_blocks",
    description: "Get all blocks from a Notion page. Input should be a page ID string.",
    func: async (pageId: string) => {
      try {
        if (!pageId || pageId.trim() === '') {
          return "Error: Page ID is required";
        }

        const result = await client.getBlocks(pageId.trim());
        const count = result.results?.length || 0;
        return `Successfully retrieved ${count} blocks from page ${pageId}`;
      } catch (error) {
        return `Error getting page blocks: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

// 添加块工具
export const notionAppendBlocks: NotionToolFactory = (client: NotionSDKClient) =>
  new DynamicTool({
    name: "notion_append_blocks",
    description: `Append blocks to a Notion page.
      Input should be a JSON string with:
      - pageId: the ID of the page to append to
      - children: array of block objects to append`,
    func: async (input: string) => {
      try {
        const options = JSON.parse(input);
        
        if (!options.pageId || !options.children) {
          return "Error: Both 'pageId' and 'children' are required";
        }

        if (!Array.isArray(options.children)) {
          return "Error: 'children' must be an array";
        }

        await client.appendBlocks(options.pageId, options.children);
        return `Successfully appended ${options.children.length} blocks to page ${options.pageId}`;
      } catch (error) {
        if (error instanceof SyntaxError) {
          return `Error: Invalid JSON input. Please provide valid JSON with pageId and children fields.`;
        }
        return `Error appending blocks: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

// 更新块工具
export const notionUpdateBlock: NotionToolFactory = (client: NotionSDKClient) =>
  new DynamicTool({
    name: "notion_update_block",
    description: `Update a block in Notion.
      Input should be a JSON string with:
      - blockId: the ID of the block to update
      - properties: the block properties to update`,
    func: async (input: string) => {
      try {
        const options = JSON.parse(input);
        
        if (!options.blockId) {
          return "Error: 'blockId' is required";
        }

        await client.updateBlock(options.blockId, options.properties || {});
        return `Successfully updated block ${options.blockId}`;
      } catch (error) {
        if (error instanceof SyntaxError) {
          return `Error: Invalid JSON input. Please provide valid JSON with blockId field.`;
        }
        return `Error updating block: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

// NotebookLM 风格的工具
export const notionGenerateSummary: NotionToolFactory = (client: NotionSDKClient) =>
  new DynamicTool({
    name: "notion_generate_summary",
    description: `Generate a summary of a Notion page content.
      Input should be a page ID string.`,
    func: async (pageId: string) => {
      try {
        if (!pageId || pageId.trim() === '') {
          return "Error: Page ID is required";
        }

        const page = await client.getPage(pageId.trim());
        const blocks = await client.getBlocksAll(pageId.trim());
        
        const title = page.properties?.title?.title?.[0]?.plain_text || 
                     page.properties?.Name?.title?.[0]?.plain_text || 
                     'Untitled';
        
        // 提取文本内容
        const textContent = blocks
          .filter(block => block.type === 'paragraph' && block.paragraph?.rich_text)
          .map(block => block.paragraph.rich_text.map((rt: { plain_text: any; }) => rt.plain_text).join(''))
          .join('\n')
          .slice(0, 1000); // 限制长度

        return `Summary of "${title}":\n\n${textContent}${textContent.length >= 1000 ? '...' : ''}`;
      } catch (error) {
        return `Error generating summary: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

export const notionGenerateStudyGuide: NotionToolFactory = (client: NotionSDKClient) =>
  new DynamicTool({
    name: "notion_generate_study_guide",
    description: `Generate a study guide from a Notion page content.
      Input should be a page ID string.`,
    func: async (pageId: string) => {
      try {
        if (!pageId || pageId.trim() === '') {
          return "Error: Page ID is required";
        }

        const page = await client.getPage(pageId.trim());
        const blocks = await client.getBlocksAll(pageId.trim());
        
        const title = page.properties?.title?.title?.[0]?.plain_text || 
                     page.properties?.Name?.title?.[0]?.plain_text || 
                     'Untitled';
        
        // 提取标题
        const headers = blocks
          .filter(block => block.type?.startsWith('heading_'))
          .map(block => `- ${block[block.type]?.rich_text?.[0]?.plain_text}`)
          .join('\n');

        // 提取要点
        const bulletPoints = blocks
          .filter(block => block.type === 'bulleted_list_item')
          .map(block => `  • ${block.bulleted_list_item?.rich_text?.[0]?.plain_text}`)
          .join('\n');

        return `Study Guide for "${title}":\n\nMain Topics:\n${headers}\n\nKey Points:\n${bulletPoints}`;
      } catch (error) {
        return `Error generating study guide: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

export const notionGenerateFAQ: NotionToolFactory = (client: NotionSDKClient) =>
  new DynamicTool({
    name: "notion_generate_faq",
    description: `Generate FAQ from a Notion page content.
      Input should be a page ID string.`,
    func: async (pageId: string) => {
      try {
        if (!pageId || pageId.trim() === '') {
          return "Error: Page ID is required";
        }

        const page = await client.getPage(pageId.trim());
        const blocks = await client.getBlocksAll(pageId.trim());
        
        const title = page.properties?.title?.title?.[0]?.plain_text || 
                     page.properties?.Name?.title?.[0]?.plain_text || 
                     'Untitled';

        const textContent = blocks
          .filter(block => block.type === 'paragraph' && block.paragraph?.rich_text)
          .map(block => block.paragraph.rich_text.map((rt: { plain_text: any; }) => rt.plain_text).join(''))
          .join(' ')
          .slice(0, 500);

        // 简单的 FAQ 生成
        const faqs = [
          `Q: What is ${title} about?`,
          `A: ${textContent.slice(0, 200)}...`,
          `\nQ: What are the key points of ${title}?`,
          `A: Please refer to the main content for detailed information.`
        ].join('\n');

        return `FAQ for "${title}":\n\n${faqs}`;
      } catch (error) {
        return `Error generating FAQ: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

// 便捷函数：获取所有工具
export function getAllNotionTools(client: NotionSDKClient): DynamicTool[] {
  return [
    notionCreatePage(client),
    notionUpdatePage(client),
    notionGetPage(client),
    notionQueryDatabase(client),
    notionSearch(client),
    notionGetDatabase(client),
    notionDeletePage(client),
    notionGetPageBlocks(client),
    notionAppendBlocks(client),
    notionUpdateBlock(client)
  ];
}

// 便捷函数：获取基础工具（最常用的）
export function getBasicNotionTools(client: NotionSDKClient): DynamicTool[] {
  return [
    notionCreatePage(client),
    notionUpdatePage(client),
    notionGetPage(client),
    notionQueryDatabase(client),
    notionSearch(client)
  ];
}

// 便捷函数：获取高级工具
export function getAdvancedNotionTools(client: NotionSDKClient): DynamicTool[] {
  return [
    notionGetDatabase(client),
    notionDeletePage(client),
    notionGetPageBlocks(client),
    notionAppendBlocks(client),
    notionUpdateBlock(client)
  ];
}

// 便捷函数：获取 NotebookLM 风格工具
export function getNotebookLMTools(client: NotionSDKClient): DynamicTool[] {
  return [
    notionGenerateSummary(client),
    notionGenerateStudyGuide(client),
    notionGenerateFAQ(client),
  ];
}

// 便捷函数：获取所有工具（包括 NotebookLM）
export function getAllNotionToolsWithNotebookLM(client: NotionSDKClient): DynamicTool[] {
  return [
    ...getAllNotionTools(client),
  ];
}