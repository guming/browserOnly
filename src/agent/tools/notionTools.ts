import { DynamicTool } from "@langchain/core/tools";
import { 
  NotionMCPClient, 
  CreatePageOptions, 
  UpdatePageOptions, 
  QueryDatabaseOptions 
} from "../notionClient.js";

export type NotionToolFactory = (client: NotionMCPClient) => DynamicTool;

// 创建页面工具
export const notionCreatePage: NotionToolFactory = (client: NotionMCPClient) =>
  new DynamicTool({
    name: "notion_create_page",
    description: `Create a new page in Notion. 
      Input should be a JSON string with:
      - parent: database_id or page_id where the page should be created
      - title: the title of the page
      - properties: optional page properties object
      - children: optional array of block children`,
    func: async (input: string) => {
      try {
        const options: CreatePageOptions = JSON.parse(input);
        
        if (!options.parent || !options.title) {
          return "Error: Both 'parent' and 'title' are required fields";
        }

        const result = await client.createPage(options);
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
export const notionUpdatePage: NotionToolFactory = (client: NotionMCPClient) =>
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

        await client.updatePage(options);
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
export const notionGetPage: NotionToolFactory = (client: NotionMCPClient) =>
  new DynamicTool({
    name: "notion_get_page",
    description: "Get a page from Notion by its ID. Input should be a page ID string.",
    func: async (pageId: string) => {
      try {
        if (!pageId || pageId.trim() === '') {
          return "Error: Page ID is required";
        }

        const result = await client.getPage(pageId.trim());
        return `Successfully retrieved page ${pageId}. Title: ${result.properties?.title?.title?.[0]?.plain_text || 'No title'}`;
      } catch (error) {
        return `Error getting page: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

// 查询数据库工具
export const notionQueryDatabase: NotionToolFactory = (client: NotionMCPClient) =>
  new DynamicTool({
    name: "notion_query_database",
    description: `Query a Notion database.
      Input should be a JSON string with:
      - databaseId: the ID of the database to query
      - filter: optional filter object
      - sorts: optional array of sort objects
      - startCursor: optional cursor for pagination
      - pageSize: optional number of results per page (max 100)`,
    func: async (input: string) => {
      try {
        const options: QueryDatabaseOptions = JSON.parse(input);
        
        if (!options.databaseId) {
          return "Error: 'databaseId' is required";
        }

        const result = await client.queryDatabase(options);
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
export const notionSearch: NotionToolFactory = (client: NotionMCPClient) =>
  new DynamicTool({
    name: "notion_search",
    description: `Search for pages and databases in Notion workspace.
      Input should be a JSON string with:
      - query: the search query string
      - filter: optional filter object to limit search scope
      - sort: optional sort object`,
    func: async (input: string) => {
      try {
        const options = JSON.parse(input);
        
        if (!options.query) {
          return "Error: 'query' is required";
        }

        const result = await client.search(options.query, options);
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
export const notionGetDatabase: NotionToolFactory = (client: NotionMCPClient) =>
  new DynamicTool({
    name: "notion_get_database",
    description: "Get a database from Notion by its ID. Input should be a database ID string.",
    func: async (databaseId: string) => {
      try {
        if (!databaseId || databaseId.trim() === '') {
          return "Error: Database ID is required";
        }

        const result = await client.getDatabase(databaseId.trim());
        return `Successfully retrieved database ${databaseId}. Title: ${result.title?.[0]?.plain_text || 'No title'}`;
      } catch (error) {
        return `Error getting database: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

// 删除页面工具
export const notionDeletePage: NotionToolFactory = (client: NotionMCPClient) =>
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
export const notionGetPageBlocks: NotionToolFactory = (client: NotionMCPClient) =>
  new DynamicTool({
    name: "notion_get_page_blocks",
    description: "Get all blocks from a Notion page. Input should be a page ID string.",
    func: async (pageId: string) => {
      try {
        if (!pageId || pageId.trim() === '') {
          return "Error: Page ID is required";
        }

        const result = await client.getPageBlocks(pageId.trim());
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
export const notionAppendBlocks: NotionToolFactory = (client: NotionMCPClient) =>
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
export const notionUpdateBlock: NotionToolFactory = (client: NotionMCPClient) =>
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

// 便捷函数：获取所有工具
export function getAllNotionTools(client: NotionMCPClient): DynamicTool[] {
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
export function getBasicNotionTools(client: NotionMCPClient): DynamicTool[] {
  return [
    notionCreatePage(client),
    notionUpdatePage(client),
    notionGetPage(client),
    notionQueryDatabase(client),
    notionSearch(client)
  ];
}

// 便捷函数：获取高级工具
export function getAdvancedNotionTools(client: NotionMCPClient): DynamicTool[] {
  return [
    notionGetDatabase(client),
    notionDeletePage(client),
    notionGetPageBlocks(client),
    notionAppendBlocks(client),
    notionUpdateBlock(client)
  ];
}