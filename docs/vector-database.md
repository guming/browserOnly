# Vector Database Feature

The Vector Database feature provides a custom, browser-based vector storage and similarity search system built on IndexedDB. This allows BrowserBee to store document embeddings and perform semantic search operations locally in the browser.

## Overview

The vector database system consists of three main components:

1. **VectorService** (`src/tracking/vectorService.ts`) - Core service managing IndexedDB operations
2. **Vector Tools** (`src/agent/tools/vectorTools.ts`) - Agent tools for interacting with the vector database
3. **Type Definitions** (`src/types/vectorDatabase.ts`) - TypeScript interfaces and types

## Features

- ✅ **Local Storage**: All data stored in browser IndexedDB (no external dependencies)
- ✅ **Cosine Similarity Search**: Fast similarity search using cosine distance
- ✅ **Collection Management**: Organize vectors into named collections
- ✅ **Metadata Support**: Attach custom metadata to documents
- ✅ **CRUD Operations**: Full support for create, read, update, delete
- ✅ **Dimension Validation**: Ensures all embeddings match collection dimension
- ✅ **Type Safety**: Full TypeScript support with comprehensive types

## Architecture

### Vector Document Structure

```typescript
interface VectorDocument {
  id?: number;                    // Auto-generated
  collectionName: string;          // Collection identifier
  documentId: string;              // Unique document ID
  content: string;                 // Document text
  embedding: number[];             // Vector embedding
  metadata?: Record<string, unknown>; // Optional metadata
  createdAt: number;               // Creation timestamp
  updatedAt: number;               // Last update timestamp
}
```

### Collection Structure

```typescript
interface VectorCollection {
  name: string;          // Unique collection name
  dimension: number;     // Embedding dimension (e.g., 384, 1536)
  documentCount: number; // Number of documents
  createdAt: number;     // Creation timestamp
  updatedAt: number;     // Last update timestamp
}
```

## Available Tools

The following tools are available to the agent:

### 1. `vector_create_collection`

Create a new collection for storing embeddings.

**Input:**
```json
{
  "collectionName": "my_documents",
  "dimension": 384
}
```

**Example:**
```
Create a vector collection named "web_pages" with dimension 1536
```

### 2. `vector_list_collections`

List all available collections with metadata.

**Input:** None

**Output:**
```json
[
  {
    "name": "web_pages",
    "dimension": 1536,
    "documentCount": 42,
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T15:45:00.000Z"
  }
]
```

### 3. `vector_delete_collection`

Delete a collection and all its documents.

**Input:** Collection name (string)

**Example:**
```
Delete the "old_documents" collection
```

### 4. `vector_store`

Store a document with its embedding.

**Input:**
```json
{
  "collectionName": "web_pages",
  "documentId": "page_001",
  "content": "This is the page content...",
  "embedding": [0.123, 0.456, ...],
  "metadata": {
    "url": "https://example.com",
    "title": "Example Page",
    "date": "2025-01-15"
  }
}
```

**Note:** The embedding array must match the collection's dimension.

### 5. `vector_search`

Search for similar documents using a query embedding.

**Input:**
```json
{
  "collectionName": "web_pages",
  "queryEmbedding": [0.123, 0.456, ...],
  "topK": 5,
  "minScore": 0.5
}
```

**Output:**
```json
[
  {
    "documentId": "page_001",
    "content": "This is the page content...",
    "score": "0.9234",
    "metadata": {
      "url": "https://example.com",
      "title": "Example Page"
    }
  }
]
```

**Parameters:**
- `topK`: Number of results to return (default: 5)
- `minScore`: Minimum similarity score 0-1 (default: 0.0)

### 6. `vector_get_document`

Retrieve a specific document by ID.

**Input:**
```json
{
  "collectionName": "web_pages",
  "documentId": "page_001"
}
```

### 7. `vector_delete_document`

Delete a specific document from a collection.

**Input:**
```json
{
  "collectionName": "web_pages",
  "documentId": "page_001"
}
```

### 8. `vector_list_documents`

List all documents in a collection (with truncated content).

**Input:** Collection name (string)

### 9. `vector_clear_all`

Clear all vector data (use with caution).

**Input:** None

## Usage Examples

### Example 1: Storing Web Page Content

```typescript
// Agent workflow:

// 1. Create a collection for web pages
{
  "collectionName": "browsing_history",
  "dimension": 1536  // OpenAI embedding dimension
}

// 2. Store a web page (you'll need to generate embeddings separately)
{
  "collectionName": "browsing_history",
  "documentId": "github_browserbee",
  "content": "BrowserBee is a browser automation tool...",
  "embedding": [...], // 1536-dimensional embedding
  "metadata": {
    "url": "https://github.com/gumingcn/browserbee",
    "title": "BrowserBee - GitHub",
    "visitedAt": "2025-01-15T10:00:00Z"
  }
}

// 3. Search for similar pages
{
  "collectionName": "browsing_history",
  "queryEmbedding": [...], // Embedding of search query
  "topK": 3,
  "minScore": 0.7
}
```

### Example 2: Document Knowledge Base

```typescript
// Create a knowledge base collection
{
  "collectionName": "documentation",
  "dimension": 384  // Sentence Transformers dimension
}

// Store multiple documents
{
  "collectionName": "documentation",
  "documentId": "install_guide",
  "content": "To install BrowserBee, follow these steps...",
  "embedding": [...],
  "metadata": {
    "category": "installation",
    "version": "0.4.0"
  }
}

// Search the knowledge base
{
  "collectionName": "documentation",
  "queryEmbedding": [...], // "how to install" embedding
  "topK": 5
}
```

## Embedding Generation

The vector database stores embeddings but **does not generate them**. You need to generate embeddings using an external service or model. Common options:

### Embedding Dimensions by Provider

| Provider | Model | Dimension |
|----------|-------|-----------|
| OpenAI | text-embedding-ada-002 | 1536 |
| OpenAI | text-embedding-3-small | 1536 |
| OpenAI | text-embedding-3-large | 3072 |
| Sentence Transformers | all-MiniLM-L6-v2 | 384 |
| Sentence Transformers | all-mpnet-base-v2 | 768 |
| Cohere | embed-english-v3.0 | 1024 |
| Google | textembedding-gecko | 768 |

### Example: Using OpenAI to Generate Embeddings

```typescript
// This is conceptual - actual implementation depends on your setup
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: 'your-api-key' });

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  return response.data[0].embedding;
}

// Use in agent workflow
const content = "Document content here...";
const embedding = await generateEmbedding(content);

// Store in vector database
{
  "collectionName": "my_docs",
  "documentId": "doc_1",
  "content": content,
  "embedding": embedding
}
```

## Similarity Search Algorithm

The vector database uses **cosine similarity** for searching:

```typescript
similarity = (A · B) / (||A|| × ||B||)
```

Where:
- `A · B` is the dot product of vectors A and B
- `||A||` and `||B||` are the magnitudes (norms) of the vectors
- Result is a value between -1 and 1 (higher = more similar)

For search results, scores are typically between 0 and 1, where:
- **1.0** = Identical vectors
- **0.8-0.9** = Very similar
- **0.6-0.8** = Moderately similar
- **0.4-0.6** = Somewhat similar
- **< 0.4** = Not very similar

## Performance Considerations

### Storage Limits

IndexedDB storage limits vary by browser:
- **Chrome**: ~60% of available disk space
- **Firefox**: ~50% of available disk space
- **Safari**: ~1GB (requests permission for more)

### Search Performance

- **Small collections** (< 1,000 docs): Near-instant search
- **Medium collections** (1,000-10,000 docs): < 100ms
- **Large collections** (> 10,000 docs): 100-500ms

For very large datasets, consider:
1. Splitting into multiple collections
2. Using external vector databases (Pinecone, Weaviate, Chroma)
3. Implementing approximate nearest neighbor search

### Memory Usage

Each document stores:
- Content: ~size of text in bytes
- Embedding: ~4 bytes × dimension (e.g., 6KB for 1536-dim)
- Metadata: ~varies

**Example:** 1,000 documents with 1536-dim embeddings ≈ 6-10 MB

## Integration with Agent

The vector tools are automatically available to the BrowserAgent. The agent can:

1. **Create collections** for different content types
2. **Store documents** as it browses the web
3. **Search for relevant documents** when answering questions
4. **Manage collections** based on user needs

### Example Agent Conversation

```
User: "Store the content of this page in my research collection"

Agent:
1. Uses vector_create_collection if collection doesn't exist
2. Extracts page content
3. Generates embedding (using configured LLM or external service)
4. Uses vector_store to save the document

User: "Find similar pages about browser automation"

Agent:
1. Generates embedding for "browser automation"
2. Uses vector_search to find similar documents
3. Returns top results with links and summaries
```

## Error Handling

The vector tools provide detailed error messages:

- `Collection 'name' does not exist. Create it first.`
- `Embedding dimension (X) does not match collection dimension (Y)`
- `Document 'id' not found in collection 'name'`
- `Failed to store document: [reason]`

## Future Enhancements

Potential improvements to consider:

1. **Automatic Embedding Generation**: Integrate with LLM providers for automatic embedding
2. **Hybrid Search**: Combine vector search with keyword search
3. **Filtering**: Add metadata-based filtering to search results
4. **Indexing**: Implement approximate nearest neighbor (ANN) algorithms
5. **Export/Import**: Bulk operations for backup and restore
6. **Statistics**: Dashboard showing vector database usage and stats

## API Reference

### VectorService Methods

```typescript
class VectorService {
  // Collection operations
  createCollection(name: string, dimension: number): Promise<void>
  getCollection(name: string): Promise<VectorCollection | null>
  listCollections(): Promise<VectorCollection[]>
  deleteCollection(name: string): Promise<void>

  // Document operations
  storeDocument(
    collectionName: string,
    documentId: string,
    content: string,
    embedding: number[],
    metadata?: Record<string, unknown>
  ): Promise<number>

  getDocument(collectionName: string, documentId: string): Promise<VectorDocument | null>
  deleteDocument(collectionName: string, documentId: string): Promise<void>
  getDocumentsByCollection(collectionName: string): Promise<VectorDocument[]>

  // Search operations
  searchSimilar(
    collectionName: string,
    queryEmbedding: number[],
    topK?: number,
    minScore?: number
  ): Promise<SearchResult[]>

  // Utility operations
  clearAll(): Promise<void>
}
```

## Troubleshooting

### Issue: "Collection does not exist"
**Solution:** Create the collection first using `vector_create_collection`

### Issue: "Dimension mismatch"
**Solution:** Ensure your embeddings match the collection's dimension

### Issue: "No results found"
**Solution:** Try lowering the `minScore` threshold or check if documents exist

### Issue: "Failed to open vector database"
**Solution:** Check browser console for IndexedDB errors, try clearing browser data

## Conclusion

The Vector Database feature provides a powerful, local storage solution for semantic search in BrowserBee. It enables the agent to build knowledge bases, remember visited pages, and perform intelligent information retrieval without relying on external services.
