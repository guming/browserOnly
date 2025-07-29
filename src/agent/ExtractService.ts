import { logWithTimestamp } from '../background/utils';
import { ConfigManager } from '../background/configManager';

export type ExtractResult = {
  id?: number;
  url: string;
  html: string;
  success: boolean;
  extractedContent?: string;
  error?: string;
  createdAt: number;
};

// const callbacks : SubAgentCallbacks = {};

const userInstruction = '只提取title和主要内容部分, 以及引用资料';

export const promptTemplate = `
Your task is to filter and convert HTML content into clean, focused markdown that's optimized for use with LLMs and information retrieval systems.

TASK DETAILS:
1. Content Selection
- DO: Keep essential information, main content, key details
- DO: Preserve hierarchical structure using markdown headers
- DO: Keep code blocks, tables, key lists
- DON'T: Include navigation menus, ads, footers, cookie notices
- DON'T: Keep social media widgets, sidebars, related content

2. Content Transformation
- DO: Use proper markdown syntax (#, ##, **, \`, etc)
- DO: Convert tables to markdown tables
- DO: Preserve code formatting with \`\`\`language blocks
- DO: Maintain link texts but remove tracking parameters
- DON'T: Include HTML tags in output
- DON'T: Keep class names, ids, or other HTML attributes

3. Content Organization
- DO: Maintain logical flow of information
- DO: Group related content under appropriate headers
- DO: Use consistent header levels
- DON'T: Fragment related content
- DON'T: Duplicate information

IMPORTANT: If user specific instruction is provided, ignore above guideline and prioritize those requirements over these general guidelines.

OUTPUT FORMAT: 
Wrap your response in <content> tags. Use proper markdown throughout.
<content>
[Your markdown content here]
</content>
`;




export type ExtractConfig = {
  userInstruction: string;
  promptTemplate: string;
};

export class ExtractService {
  private static instance: ExtractService;
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'browser-extracts';
  private readonly STORE_NAME = 'extract-results';
  private DB_VERSION = 1;
  private isInitialized = false;
  private configManager: ConfigManager;
  
  public static getInstance(): ExtractService {
    if (!ExtractService.instance) {
      ExtractService.instance = new ExtractService();
    }
    return ExtractService.instance;
  }
  
  private constructor() {
    this.configManager = ConfigManager.getInstance();
  }

  public async init(): Promise<void> {
    if (this.isInitialized) {
      logWithTimestamp(`ExtractService already initialized, skipping initialization`);
      return;
    }
    
    logWithTimestamp(`Initializing ExtractService with database ${this.DB_NAME}`);
    
    if (typeof indexedDB === 'undefined') {
      logWithTimestamp(`IndexedDB is not available in this environment`, 'error');
      throw new Error('IndexedDB is not available in this environment');
    }
    
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          
          if (!db.objectStoreNames.contains(this.STORE_NAME)) {
            const store = db.createObjectStore(this.STORE_NAME, { 
              keyPath: 'id', 
              autoIncrement: true 
            });
            
            store.createIndex('url', 'url', { unique: false });
            store.createIndex('createdAt', 'createdAt', { unique: false });
          }
        };
        
        request.onsuccess = (event) => {
          this.db = (event.target as IDBOpenDBRequest).result;
          this.isInitialized = true;
          logWithTimestamp(`Successfully opened ${this.DB_NAME} database`);
          resolve();
        };
        
        request.onerror = (event) => {
          const error = (event.target as IDBOpenDBRequest).error;
          logWithTimestamp(`Error opening ${this.DB_NAME} database: ${error?.message || 'Unknown error'}`, 'error');
          reject(error);
        };
      } catch (error) {
        logWithTimestamp(`Exception opening ${this.DB_NAME} database: ${error instanceof Error ? error.message : String(error)}`, 'error');
        reject(error);
      }
    });
  }
  
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
  }

  public async storeResult(result: ExtractResult): Promise<number> {
    await this.ensureInitialized();
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
        const store = transaction.objectStore(this.STORE_NAME);
        
        if (!result.createdAt) {
          result.createdAt = Date.now();
        }
        
        const request = store.add(result);
        
        request.onsuccess = (event) => {
          const id = (event.target as IDBRequest<number>).result;
          logWithTimestamp(`Successfully stored extract result with ID ${id} for URL ${result.url}`);
          resolve(id);
        };
        
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          logWithTimestamp(`Error storing extract result: ${error?.message || 'Unknown error'}`, 'error');
          reject(error);
        };
      } catch (error) {
        logWithTimestamp(`Exception storing extract result: ${error instanceof Error ? error.message : String(error)}`, 'error');
        reject(error);
      }
    });
  }

  public async extractContent(
    url: string,
    html: string,
    config: {
      prompt?: string;
      model?: string;
    } = {}
  ): Promise<ExtractResult> {
    await this.ensureInitialized();
    const result: ExtractResult = {
      url,
      html,
      success: false,
      createdAt: Date.now()
    };
    
    try {
      logWithTimestamp(`🔍 Extracting content from ${url}`);
      
      const finalPrompt = `
${promptTemplate}

<|HTML_CONTENT_START|>
${html}
<|HTML_CONTENT_END|>

<|USER_INSTRUCTION_START|>
${userInstruction}
<|USER_INSTRUCTION_END|>
`;

      const providerConfig = await this.configManager.getProviderConfig();
      // const subAgent = createSubAgent(providerConfig);
      // const returnValue = await subAgent.executPrompt(finalPrompt);
      
      logWithTimestamp(`✅ extract content finished: ${url}`);
      await this.storeResult(result);
      
    } catch (err: any) {
      logWithTimestamp(`❌ extract content failed: ${url}`, err);
      result.error = err.message || String(err);
      await this.storeResult(result);
    }
    
    return result;
  }

  public async getResultsByUrl(url: string): Promise<ExtractResult[]> {
    await this.ensureInitialized();
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
        const store = transaction.objectStore(this.STORE_NAME);
        const index = store.index('url');
        
        const request = index.getAll(url);
        
        request.onsuccess = (event) => {
          const results = (event.target as IDBRequest<ExtractResult[]>).result;
          resolve(results);
        };
        
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          logWithTimestamp(`Error retrieving extract results: ${error?.message || 'Unknown error'}`, 'error');
          reject(error);
        };
      } catch (error) {
        logWithTimestamp(`Exception retrieving extract results: ${error instanceof Error ? error.message : String(error)}`, 'error');
        reject(error);
      }
    });
  }
}