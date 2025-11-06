/**
 * Conversation Storage Service
 * Manages conversation history persistence based on tab URLs
 */

interface Message {
  type: 'system' | 'llm' | 'screenshot';
  content: string;
  imageData?: string;
  mediaType?: string;
  isComplete?: boolean;
  segmentId?: number;
  isStreaming?: boolean;
}

interface StreamingSegment {
  id: number;
  content: string;
  isComplete: boolean;
}

interface ConversationData {
  url: string;
  messages: Message[];
  streamingSegments: StreamingSegment[];
  timestamp: number;
  tabTitle?: string;
}

interface StoredConversations {
  [url: string]: ConversationData;
}

const STORAGE_KEY = 'browseronly_conversations';
const MAX_CONVERSATIONS = 50; // Maximum number of conversations to keep
const MAX_AGE_DAYS = 7; // Maximum age of conversations in days

export class ConversationStorageService {
  private static instance: ConversationStorageService;

  private constructor() {}

  public static getInstance(): ConversationStorageService {
    if (!ConversationStorageService.instance) {
      ConversationStorageService.instance = new ConversationStorageService();
    }
    return ConversationStorageService.instance;
  }

  /**
   * Normalize URL by removing query parameters and fragments
   * This groups conversations by the base URL
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Keep protocol, host, and pathname only
      return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    } catch (error) {
      console.error('Failed to normalize URL:', error);
      return url;
    }
  }

  /**
   * Save conversation for a specific URL
   */
  public async saveConversation(
    url: string,
    messages: Message[],
    streamingSegments: StreamingSegment[],
    tabTitle?: string
  ): Promise<void> {
    try {
      const normalizedUrl = this.normalizeUrl(url);

      // Get existing conversations
      const conversations = await this.getAllConversations();

      // Update or create conversation
      conversations[normalizedUrl] = {
        url: normalizedUrl,
        messages,
        streamingSegments,
        timestamp: Date.now(),
        tabTitle
      };

      // Cleanup old conversations
      await this.cleanupOldConversations(conversations);

      // Save to storage
      await chrome.storage.local.set({
        [STORAGE_KEY]: conversations
      });

      console.log(`Conversation saved for URL: ${normalizedUrl}`);
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  }

  /**
   * Load conversation for a specific URL
   */
  public async loadConversation(url: string): Promise<ConversationData | null> {
    try {
      const normalizedUrl = this.normalizeUrl(url);
      const conversations = await this.getAllConversations();

      const conversation = conversations[normalizedUrl];
      if (conversation) {
        console.log(`Conversation loaded for URL: ${normalizedUrl}`);
        return conversation;
      }

      return null;
    } catch (error) {
      console.error('Failed to load conversation:', error);
      return null;
    }
  }

  /**
   * Delete conversation for a specific URL
   */
  public async deleteConversation(url: string): Promise<void> {
    try {
      const normalizedUrl = this.normalizeUrl(url);
      const conversations = await this.getAllConversations();

      delete conversations[normalizedUrl];

      await chrome.storage.local.set({
        [STORAGE_KEY]: conversations
      });

      console.log(`Conversation deleted for URL: ${normalizedUrl}`);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  }

  /**
   * Get all stored conversations
   */
  private async getAllConversations(): Promise<StoredConversations> {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return result[STORAGE_KEY] || {};
    } catch (error) {
      console.error('Failed to get conversations:', error);
      return {};
    }
  }

  /**
   * Cleanup old conversations based on age and count limits
   */
  private async cleanupOldConversations(conversations: StoredConversations): Promise<void> {
    const now = Date.now();
    const maxAge = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

    // Filter out old conversations
    const validConversations: StoredConversations = {};
    for (const [url, data] of Object.entries(conversations)) {
      if (now - data.timestamp < maxAge) {
        validConversations[url] = data;
      }
    }

    // If still too many, keep only the most recent ones
    const urls = Object.keys(validConversations);
    if (urls.length > MAX_CONVERSATIONS) {
      // Sort by timestamp descending
      const sortedUrls = urls.sort((a, b) => {
        return validConversations[b].timestamp - validConversations[a].timestamp;
      });

      // Keep only the most recent MAX_CONVERSATIONS
      const toKeep = sortedUrls.slice(0, MAX_CONVERSATIONS);
      for (const url of urls) {
        if (!toKeep.includes(url)) {
          delete validConversations[url];
        }
      }
    }

    // Update conversations object
    Object.keys(conversations).forEach(key => delete conversations[key]);
    Object.assign(conversations, validConversations);
  }

  /**
   * Clear all conversations
   */
  public async clearAllConversations(): Promise<void> {
    try {
      await chrome.storage.local.remove(STORAGE_KEY);
      console.log('All conversations cleared');
    } catch (error) {
      console.error('Failed to clear conversations:', error);
    }
  }

  /**
   * Get list of all conversation URLs with metadata
   */
  public async getConversationList(): Promise<Array<{
    url: string;
    tabTitle?: string;
    messageCount: number;
    timestamp: number;
  }>> {
    try {
      const conversations = await this.getAllConversations();
      return Object.entries(conversations).map(([url, data]) => ({
        url,
        tabTitle: data.tabTitle,
        messageCount: data.messages.length,
        timestamp: data.timestamp
      }));
    } catch (error) {
      console.error('Failed to get conversation list:', error);
      return [];
    }
  }

  /**
   * Export conversation as JSON
   */
  public async exportConversation(url: string): Promise<string | null> {
    try {
      const conversation = await this.loadConversation(url);
      if (conversation) {
        return JSON.stringify(conversation, null, 2);
      }
      return null;
    } catch (error) {
      console.error('Failed to export conversation:', error);
      return null;
    }
  }
}
