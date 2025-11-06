import { logWithTimestamp } from '../background/utils';
import type * as DuckDBNamespace from '@duckdb/duckdb-wasm';

/**
 * DuckDB loading status
 */
export enum DuckDBLoadStatus {
  NotInitialized = 'not_initialized',
  Downloading = 'downloading',
  Ready = 'ready',
  Error = 'error'
}

/**
 * Download progress callback
 */
export type ProgressCallback = (loaded: number, total: number, percentage: number) => void;

/**
 * Table information structure
 */
export interface TableInfo {
  name: string;
  rowCount: number;
  columns: ColumnInfo[];
  createdAt: number;
  fileName: string;
}

/**
 * Column information structure
 */
export interface ColumnInfo {
  name: string;
  type: string;
}

/**
 * Query result structure
 */
export interface QueryResult {
  columns: string[];
  rows: any[][];
  rowCount: number;
}

/**
 * DuckDBService - Manages DuckDB WASM instance for data analysis
 * Provides in-memory SQL database for uploaded CSV/JSON files
 */
export class DuckDBService {
  private static instance: DuckDBService | null = null;
  private db: DuckDBNamespace.AsyncDuckDB | null = null;
  private connection: DuckDBNamespace.AsyncDuckDBConnection | null = null;
  private isInitialized = false;
  private tables: Map<string, TableInfo> = new Map();
  private loadStatus: DuckDBLoadStatus = DuckDBLoadStatus.NotInitialized;
  private progressCallback: ProgressCallback | null = null;
  private errorMessage: string | null = null;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DuckDBService {
    if (!DuckDBService.instance) {
      DuckDBService.instance = new DuckDBService();
    }
    return DuckDBService.instance;
  }

  /**
   * Get current loading status
   */
  public getLoadStatus(): DuckDBLoadStatus {
    return this.loadStatus;
  }

  /**
   * Get error message if status is Error
   */
  public getErrorMessage(): string | null {
    return this.errorMessage;
  }

  /**
   * Set progress callback for download tracking
   */
  public setProgressCallback(callback: ProgressCallback | null): void {
    this.progressCallback = callback;
  }

  /**
   * Check if DuckDB is ready to use
   */
  public isReady(): boolean {
    return this.loadStatus === DuckDBLoadStatus.Ready && this.isInitialized;
  }

  /**
   * Initialize DuckDB WASM
   */
  public async init(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized && this.loadStatus === DuckDBLoadStatus.Ready) {
      logWithTimestamp('DuckDBService already initialized');
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      logWithTimestamp('DuckDBService initialization in progress, waiting...');
      return this.initializationPromise;
    }

    // Start initialization
    this.initializationPromise = this._performInit();

    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Perform actual initialization with progress tracking
   */
  private async _performInit(): Promise<void> {
    try {
      this.loadStatus = DuckDBLoadStatus.Downloading;
      this.errorMessage = null;
      logWithTimestamp('Initializing DuckDB WASM...');

      // Dynamically import DuckDB WASM module
      const duckdb = await import('@duckdb/duckdb-wasm');

      // Check if we're in a browser extension context
      const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

      // Use CDN for WASM file to reduce extension size
      const DUCKDB_VERSION = '1.30.0';
      const wasmUrl = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VERSION}/dist/duckdb-eh.wasm`;

      // Worker file stays local (only 753KB)
      const baseUrl = isExtension
        ? chrome.runtime.getURL('duckdb/')
        : '/duckdb/';
      const workerUrl = baseUrl + 'duckdb-browser-eh.worker.js';

      logWithTimestamp(`Loading DuckDB WASM from CDN: ${wasmUrl}`);

      // Pre-fetch WASM file with progress tracking (for progress UI only)
      // The actual loading will be done by DuckDB
      await this._fetchWithProgress(wasmUrl);

      logWithTimestamp(`DuckDB WASM downloaded successfully`);

      // Create custom bundle using local files
      const customBundle: DuckDBNamespace.DuckDBBundle = {
        mainModule: wasmUrl,
        mainWorker: workerUrl,
        pthreadWorker: null, // Not needed for single-threaded mode
      };

      logWithTimestamp(`Using local DuckDB bundle: ${customBundle.mainWorker}`);

      // Instantiate worker
      const worker = new Worker(customBundle.mainWorker!);
      const logger = new duckdb.ConsoleLogger();

      // Initialize database
      this.db = new duckdb.AsyncDuckDB(logger, worker);
      await this.db.instantiate(customBundle.mainModule, customBundle.pthreadWorker);

      // Open connection
      this.connection = await this.db.connect();

      this.isInitialized = true;
      this.loadStatus = DuckDBLoadStatus.Ready;
      logWithTimestamp('DuckDB WASM initialized successfully with local files');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.errorMessage = errorMsg;
      this.loadStatus = DuckDBLoadStatus.Error;
      this.isInitialized = false;

      logWithTimestamp(
        `Error initializing DuckDB: ${errorMsg}`,
        'error'
      );

      // Rethrow error with network requirement notice
      throw new Error(`Failed to initialize DuckDB: ${errorMsg}\n\nNote: Data Analyze feature requires internet connection to download DuckDB engine (~32MB) from CDN.`);
    }
  }

  /**
   * Fetch file with progress tracking
   */
  private async _fetchWithProgress(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      chunks.push(value);
      loaded += value.length;

      // Call progress callback
      if (this.progressCallback && total > 0) {
        const percentage = Math.round((loaded / total) * 100);
        this.progressCallback(loaded, total, percentage);
      }
    }

    // Combine chunks into single ArrayBuffer
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result.buffer;
  }

  /**
   * Ensure database is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }

    if (!this.isInitialized || !this.connection) {
      throw new Error('DuckDB is not available. This may be due to browser extension limitations or network restrictions. DuckDB WASM requires loading external resources which may be blocked.');
    }
  }

  /**
   * Check if DuckDB is available
   */
  public isAvailable(): boolean {
    return this.isInitialized && this.connection !== null;
  }

  /**
   * Sanitize table name (remove special characters, ensure valid SQL identifier)
   */
  private sanitizeTableName(name: string): string {
    // Remove file extension
    let tableName = name.replace(/\.(csv|json|txt|xlsx|xls)$/i, '');

    // Replace special characters with underscore
    tableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');

    // Ensure it starts with a letter
    if (!/^[a-zA-Z]/.test(tableName)) {
      tableName = 't_' + tableName;
    }

    // Limit length
    tableName = tableName.substring(0, 64);

    return tableName.toLowerCase();
  }

  /**
   * Detect column type from sample values
   */
  private detectColumnType(values: string[]): string {
    // Sample first non-empty values
    const samples = values.filter(v => v && v.trim()).slice(0, 100);

    if (samples.length === 0) {
      return 'VARCHAR';
    }

    // Check if all values are numbers
    const allNumbers = samples.every(v => !isNaN(parseFloat(v)) && isFinite(parseFloat(v)));
    if (allNumbers) {
      // Check if integers
      const allIntegers = samples.every(v => Number.isInteger(parseFloat(v)));
      return allIntegers ? 'INTEGER' : 'DOUBLE';
    }

    // Check if all values are booleans
    const allBooleans = samples.every(v =>
      v.toLowerCase() === 'true' ||
      v.toLowerCase() === 'false' ||
      v === '0' ||
      v === '1'
    );
    if (allBooleans) {
      return 'BOOLEAN';
    }

    // Check if dates (basic check)
    const datePattern = /^\d{4}-\d{2}-\d{2}/;
    const allDates = samples.every(v => datePattern.test(v));
    if (allDates) {
      return 'DATE';
    }

    // Default to VARCHAR
    return 'VARCHAR';
  }

  /**
   * Create table from CSV data
   */
  public async createTableFromCSV(
    fileName: string,
    csvContent: string
  ): Promise<string> {
    await this.ensureInitialized();

    try {
      const tableName = this.sanitizeTableName(fileName);
      logWithTimestamp(`Creating table "${tableName}" from CSV file "${fileName}"`);

      // Parse CSV
      const lines = csvContent.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        throw new Error('CSV file must have at least a header row and one data row');
      }

      // Parse header
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

      // Sanitize column names
      const columns = headers.map(h => {
        let colName = h.replace(/[^a-zA-Z0-9_]/g, '_');
        if (!/^[a-zA-Z]/.test(colName)) {
          colName = 'col_' + colName;
        }
        return colName.toLowerCase();
      });

      // Parse data rows
      const dataRows = lines.slice(1).map(line =>
        line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
      );

      // Detect column types
      const columnTypes = columns.map((col, idx) => {
        const values = dataRows.map(row => row[idx] || '');
        return this.detectColumnType(values);
      });

      // Drop table if exists
      await this.connection!.query(`DROP TABLE IF EXISTS ${tableName}`);

      // Create table
      const createTableSQL = `
        CREATE TABLE ${tableName} (
          ${columns.map((col, idx) => `"${col}" ${columnTypes[idx]}`).join(', ')}
        )
      `;

      await this.connection!.query(createTableSQL);
      logWithTimestamp(`Created table schema for ${tableName}`);

      // Insert data
      for (const row of dataRows) {
        const values = row.map((val, idx) => {
          if (!val || val === '') return 'NULL';

          const colType = columnTypes[idx];
          if (colType === 'VARCHAR' || colType === 'DATE') {
            return `'${val.replace(/'/g, "''")}'`; // Escape single quotes
          }
          return val;
        });

        const insertSQL = `INSERT INTO ${tableName} VALUES (${values.join(', ')})`;
        await this.connection!.query(insertSQL);
      }

      // Get row count
      const countResult = await this.connection!.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const rowCount = countResult.toArray()[0].count;

      // Store table info
      const tableInfo: TableInfo = {
        name: tableName,
        rowCount: Number(rowCount),
        columns: columns.map((col, idx) => ({
          name: col,
          type: columnTypes[idx]
        })),
        createdAt: Date.now(),
        fileName
      };

      this.tables.set(tableName, tableInfo);

      logWithTimestamp(`Successfully created table ${tableName} with ${rowCount} rows`);
      return tableName;
    } catch (error) {
      logWithTimestamp(
        `Error creating table from CSV: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
      throw error;
    }
  }

  /**
   * Create table from JSON data
   */
  public async createTableFromJSON(
    fileName: string,
    jsonContent: string
  ): Promise<string> {
    await this.ensureInitialized();

    try {
      const tableName = this.sanitizeTableName(fileName);
      logWithTimestamp(`Creating table "${tableName}" from JSON file "${fileName}"`);

      // Parse JSON
      const data = JSON.parse(jsonContent);

      if (!Array.isArray(data)) {
        throw new Error('JSON must be an array of objects');
      }

      if (data.length === 0) {
        throw new Error('JSON array is empty');
      }

      // Get columns from first object
      const firstObj = data[0];
      const columns = Object.keys(firstObj);

      if (columns.length === 0) {
        throw new Error('JSON objects must have at least one property');
      }

      // Detect column types
      const columnTypes = columns.map(col => {
        const values = data.map(obj => String(obj[col] ?? ''));
        return this.detectColumnType(values);
      });

      // Sanitize column names
      const sanitizedColumns = columns.map(col => {
        let colName = col.replace(/[^a-zA-Z0-9_]/g, '_');
        if (!/^[a-zA-Z]/.test(colName)) {
          colName = 'col_' + colName;
        }
        return colName.toLowerCase();
      });

      // Drop table if exists
      await this.connection!.query(`DROP TABLE IF EXISTS ${tableName}`);

      // Create table
      const createTableSQL = `
        CREATE TABLE ${tableName} (
          ${sanitizedColumns.map((col, idx) => `"${col}" ${columnTypes[idx]}`).join(', ')}
        )
      `;

      await this.connection!.query(createTableSQL);
      logWithTimestamp(`Created table schema for ${tableName}`);

      // Insert data
      for (const obj of data) {
        const values = columns.map((col, idx) => {
          const val = obj[col];
          if (val === null || val === undefined || val === '') return 'NULL';

          const colType = columnTypes[idx];
          if (colType === 'VARCHAR' || colType === 'DATE') {
            return `'${String(val).replace(/'/g, "''")}'`;
          }
          return String(val);
        });

        const insertSQL = `INSERT INTO ${tableName} VALUES (${values.join(', ')})`;
        await this.connection!.query(insertSQL);
      }

      // Get row count
      const countResult = await this.connection!.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const rowCount = countResult.toArray()[0].count;

      // Store table info
      const tableInfo: TableInfo = {
        name: tableName,
        rowCount: Number(rowCount),
        columns: sanitizedColumns.map((col, idx) => ({
          name: col,
          type: columnTypes[idx]
        })),
        createdAt: Date.now(),
        fileName
      };

      this.tables.set(tableName, tableInfo);

      logWithTimestamp(`Successfully created table ${tableName} with ${rowCount} rows`);
      return tableName;
    } catch (error) {
      logWithTimestamp(
        `Error creating table from JSON: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
      throw error;
    }
  }

  /**
   * Execute SQL query
   */
  public async query(sql: string): Promise<QueryResult> {
    await this.ensureInitialized();

    try {
      logWithTimestamp(`Executing query: ${sql.substring(0, 100)}...`);

      const result = await this.connection!.query(sql);
      const arrow = result.toArray();

      // Extract column names
      const columns = result.schema.fields.map(f => f.name);

      // Convert to rows
      const rows = arrow.map(row =>
        columns.map(col => row[col])
      );

      logWithTimestamp(`Query returned ${rows.length} rows`);

      return {
        columns,
        rows,
        rowCount: rows.length
      };
    } catch (error) {
      logWithTimestamp(
        `Error executing query: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
      throw error;
    }
  }

  /**
   * List all tables
   */
  public async listTables(): Promise<TableInfo[]> {
    await this.ensureInitialized();
    return Array.from(this.tables.values());
  }

  /**
   * Get table info
   */
  public async getTableInfo(tableName: string): Promise<TableInfo | null> {
    await this.ensureInitialized();
    return this.tables.get(tableName) || null;
  }

  /**
   * Drop table
   */
  public async dropTable(tableName: string): Promise<void> {
    await this.ensureInitialized();

    try {
      await this.connection!.query(`DROP TABLE IF EXISTS ${tableName}`);
      this.tables.delete(tableName);
      logWithTimestamp(`Dropped table ${tableName}`);
    } catch (error) {
      logWithTimestamp(
        `Error dropping table: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
      throw error;
    }
  }

  /**
   * Clear all tables
   */
  public async clearAllTables(): Promise<void> {
    await this.ensureInitialized();

    try {
      for (const tableName of this.tables.keys()) {
        await this.connection!.query(`DROP TABLE IF EXISTS ${tableName}`);
      }
      this.tables.clear();
      logWithTimestamp('Cleared all tables');
    } catch (error) {
      logWithTimestamp(
        `Error clearing tables: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
      throw error;
    }
  }

  /**
   * Get preview of table data (first N rows)
   */
  public async getTablePreview(tableName: string, limit: number = 10): Promise<QueryResult> {
    return this.query(`SELECT * FROM ${tableName} LIMIT ${limit}`);
  }

  /**
   * Get table schema
   */
  public async describeTable(tableName: string): Promise<string> {
    await this.ensureInitialized();

    const tableInfo = this.tables.get(tableName);
    if (!tableInfo) {
      throw new Error(`Table ${tableName} not found`);
    }

    const lines = [
      `Table: ${tableName}`,
      `File: ${tableInfo.fileName}`,
      `Rows: ${tableInfo.rowCount}`,
      `Created: ${new Date(tableInfo.createdAt).toLocaleString()}`,
      '',
      'Columns:',
      ...tableInfo.columns.map(col => `  - ${col.name} (${col.type})`)
    ];

    return lines.join('\n');
  }
}
