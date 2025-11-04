# Knowledge Graph - TypeScript Implementation (RD-Agent Style)

This is a complete TypeScript implementation of Microsoft RD-Agent's knowledge graph system for BrowserBee. It provides a hybrid knowledge management system combining vector search and graph traversal.

## Overview

The implementation includes:

1. **KnowledgeMetaData** - Base class for knowledge nodes with content, embeddings, and chunking
2. **MemoryVectorBase** - In-memory vector storage with Pandas-like operations
3. **UndirectedNode** - Graph nodes with bidirectional edges
4. **UndirectedGraph** - Full graph implementation with hybrid queries
5. **Agent Tools** - 10 tools for agent to interact with the knowledge graph

## Architecture

### Component Structure

```
tracking/
├── knowledgeMetaData.ts    - Base node class with embeddings
├── graphVectorBase.ts      - Vector storage (Pandas-like)
└── knowledgeGraph.ts       - Graph classes and algorithms

agent/tools/
└── knowledgeGraphTools.ts  - Agent tools for graph operations
```

### Class Hierarchy

```typescript
KnowledgeMetaData
├── content: string
├── label: string
├── embedding: number[]
├── trunks: string[]         // Content chunks
└── trunksEmbedding: number[][] // Chunk embeddings

UndirectedNode extends KnowledgeMetaData
├── neighbors: Set<UndirectedNode>
└── appendix: any

UndirectedGraph
├── nodes: Map<string, UndirectedNode>
├── vectorBase: MemoryVectorBase
└── embeddingFn: (texts) => Promise<number[][]>
```

## Core Features

### 1. Deterministic UUID Generation

```typescript
import { v5 as uuidv5 } from 'uuid';

// Same content always generates the same ID
const node = new UndirectedNode("Vector databases are great", "concept");
console.log(node.id); // Always the same UUID for this content
```

### 2. Content Chunking

```typescript
const node = new UndirectedNode(longDocumentText, "document");

// Split into 1000-character chunks with 100-char overlap
node.splitIntoTrunks(1000, 100);

console.log(node.trunks.length); // Number of chunks
```

### 3. Lazy Embedding Creation

```typescript
// Define embedding function (e.g., using OpenAI)
async function createEmbeddings(texts: string[]): Promise<number[][]> {
  // Call your embedding service
  return await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: texts,
  }).then(r => r.data.map(d => d.embedding));
}

// Set embedding function for graph
const graph = new UndirectedGraph(createEmbeddings);

// Embeddings are created automatically when nodes are added
const node = new UndirectedNode("Knowledge content", "concept");
await graph.addNode(node); // Embedding created here
```

### 4. Bidirectional Edges

```typescript
const concept1 = new UndirectedNode("Machine Learning", "concept");
const concept2 = new UndirectedNode("Neural Networks", "concept");

// Add edge - automatically bidirectional
await graph.addNode(concept1, concept2);

console.log(concept1.neighbors.has(concept2)); // true
console.log(concept2.neighbors.has(concept1)); // true
```

### 5. Semantic Search

```typescript
// Search by text (embedding created automatically)
const results = await graph.semanticSearch(
  "artificial intelligence",
  0.7,  // similarity threshold
  5,    // top 5 results
  ["concept", "technology"] // filter by labels
);

console.log(results); // Array of UndirectedNode
```

### 6. Graph Traversal (BFS)

```typescript
const startNode = await graph.getNodeByContent("Vector databases");

// Get all nodes within 2 steps
const connectedNodes = await graph.getNodesWithinSteps(
  startNode,
  2,  // max steps
  ["concept", "technology"] // constraint labels
);

console.log(connectedNodes.length); // Nodes within 2 hops
```

### 7. Hybrid Queries

```typescript
// Combine semantic search + graph traversal
const results = await graph.queryByContent(
  "machine learning algorithms",
  5,   // top 5
  2,   // traverse 2 steps from similar nodes
  ["concept", "algorithm"], // label filter
  undefined, // constraint node
  0.6  // similarity threshold
);

// Results: Nodes similar to query OR connected to similar nodes
```

### 8. Intersection Queries

```typescript
const aiNode = await graph.getNodeByContent("artificial intelligence");
const dbNode = await graph.getNodeByContent("databases");

// Find concepts connected to BOTH AI and databases
const commonConcepts = await graph.getNodesIntersection(
  [aiNode, dbNode],
  2,  // within 2 steps
  ["concept"] // only concepts
);

console.log(commonConcepts); // Common knowledge
```

## Agent Tools

### Tool 1: kg_create_node

Create a new node in the knowledge graph.

**Input:**
```json
{
  "content": "Vector databases enable semantic search",
  "label": "concept",
  "embedding": [0.1, 0.2, ...],  // Optional
  "appendix": {"source": "research paper"}  // Optional
}
```

**Example:**
```
Create a knowledge node with content "Browser automation with AI" and label "technology"
```

### Tool 2: kg_add_edge

Create a bidirectional edge between two nodes.

**Input:**
```json
{
  "node1Content": "Vector databases",
  "node1Label": "technology",
  "node2Content": "Semantic search",
  "node2Label": "concept"
}
```

**Example:**
```
Add an edge between "Machine Learning" (concept) and "Neural Networks" (algorithm)
```

### Tool 3: kg_list_nodes

List all nodes in the graph, optionally filtered by labels.

**Input (optional):**
```json
{
  "labels": ["concept", "technology"]
}
```

**Output:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "label": "concept",
    "content": "Vector databases enable...",
    "hasEmbedding": true,
    "neighborCount": 3
  }
]
```

### Tool 4: kg_search

Semantic search in the knowledge graph.

**Input:**
```json
{
  "query": "machine learning",
  "topK": 5,
  "similarityThreshold": 0.7,
  "constraintLabels": ["concept", "algorithm"]
}
```

**Output:**
```json
[
  {
    "id": "...",
    "label": "concept",
    "content": "Machine learning is...",
    "neighborCount": 5
  }
]
```

### Tool 5: kg_traverse

Traverse the graph using BFS from a starting node.

**Input:**
```json
{
  "nodeId": "550e8400-...",
  "steps": 2,
  "constraintLabels": ["concept"],
  "block": false
}
```

**Or identify by content:**
```json
{
  "content": "Vector databases",
  "label": "technology",
  "steps": 2
}
```

### Tool 6: kg_hybrid_query

Powerful hybrid query combining search + traversal.

**Input:**
```json
{
  "query": ["machine learning", "databases"],
  "topK": 10,
  "step": 2,
  "similarityThreshold": 0.6,
  "constraintLabels": ["concept", "technology"]
}
```

### Tool 7: kg_find_intersection

Find nodes connected to ALL specified nodes.

**Input:**
```json
{
  "nodeIds": ["id1", "id2", "id3"],
  "steps": 2,
  "constraintLabels": ["concept"]
}
```

**Or:**
```json
{
  "nodes": [
    {"content": "AI", "label": "concept"},
    {"content": "Databases", "label": "technology"}
  ],
  "steps": 2
}
```

### Tool 8: kg_get_stats

Get statistics about the knowledge graph.

**Output:**
```json
{
  "totalNodes": 150,
  "labels": {
    "concept": 80,
    "technology": 50,
    "algorithm": 20
  },
  "totalEdges": 300,
  "avgNeighbors": 2.0,
  "nodesWithEmbeddings": 150
}
```

### Tool 9: kg_get_node

Get detailed information about a specific node.

**Input:**
```json
{
  "nodeId": "550e8400-..."
}
```

**Or:**
```json
{
  "content": "Vector databases",
  "label": "technology"
}
```

**Output:**
```json
{
  "id": "550e8400-...",
  "label": "technology",
  "content": "Full content here...",
  "hasEmbedding": true,
  "embeddingDimension": 1536,
  "neighborCount": 5,
  "neighbors": [
    {"id": "...", "label": "concept", "content": "..."}
  ]
}
```

### Tool 10: kg_clear

Clear the entire knowledge graph.

**Warning:** Irreversible operation!

## Usage Examples

### Example 1: Building a Knowledge Graph

```typescript
import { UndirectedGraph, UndirectedNode } from './tracking/knowledgeGraph';

// Create embedding function (using your LLM provider)
async function createEmbeddings(texts: string[]): Promise<number[][]> {
  // Implementation using OpenAI, etc.
}

// Create graph
const graph = new UndirectedGraph(createEmbeddings);

// Create nodes
const ml = new UndirectedNode("Machine Learning", "concept");
const nn = new UndirectedNode("Neural Networks", "algorithm");
const dl = new UndirectedNode("Deep Learning", "concept");

// Build graph with edges
await graph.addNode(ml, nn);
await graph.addNode(ml, dl);
await graph.addNode(nn, dl);

// Result: ml <-> nn <-> dl
//         ml <----------> dl
```

### Example 2: Semantic Search

```typescript
// Search for similar concepts
const results = await graph.semanticSearch(
  "artificial intelligence",
  0.7,  // 70% similarity threshold
  5     // top 5 results
);

for (const node of results) {
  console.log(`${node.label}: ${node.content}`);
  console.log(`Neighbors: ${node.neighbors.size}`);
}
```

### Example 3: Graph Traversal

```typescript
// Start from a node
const startNode = await graph.getNodeByContent("Machine Learning");

// Get all concepts within 2 relationship hops
const relatedConcepts = await graph.getNodesWithinSteps(
  startNode,
  2,  // 2 steps
  ["concept", "algorithm"]  // only these types
);

console.log(`Found ${relatedConcepts.length} related concepts`);
```

### Example 4: Hybrid Query

```typescript
// Find nodes similar to "vector search" that are connected to other similar nodes
const results = await graph.queryByContent(
  "vector search",
  10,  // top 10
  2,   // expand 2 steps through graph
  ["technology", "concept"],  // filter by type
  undefined,
  0.6  // 60% similarity minimum
);

console.log(`Found ${results.length} results combining search + graph`);
```

### Example 5: Finding Common Knowledge

```typescript
// Find what "AI" and "Databases" have in common
const aiNode = await graph.getNodeByContent("Artificial Intelligence");
const dbNode = await graph.getNodeByContent("Databases");

const commonNodes = await graph.getNodesIntersection(
  [aiNode, dbNode],
  2,  // within 2 hops of both
  ["concept"]  // only concepts
);

console.log("Common concepts:");
for (const node of commonNodes) {
  console.log(`- ${node.content}`);
}
```

### Example 6: Using with Agent

```typescript
// Agent conversation
User: "Create a knowledge graph about machine learning"

Agent: I'll use kg_create_node to create nodes
{
  "content": "Machine Learning",
  "label": "concept"
}

User: "Connect it to neural networks"

Agent: I'll use kg_add_edge
{
  "node1Content": "Machine Learning",
  "node1Label": "concept",
  "node2Content": "Neural Networks",
  "node2Label": "algorithm"
}

User: "Find related concepts"

Agent: I'll use kg_traverse
{
  "content": "Machine Learning",
  "label": "concept",
  "steps": 2,
  "constraintLabels": ["concept"]
}
```

## Integration with Embedding Providers

### OpenAI Example

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function createOpenAIEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: texts,
  });

  return response.data.map(item => item.embedding);
}

const graph = new UndirectedGraph(createOpenAIEmbeddings);
```

### Using with BrowserBee's LLM Providers

```typescript
import { createProvider } from '../models/providers/factory';

async function createEmbeddingsWithProvider(texts: string[]): Promise<number[][]> {
  const provider = createProvider('openai', {
    apiKey: config.apiKey,
    modelId: 'text-embedding-ada-002'
  });

  // Batch process
  const embeddings: number[][] = [];
  for (const text of texts) {
    const embedding = await provider.createEmbedding(text);
    embeddings.push(embedding);
  }

  return embeddings;
}
```

## Performance Characteristics

### Memory Storage

- **Nodes**: Stored in Map for O(1) lookup
- **Vectors**: Array-based (Pandas-like) for compatibility
- **Edges**: Stored in neighbor Sets for O(1) edge checks

### Search Performance

- **Semantic Search**: O(n) where n = number of documents
  - Linear scan through all embeddings
  - Fast for < 10,000 nodes

- **Graph Traversal**: O(V + E) where V = nodes, E = edges
  - BFS implementation
  - Efficient for sparse graphs

### Scalability

- **Small graphs** (< 1,000 nodes): Excellent performance
- **Medium graphs** (1,000 - 10,000 nodes): Good performance
- **Large graphs** (> 10,000 nodes): Consider optimization
  - Use approximate nearest neighbor (ANN) algorithms
  - Implement caching for frequent queries
  - Consider persistent storage (IndexedDB)

## Comparison: RD-Agent Python vs BrowserBee TypeScript

| Feature | RD-Agent (Python) | BrowserBee (TypeScript) |
|---------|-------------------|-------------------------|
| Storage | Pandas DataFrame | Array (in-memory) |
| UUID | uuid.uuid3 | uuid v5 |
| Embedding | OpenAI API | Provider-agnostic |
| Similarity | scipy.spatial.distance.cosine | Custom implementation |
| Graph | Set-based neighbors | Set-based neighbors |
| Traversal | BFS | BFS |
| Chunking | ✅ | ✅ |
| Hybrid Queries | ✅ | ✅ |
| Type Safety | ❌ | ✅ (TypeScript) |
| Browser Compatible | ❌ | ✅ |

## Advanced Topics

### Custom Similarity Functions

```typescript
// Override cosine similarity with custom metric
class CustomVectorBase extends MemoryVectorBase {
  private customSimilarity(a: number[], b: number[]): number {
    // Implement your custom similarity metric
    // E.g., Euclidean distance, Manhattan distance, etc.
  }
}
```

### Persistent Storage

```typescript
// Export graph data
const nodes = graph.getAllNodes();
const data = nodes.map(n => n.toDict());
localStorage.setItem('knowledge-graph', JSON.stringify(data));

// Import graph data
const stored = JSON.parse(localStorage.getItem('knowledge-graph'));
for (const nodeData of stored) {
  const node = new UndirectedNode();
  node.fromDict(nodeData);
  await graph.addNode(node);
}
```

### Batch Operations

```typescript
import { Graph } from './tracking/knowledgeGraph';

// Batch create embeddings for multiple nodes
const nodes = [node1, node2, node3, ...];
const nodesWithEmbeddings = await Graph.batchEmbedding(
  nodes,
  createEmbeddings
);

// Add all to graph
for (const node of nodesWithEmbeddings) {
  await graph.addNode(node);
}
```

## Troubleshooting

### Issue: "Search node has no embedding"

**Solution:** Ensure embedding function is set before searching
```typescript
graph.setEmbeddingFunction(createEmbeddings);
```

### Issue: Slow semantic search

**Solution:** Reduce dataset size or implement ANN algorithms
```typescript
// Consider using libraries like hnswlib for faster search
```

### Issue: Memory usage too high

**Solution:** Use chunking and limit graph size
```typescript
const node = new UndirectedNode(longText, "document");
node.splitIntoTrunks(1000, 100); // Chunk large documents
```

## Future Enhancements

Potential improvements:

1. **Persistent Storage**: IndexedDB backend for large graphs
2. **ANN Algorithms**: HNSW or other approximate search
3. **Weighted Edges**: Add edge weights for importance
4. **Directed Graphs**: Support directed edges when needed
5. **Graph Analytics**: PageRank, community detection, etc.
6. **Visualization**: Graph visualization tools
7. **Export/Import**: JSON/GraphML export formats

## Conclusion

This TypeScript implementation provides a complete RD-Agent-style knowledge graph system for BrowserBee, enabling:

✅ Semantic search with embeddings
✅ Graph traversal and navigation
✅ Hybrid queries combining both
✅ Full type safety with TypeScript
✅ Browser-compatible implementation
✅ 10 agent tools for natural language interaction

The system is production-ready and can handle complex knowledge management tasks while maintaining compatibility with browser environments.
