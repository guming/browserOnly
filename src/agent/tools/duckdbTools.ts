import type { Page } from "playwright-crx";
import { DynamicTool } from "langchain/tools";
import { DuckDBService } from "../../tracking/duckdbService";

type ToolFactory = (page: Page) => DynamicTool;

// Lazy getter for DuckDB service singleton
const getDuckDB = () => DuckDBService.getInstance();

/**
 * Execute SQL query on loaded data
 */
export const queryData: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "query_data",
    description: `
Execute SQL queries on uploaded data tables in DuckDB.

Input: SQL query string (e.g., "SELECT * FROM my_table LIMIT 10")

Returns: Query results with columns and rows

Examples:
  • SELECT * FROM sales LIMIT 10 - View first 10 rows
  • SELECT COUNT(*) FROM users - Count total rows
  • SELECT category, SUM(amount) FROM transactions GROUP BY category - Aggregate data
  • SELECT * FROM products WHERE price > 100 ORDER BY price DESC - Filter and sort

Notes:
  • Table names come from uploaded file names (sanitized)
  • Use list_data_tables to see available tables
  • Supports full SQL: JOIN, GROUP BY, WHERE, ORDER BY, etc.
`,
    func: async (sql: string) => {
      try {
        const result = await getDuckDB().query(sql);

        // Format result as table
        let output = `Query returned ${result.rowCount} rows\n\n`;

        if (result.rowCount === 0) {
          return output + 'No results found.';
        }

        // Create markdown table
        output += '| ' + result.columns.join(' | ') + ' |\n';
        output += '| ' + result.columns.map(() => '---').join(' | ') + ' |\n';

        // Add rows (limit to 50 for display)
        const displayRows = result.rows.slice(0, 50);
        displayRows.forEach(row => {
          output += '| ' + row.map(cell => String(cell ?? 'NULL')).join(' | ') + ' |\n';
        });

        if (result.rowCount > 50) {
          output += `\n... and ${result.rowCount - 50} more rows (use LIMIT to control output)`;
        }

        return output;
      } catch (err) {
        return `Error executing query: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });

/**
 * List all available data tables
 */
export const listDataTables: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "list_data_tables",
    description: `
List all data tables currently loaded in DuckDB.

Input: None (empty string)

Returns: List of tables with row counts and column information

Use this to see what data is available before running queries.
`,
    func: async () => {
      try {
        const tables = await getDuckDB().listTables();

        if (tables.length === 0) {
          return 'No data tables loaded. Upload CSV or JSON files first.';
        }

        let output = `Found ${tables.length} data table(s):\n\n`;

        tables.forEach((table, index) => {
          output += `${index + 1}. **${table.name}** (from ${table.fileName})\n`;
          output += `   - Rows: ${table.rowCount}\n`;
          output += `   - Columns: ${table.columns.map(c => `${c.name} (${c.type})`).join(', ')}\n`;
          output += `   - Created: ${new Date(table.createdAt).toLocaleString()}\n\n`;
        });

        return output;
      } catch (err) {
        return `Error listing tables: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });

/**
 * Describe a specific table schema
 */
export const describeDataTable: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "describe_data_table",
    description: `
Get detailed schema information for a specific data table.

Input: Table name (e.g., "sales_data")

Returns: Table schema with column names, types, and metadata

Use this to understand the structure before querying.
`,
    func: async (tableName: string) => {
      try {
        const description = await getDuckDB().describeTable(tableName.trim());
        return description;
      } catch (err) {
        return `Error describing table: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });

/**
 * Preview table data (first N rows)
 */
export const previewDataTable: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "preview_data_table",
    description: `
Preview the first 10 rows of a data table.

Input: Table name (e.g., "sales_data")

Returns: First 10 rows in table format

Quick way to see sample data without writing SQL.
`,
    func: async (tableName: string) => {
      try {
        const result = await getDuckDB().getTablePreview(tableName.trim(), 10);

        let output = `Preview of ${tableName} (showing ${result.rowCount} rows):\n\n`;

        // Create markdown table
        output += '| ' + result.columns.join(' | ') + ' |\n';
        output += '| ' + result.columns.map(() => '---').join(' | ') + ' |\n';

        result.rows.forEach(row => {
          output += '| ' + row.map(cell => String(cell ?? 'NULL')).join(' | ') + ' |\n';
        });

        return output;
      } catch (err) {
        return `Error previewing table: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });

/**
 * Drop/delete a data table
 */
export const dropDataTable: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "drop_data_table",
    description: `
Delete a data table from DuckDB.

Input: Table name (e.g., "sales_data")

Returns: Confirmation message

Use this to remove tables you no longer need.
`,
    func: async (tableName: string) => {
      try {
        await getDuckDB().dropTable(tableName.trim());
        return `Successfully dropped table "${tableName}"`;
      } catch (err) {
        return `Error dropping table: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });

/**
 * Clear all data tables
 */
export const clearAllDataTables: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "clear_all_data_tables",
    description: `
Delete all data tables from DuckDB.

Input: None (empty string)

Returns: Confirmation message

Use this to clear all loaded data and start fresh.
`,
    func: async () => {
      try {
        await getDuckDB().clearAllTables();
        return 'Successfully cleared all data tables';
      } catch (err) {
        return `Error clearing tables: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });

/**
 * Get all DuckDB tools
 */
export function getAllDuckDBTools(page: Page) {
  return [
    queryData(page),
    listDataTables(page),
    describeDataTable(page),
    previewDataTable(page),
    dropDataTable(page),
    clearAllDataTables(page),
  ];
}
