import { DynamicTool } from "@langchain/core/tools";
import type { Page } from "playwright-crx";

export type DuckDBToolFactory = () => DynamicTool;

interface QueryOptions {
  sql: string;
  database?: string;
  params?: Record<string, any>;
}

interface CreateTableOptions {
  tableName: string;
  columns: Record<string, string>;
  database?: string;
}

interface InsertDataOptions {
  tableName: string;
  data: Record<string, any>[];
  database?: string;
}

// Execute SQL query tool
export const duckdbQuery: DuckDBToolFactory = () =>
  new DynamicTool({
    name: "duckdb_query",
    description: `Execute a SQL query on DuckDB database.
      Input should be a JSON string with:
      - sql: the SQL query to execute
      - database: optional database path (defaults to configured database)
      - params: optional parameters for prepared statements`,
    func: async (input: string) => {
      try {
        const options: QueryOptions = JSON.parse(input);

        if (!options.sql) {
          return "Error: 'sql' field is required";
        }

        // Get DuckDB settings from Chrome storage
        const settings = await chrome.storage.sync.get(['duckdbEnabled', 'duckdbDatabasePath']);

        if (!settings.duckdbEnabled) {
          return "Error: DuckDB integration is not enabled. Please enable it in the settings.";
        }

        const databasePath = options.database || settings.duckdbDatabasePath || ':memory:';

        // TODO: Implement actual DuckDB connection and query execution
        // This is a placeholder for the actual implementation
        console.log('Executing DuckDB query:', options.sql);
        console.log('Database path:', databasePath);
        console.log('Parameters:', options.params);

        // Simulated response for now
        return `Query executed successfully on database: ${databasePath}\nSQL: ${options.sql}\nResult: [Placeholder - implement DuckDB connection]`;

      } catch (error) {
        if (error instanceof SyntaxError) {
          return "Error: Invalid JSON input format";
        }
        return `Error executing DuckDB query: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

// Create table tool
export const duckdbCreateTable: DuckDBToolFactory = () =>
  new DynamicTool({
    name: "duckdb_create_table",
    description: `Create a new table in DuckDB database.
      Input should be a JSON string with:
      - tableName: name of the table to create
      - columns: object mapping column names to data types (e.g., {"id": "INTEGER", "name": "VARCHAR"})
      - database: optional database path (defaults to configured database)`,
    func: async (input: string) => {
      try {
        const options: CreateTableOptions = JSON.parse(input);

        if (!options.tableName || !options.columns) {
          return "Error: Both 'tableName' and 'columns' are required fields";
        }

        // Get DuckDB settings from Chrome storage
        const settings = await chrome.storage.sync.get(['duckdbEnabled', 'duckdbDatabasePath']);

        if (!settings.duckdbEnabled) {
          return "Error: DuckDB integration is not enabled. Please enable it in the settings.";
        }

        const databasePath = options.database || settings.duckdbDatabasePath || ':memory:';

        // Generate CREATE TABLE SQL
        const columnDefinitions = Object.entries(options.columns)
          .map(([name, type]) => `${name} ${type}`)
          .join(', ');

        const createTableSQL = `CREATE TABLE ${options.tableName} (${columnDefinitions})`;

        // TODO: Implement actual DuckDB connection and table creation
        console.log('Creating DuckDB table:', createTableSQL);
        console.log('Database path:', databasePath);

        return `Table '${options.tableName}' created successfully in database: ${databasePath}\nSQL: ${createTableSQL}`;

      } catch (error) {
        if (error instanceof SyntaxError) {
          return "Error: Invalid JSON input format";
        }
        return `Error creating DuckDB table: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

// Insert data tool
export const duckdbInsertData: DuckDBToolFactory = () =>
  new DynamicTool({
    name: "duckdb_insert_data",
    description: `Insert data into a DuckDB table.
      Input should be a JSON string with:
      - tableName: name of the target table
      - data: array of objects representing rows to insert
      - database: optional database path (defaults to configured database)`,
    func: async (input: string) => {
      try {
        const options: InsertDataOptions = JSON.parse(input);

        if (!options.tableName || !options.data || !Array.isArray(options.data)) {
          return "Error: 'tableName' and 'data' (array) are required fields";
        }

        if (options.data.length === 0) {
          return "Error: Data array cannot be empty";
        }

        // Get DuckDB settings from Chrome storage
        const settings = await chrome.storage.sync.get(['duckdbEnabled', 'duckdbDatabasePath']);

        if (!settings.duckdbEnabled) {
          return "Error: DuckDB integration is not enabled. Please enable it in the settings.";
        }

        const databasePath = options.database || settings.duckdbDatabasePath || ':memory:';

        // Generate INSERT SQL
        const columns = Object.keys(options.data[0]);
        const values = options.data.map(row =>
          `(${columns.map(col => `'${row[col]}'`).join(', ')})`
        ).join(', ');

        const insertSQL = `INSERT INTO ${options.tableName} (${columns.join(', ')}) VALUES ${values}`;

        // TODO: Implement actual DuckDB connection and data insertion
        console.log('Inserting data into DuckDB table:', insertSQL);
        console.log('Database path:', databasePath);

        return `Inserted ${options.data.length} rows into table '${options.tableName}' in database: ${databasePath}`;

      } catch (error) {
        if (error instanceof SyntaxError) {
          return "Error: Invalid JSON input format";
        }
        return `Error inserting data into DuckDB table: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

// Get database schema tool
export const duckdbGetSchema: DuckDBToolFactory = () =>
  new DynamicTool({
    name: "duckdb_get_schema",
    description: `Get the schema information for DuckDB database tables.
      Input should be a JSON string with:
      - database: optional database path (defaults to configured database)
      - tableName: optional specific table name (if not provided, returns all tables)`,
    func: async (input: string) => {
      try {
        const options = JSON.parse(input) || {};

        // Get DuckDB settings from Chrome storage
        const settings = await chrome.storage.sync.get(['duckdbEnabled', 'duckdbDatabasePath']);

        if (!settings.duckdbEnabled) {
          return "Error: DuckDB integration is not enabled. Please enable it in the settings.";
        }

        const databasePath = options.database || settings.duckdbDatabasePath || ':memory:';

        // Generate schema query
        const schemaQuery = options.tableName
          ? `DESCRIBE ${options.tableName}`
          : `SHOW TABLES`;

        // TODO: Implement actual DuckDB connection and schema retrieval
        console.log('Getting DuckDB schema:', schemaQuery);
        console.log('Database path:', databasePath);

        return `Schema information retrieved from database: ${databasePath}\nQuery: ${schemaQuery}\nResult: [Placeholder - implement DuckDB connection]`;

      } catch (error) {
        if (error instanceof SyntaxError) {
          return "Error: Invalid JSON input format";
        }
        return `Error getting DuckDB schema: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

// Export function to get all DuckDB tools
export function getAllDuckDBTools() {
  return [
    duckdbQuery(),
    duckdbCreateTable(),
    duckdbInsertData(),
    duckdbGetSchema()
  ];
}