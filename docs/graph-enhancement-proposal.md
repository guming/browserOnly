# Graph Enhancement Proposal for BrowserBee Vector Database

Based on the analysis of Microsoft RD-Agent's knowledge graph system, this document proposes enhancements to BrowserBee's vector database to add graph capabilities.

## Executive Summary

**Goal**: Transform BrowserBee's vector database from a simple similarity search system into a powerful knowledge graph that combines semantic search with relationship-based navigation.

**Key Benefits**:
- Navigate knowledge by relationships, not just similarity
- Build interconnected knowledge bases from browsed content
- Answer complex queries like "Find X related to Y through Z"
- Track concept dependencies and knowledge chains

## Proposed Architecture

### Phase 1: Graph Foundation (Week 1)

#### 1.1 Enhanced Data Model

**Current**:
```typescript
interface VectorDocument {
  id?: number;
  collectionName: string;
  documentId: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}
```

**Enhanced**:
```typescript
interface GraphNode extends VectorDocument {
  label: string;              // NEW: Node type/category (e.g., "webpage", "concept", "document")
  neighbors: string[];        // NEW: Array of connected document IDs
  neighborLabels?: string[];  // NEW: Corresponding labels for neighbors (same index)
}

interface GraphEdge {
  fromDocId: string;
  toDocId: string;
  edgeType?: string;  // e.g., "references", "similar_to", "part_of"
  weight?: number;    // Optional edge weight
  createdAt: number;
}
```

#### 1.2 Database Schema Changes

**New IndexedDB Store for Edges**:
```typescript
// In VectorService.initDB()

// Create edges store
if (!db.objectStoreNames.contains("edges")) {
  const edgesStore = db.createObjectStore("edges", {
    keyPath: "id",
    autoIncrement: true,
  });

  // Indexes for efficient lookup
  edgesStore.createIndex("fromDocId", "fromDocId", { unique: false });
  edgesStore.createIndex("toDocId", "toDocId", { unique: false });
  edgesStore.createIndex("edgeType", "edgeType", { unique: false });
  edgesStore.createIndex("fromTo", ["fromDocId", "toDocId"], { unique: true });
}
```

**Modified Documents Store**:
```typescript
// Add label field to documents
documentsStore.createIndex("label", "label", { unique: false });
documentsStore.createIndex("collectionLabel", ["collectionName", "label"], { unique: false });
```

### Phase 2: Core Graph Operations (Week 2)

#### 2.1 Edge Management

```typescript
class VectorService {
  /**
   * Add a directed or undirected edge between two documents
   */
  async addEdge(
    collectionName: string,
    fromDocId: string,
    toDocId: string,
    edgeType: string = "related",
    bidirectional: boolean = true
  ): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction(["edges", "documents"], "readwrite");
    const edgesStore = transaction.objectStore("edges");
    const docsStore = transaction.objectStore("documents");

    // Verify both documents exist
    const fromDoc = await this.getDocument(collectionName, fromDocId);
    const toDoc = await this.getDocument(collectionName, toDocId);

    if (!fromDoc || !toDoc) {
      throw new Error("Both documents must exist");
    }

    // Create edge(s)
    const edge: GraphEdge = {
      fromDocId,
      toDocId,
      edgeType,
      createdAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = edgesStore.add(edge);

      request.onsuccess = () => {
        // Update document neighbors
        this.updateDocumentNeighbors(collectionName, fromDocId, toDocId);

        if (bidirectional) {
          const reverseEdge = { ...edge, fromDocId: toDocId, toDocId: fromDocId };
          edgesStore.add(reverseEdge);
          this.updateDocumentNeighbors(collectionName, toDocId, fromDocId);
        }

        resolve();
      };

      request.onerror = () => reject(new Error("Failed to add edge"));
    });
  }

  /**
   * Get all neighbors of a document
   */
  async getNeighbors(
    collectionName: string,
    documentId: string
  ): Promise<VectorDocument[]> {
    const db = await this.initDB();
    const transaction = db.transaction(["edges", "documents"], "readonly");
    const edgesStore = transaction.objectStore("edges");
    const docsStore = transaction.objectStore("documents");
    const index = edgesStore.index("fromDocId");

    return new Promise((resolve, reject) => {
      const request = index.getAll(documentId);

      request.onsuccess = async () => {
        const edges = request.result as GraphEdge[];
        const neighborIds = edges.map(e => e.toDocId);

        // Fetch all neighbor documents
        const neighbors = await Promise.all(
          neighborIds.map(id => this.getDocument(collectionName, id))
        );

        resolve(neighbors.filter(n => n !== null) as VectorDocument[]);
      };

      request.onerror = () => reject(new Error("Failed to get neighbors"));
    });
  }

  /**
   * Remove an edge between two documents
   */
  async removeEdge(
    fromDocId: string,
    toDocId: string,
    bidirectional: boolean = true
  ): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction(["edges"], "readwrite");
    const edgesStore = transaction.objectStore("edges");
    const index = edgesStore.index("fromTo");

    return new Promise((resolve, reject) => {
      const request = index.getKey([fromDocId, toDocId]);

      request.onsuccess = () => {
        const key = request.result;
        if (key) {
          edgesStore.delete(key);
        }

        if (bidirectional) {
          const reverseRequest = index.getKey([toDocId, fromDocId]);
          reverseRequest.onsuccess = () => {
            const reverseKey = reverseRequest.result;
            if (reverseKey) {
              edgesStore.delete(reverseKey);
            }
            resolve();
          };
        } else {
          resolve();
        }
      };

      request.onerror = () => reject(new Error("Failed to remove edge"));
    });
  }
}
```

#### 2.2 Graph Traversal

```typescript
/**
 * BFS traversal to get all nodes within N steps
 */
async getNodesWithinSteps(
  collectionName: string,
  startDocId: string,
  maxSteps: number = 1,
  constraintLabels?: string[]
): Promise<VectorDocument[]> {
  const visited = new Set<string>();
  const queue: Array<{ docId: string; step: number }> = [
    { docId: startDocId, step: 0 }
  ];
  const results: VectorDocument[] = [];

  while (queue.length > 0) {
    const { docId, step } = queue.shift()!;

    if (step > maxSteps || visited.has(docId)) {
      continue;
    }

    visited.add(docId);

    // Get the document
    const doc = await this.getDocument(collectionName, docId);
    if (!doc) continue;

    // Check label constraint
    if (constraintLabels && !constraintLabels.includes(doc.label)) {
      continue;
    }

    // Add to results (excluding start node)
    if (docId !== startDocId) {
      results.push(doc);
    }

    // Get neighbors for next iteration
    if (step < maxSteps) {
      const neighbors = await this.getNeighbors(collectionName, docId);
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.documentId)) {
          queue.push({ docId: neighbor.documentId, step: step + 1 });
        }
      }
    }
  }

  return results;
}

/**
 * Find common neighbors of multiple nodes
 */
async getNodesIntersection(
  collectionName: string,
  documentIds: string[],
  maxSteps: number = 1
): Promise<VectorDocument[]> {
  if (documentIds.length < 2) {
    throw new Error("Need at least 2 documents for intersection");
  }

  // Get neighbors for each document
  const neighborSets = await Promise.all(
    documentIds.map(async (docId) => {
      const nodes = await this.getNodesWithinSteps(collectionName, docId, maxSteps);
      return new Set(nodes.map(n => n.documentId));
    })
  );

  // Find intersection
  let intersection = neighborSets[0];
  for (let i = 1; i < neighborSets.length; i++) {
    intersection = new Set(
      [...intersection].filter(id => neighborSets[i].has(id))
    );
  }

  // Fetch the actual documents
  const results = await Promise.all(
    [...intersection].map(id => this.getDocument(collectionName, id))
  );

  return results.filter(doc => doc !== null) as VectorDocument[];
}
```

### Phase 3: Hybrid Queries (Week 3)

#### 3.1 Combined Vector + Graph Search

```typescript
/**
 * Hybrid search: semantic similarity + graph traversal
 */
async hybridSearch(
  collectionName: string,
  queryEmbedding: number[],
  options: {
    topK?: number;
    minScore?: number;
    traversalSteps?: number;
    constraintLabels?: string[];
    constraintNodeId?: string;  // Must be connected to this node
    constraintDistance?: number; // Max distance from constraint node
  } = {}
): Promise<SearchResult[]> {
  const {
    topK = 5,
    minScore = 0.0,
    traversalSteps = 0,
    constraintLabels,
    constraintNodeId,
    constraintDistance = 0.5
  } = options;

  // Step 1: Semantic search
  const semanticResults = await this.searchSimilar(
    collectionName,
    queryEmbedding,
    topK * 2, // Get more results for filtering
    minScore
  );

  // If no traversal needed, return semantic results
  if (traversalSteps === 0 && !constraintNodeId) {
    return semanticResults.slice(0, topK);
  }

  // Step 2: Expand through graph traversal
  const expandedResults = new Map<string, SearchResult>();

  for (const result of semanticResults) {
    // Add the original result
    expandedResults.set(result.documentId, result);

    // Get connected nodes
    const connected = await this.getNodesWithinSteps(
      collectionName,
      result.documentId,
      traversalSteps,
      constraintLabels
    );

    // Add connected nodes with adjusted scores
    for (const node of connected) {
      if (!expandedResults.has(node.documentId)) {
        // Score decreases with graph distance
        const adjustedScore = result.score * 0.8; // Simple decay
        expandedResults.set(node.documentId, {
          documentId: node.documentId,
          content: node.content,
          metadata: node.metadata,
          score: adjustedScore
        });
      }
    }

    // Early exit if we have enough results
    if (expandedResults.size >= topK * 2) {
      break;
    }
  }

  // Step 3: Filter by constraint node if specified
  let finalResults = Array.from(expandedResults.values());

  if (constraintNodeId) {
    const constraintDoc = await this.getDocument(collectionName, constraintNodeId);
    if (constraintDoc && constraintDoc.embedding) {
      finalResults = finalResults.filter(result => {
        const doc = expandedResults.get(result.documentId);
        if (!doc) return false;

        // Calculate similarity to constraint node
        const similarity = this.cosineSimilarity(
          doc.embedding,
          constraintDoc.embedding
        );

        return similarity >= constraintDistance;
      });
    }
  }

  // Step 4: Sort by score and return top-k
  finalResults.sort((a, b) => b.score - a.score);
  return finalResults.slice(0, topK);
}
```

### Phase 4: Agent Tools (Week 4)

#### 4.1 New Graph Tools

```typescript
// src/agent/tools/graphTools.ts

export function addGraphEdge(page: Page) {
  return {
    name: "graph_add_edge",
    description: "Create a relationship edge between two documents in a vector collection. Edges can be bidirectional (default) or directional. Use this to connect related knowledge nodes.",
    func: async (input: string): Promise<string> => {
      try {
        const { collectionName, fromDocId, toDocId, edgeType, bidirectional } = JSON.parse(input);

        if (!collectionName || !fromDocId || !toDocId) {
          return "Error: Missing required fields (collectionName, fromDocId, toDocId)";
        }

        const vectorService = VectorService.getInstance();
        await vectorService.addEdge(
          collectionName,
          fromDocId,
          toDocId,
          edgeType || "related",
          bidirectional !== false
        );

        return `Edge created between '${fromDocId}' and '${toDocId}' in collection '${collectionName}'`;
      } catch (error) {
        return `Error adding edge: ${error.message}`;
      }
    }
  };
}

export function graphTraversal(page: Page) {
  return {
    name: "graph_traverse",
    description: "Traverse the knowledge graph from a starting document, returning all connected documents within N steps. Useful for finding related knowledge.",
    func: async (input: string): Promise<string> => {
      try {
        const { collectionName, startDocId, maxSteps, constraintLabels } = JSON.parse(input);

        if (!collectionName || !startDocId) {
          return "Error: Missing required fields (collectionName, startDocId)";
        }

        const vectorService = VectorService.getInstance();
        const results = await vectorService.getNodesWithinSteps(
          collectionName,
          startDocId,
          maxSteps || 1,
          constraintLabels
        );

        return JSON.stringify(results.map(r => ({
          documentId: r.documentId,
          content: r.content.substring(0, 100) + '...',
          label: r.label,
          metadata: r.metadata
        })), null, 2);
      } catch (error) {
        return `Error traversing graph: ${error.message}`;
      }
    }
  };
}

export function graphHybridSearch(page: Page) {
  return {
    name: "graph_hybrid_search",
    description: "Powerful hybrid search combining semantic similarity and graph relationships. Find documents similar to a query that are also connected through the knowledge graph.",
    func: async (input: string): Promise<string> => {
      try {
        const {
          collectionName,
          queryEmbedding,
          topK,
          minScore,
          traversalSteps,
          constraintLabels
        } = JSON.parse(input);

        if (!collectionName || !queryEmbedding) {
          return "Error: Missing required fields (collectionName, queryEmbedding)";
        }

        const vectorService = VectorService.getInstance();
        const results = await vectorService.hybridSearch(
          collectionName,
          queryEmbedding,
          {
            topK: topK || 5,
            minScore: minScore || 0.0,
            traversalSteps: traversalSteps || 1,
            constraintLabels
          }
        );

        return JSON.stringify(results.map(r => ({
          documentId: r.documentId,
          content: r.content.substring(0, 100) + '...',
          score: r.score.toFixed(4),
          metadata: r.metadata
        })), null, 2);
      } catch (error) {
        return `Error in hybrid search: ${error.message}`;
      }
    }
  };
}

export function graphIntersection(page: Page) {
  return {
    name: "graph_find_intersection",
    description: "Find common knowledge shared between multiple documents. Returns documents that are connected to all input documents within N steps.",
    func: async (input: string): Promise<string> => {
      try {
        const { collectionName, documentIds, maxSteps } = JSON.parse(input);

        if (!collectionName || !documentIds || documentIds.length < 2) {
          return "Error: Need collectionName and at least 2 documentIds";
        }

        const vectorService = VectorService.getInstance();
        const results = await vectorService.getNodesIntersection(
          collectionName,
          documentIds,
          maxSteps || 1
        );

        return JSON.stringify(results.map(r => ({
          documentId: r.documentId,
          content: r.content.substring(0, 100) + '...',
          label: r.label
        })), null, 2);
      } catch (error) {
        return `Error finding intersection: ${error.message}`;
      }
    }
  };
}
```

## Use Case Examples

### Use Case 1: Building a Knowledge Graph from Web Browsing

```
User: "Store this page and link it to my previous search about databases"

Agent workflow:
1. Extract page content
2. Generate embedding
3. vector_store: Save current page
4. vector_search: Find the "databases" document
5. graph_add_edge: Connect current page to databases document
```

### Use Case 2: Finding Related Documentation

```
User: "Find documentation related to both authentication and databases"

Agent workflow:
1. vector_search: Find docs about "authentication"
2. vector_search: Find docs about "databases"
3. graph_find_intersection: Find common connected docs
```

### Use Case 3: Knowledge Path Discovery

```
User: "How is React related to Node.js in my knowledge base?"

Agent workflow:
1. vector_search: Find "React" document
2. vector_search: Find "Node.js" document
3. graph_traverse: From React, traverse 3 steps
4. graph_traverse: From Node.js, traverse 3 steps
5. Analyze: Find shortest path between them
```

### Use Case 4: Semantic + Structural Search

```
User: "Find pages about JavaScript that are connected to my web development projects"

Agent workflow:
1. graph_hybrid_search: {
     query: "JavaScript",
     traversalSteps: 2,
     constraintLabels: ["project", "document"]
   }
2. Returns: JS docs connected to projects within 2 relationship hops
```

## Performance Optimizations

### 1. Caching Layer

```typescript
class GraphCache {
  private neighborCache = new Map<string, VectorDocument[]>();
  private traversalCache = new Map<string, VectorDocument[]>();

  getCachedNeighbors(docId: string): VectorDocument[] | null {
    return this.neighborCache.get(docId) || null;
  }

  setCachedNeighbors(docId: string, neighbors: VectorDocument[]): void {
    this.neighborCache.set(docId, neighbors);
  }

  invalidateCache(docId: string): void {
    this.neighborCache.delete(docId);
    // Invalidate related traversal caches
    for (const [key, _] of this.traversalCache) {
      if (key.includes(docId)) {
        this.traversalCache.delete(key);
      }
    }
  }
}
```

### 2. Batch Edge Operations

```typescript
async batchAddEdges(
  edges: Array<{
    collectionName: string;
    fromDocId: string;
    toDocId: string;
    edgeType?: string;
  }>
): Promise<void> {
  const db = await this.initDB();
  const transaction = db.transaction(["edges"], "readwrite");
  const store = transaction.objectStore("edges");

  for (const edge of edges) {
    store.add({
      fromDocId: edge.fromDocId,
      toDocId: edge.toDocId,
      edgeType: edge.edgeType || "related",
      createdAt: Date.now()
    });
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error("Batch add failed"));
  });
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('VectorService Graph Operations', () => {
  it('should add bidirectional edges', async () => {
    await vectorService.addEdge('test', 'doc1', 'doc2', 'related', true);

    const neighbors1 = await vectorService.getNeighbors('test', 'doc1');
    const neighbors2 = await vectorService.getNeighbors('test', 'doc2');

    expect(neighbors1.some(n => n.documentId === 'doc2')).toBe(true);
    expect(neighbors2.some(n => n.documentId === 'doc1')).toBe(true);
  });

  it('should traverse graph within N steps', async () => {
    // Create chain: A -> B -> C -> D
    await vectorService.addEdge('test', 'A', 'B');
    await vectorService.addEdge('test', 'B', 'C');
    await vectorService.addEdge('test', 'C', 'D');

    const results = await vectorService.getNodesWithinSteps('test', 'A', 2);

    expect(results).toHaveLength(2); // B and C
    expect(results.some(n => n.documentId === 'D')).toBe(false);
  });
});
```

## Migration Path

### For Existing Users

```typescript
/**
 * Migrate existing vector database to support graph features
 */
async migrateToGraphSchema(): Promise<void> {
  // 1. Add label field to existing documents (default to 'document')
  // 2. Create edges store
  // 3. Initialize empty neighbor arrays

  const db = await this.initDB();
  const transaction = db.transaction(['documents'], 'readwrite');
  const store = transaction.objectStore('documents');

  const allDocs = await new Promise<VectorDocument[]>((resolve) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
  });

  for (const doc of allDocs) {
    if (!doc.label) {
      doc.label = 'document';
    }
    if (!doc.neighbors) {
      doc.neighbors = [];
    }
    store.put(doc);
  }
}
```

## Timeline

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1 | Graph Foundation | Data models, schema migration, basic edge ops |
| 2 | Core Operations | BFS traversal, neighbor queries, intersection |
| 3 | Hybrid Queries | Combined vector+graph search |
| 4 | Agent Integration | New tools, documentation, examples |

## Conclusion

This enhancement transforms BrowserBee from a vector database into a full knowledge graph system, enabling:

✅ Relationship-based navigation
✅ Complex knowledge queries
✅ Automatic knowledge organization
✅ Powerful hybrid search

The IndexedDB foundation provides better scalability than RD-Agent's Pandas approach, while the graph structure enables RD-Agent's powerful query capabilities.
