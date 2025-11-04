/**
 * Knowledge Graph Usage Example
 *
 * This example demonstrates how to use the RD-Agent-style knowledge graph
 * implementation in BrowserBee.
 */

import { UndirectedGraph, UndirectedNode } from '../src/tracking/knowledgeGraph';
import { KnowledgeMetaData } from '../src/tracking/knowledgeMetaData';

/**
 * Mock embedding function for demonstration
 * In production, use OpenAI, Google, or other embedding providers
 */
async function mockEmbeddingFunction(texts: string[]): Promise<number[][]> {
  // Generate random embeddings for demonstration
  // Dimension: 384 (typical for sentence transformers)
  return texts.map(() => {
    const embedding = Array(384).fill(0).map(() => Math.random());
    return embedding;
  });
}

/**
 * Example 1: Basic Graph Creation
 */
async function example1_BasicGraph() {
  console.log('\n=== Example 1: Basic Graph Creation ===\n');

  const graph = new UndirectedGraph(mockEmbeddingFunction);

  // Create nodes
  const ml = new UndirectedNode("Machine Learning is a subset of AI", "concept");
  const nn = new UndirectedNode("Neural Networks are computational models", "algorithm");
  const dl = new UndirectedNode("Deep Learning uses multiple layers", "concept");

  // Add nodes with edges
  await graph.addNode(ml, nn);
  await graph.addNode(ml, dl);
  await graph.addNode(nn, dl);

  console.log(`Graph created with ${graph.size()} nodes`);
  console.log(`ML neighbors: ${ml.neighbors.size}`);
  console.log(`NN neighbors: ${nn.neighbors.size}`);
  console.log(`DL neighbors: ${dl.neighbors.size}`);

  return graph;
}

/**
 * Example 2: Semantic Search
 */
async function example2_SemanticSearch() {
  console.log('\n=== Example 2: Semantic Search ===\n');

  const graph = await example1_BasicGraph();

  // Search for similar nodes
  const query = "artificial intelligence algorithms";
  const results = await graph.semanticSearch(
    query,
    0.0,  // No threshold for demo
    3     // Top 3
  );

  console.log(`Search results for "${query}":`);
  results.forEach((node, index) => {
    console.log(`${index + 1}. [${node.label}] ${node.content.substring(0, 50)}...`);
  });

  return graph;
}

/**
 * Example 3: Graph Traversal
 */
async function example3_GraphTraversal() {
  console.log('\n=== Example 3: Graph Traversal ===\n');

  const graph = await example1_BasicGraph();

  // Get starting node
  const startNode = graph.getAllNodes()[0] as UndirectedNode;

  // Traverse 1 step
  const neighbors1 = await graph.getNodesWithinSteps(startNode, 1);
  console.log(`Nodes within 1 step: ${neighbors1.length}`);

  // Traverse 2 steps
  const neighbors2 = await graph.getNodesWithinSteps(startNode, 2);
  console.log(`Nodes within 2 steps: ${neighbors2.length}`);

  return graph;
}

/**
 * Example 4: Hybrid Query
 */
async function example4_HybridQuery() {
  console.log('\n=== Example 4: Hybrid Query ===\n');

  const graph = new UndirectedGraph(mockEmbeddingFunction);

  // Build a larger graph
  const concepts = [
    "Machine Learning",
    "Neural Networks",
    "Deep Learning",
    "Vector Databases",
    "Semantic Search",
    "Knowledge Graphs",
    "Natural Language Processing",
    "Computer Vision"
  ];

  const nodes: UndirectedNode[] = [];
  for (const concept of concepts) {
    const node = new UndirectedNode(concept, "concept");
    await graph.addNode(node);
    nodes.push(node);
  }

  // Create connections
  await graph.addNode(nodes[0], nodes[1]); // ML <-> NN
  await graph.addNode(nodes[1], nodes[2]); // NN <-> DL
  await graph.addNode(nodes[3], nodes[4]); // Vector DB <-> Semantic Search
  await graph.addNode(nodes[4], nodes[5]); // Semantic Search <-> KG
  await graph.addNode(nodes[0], nodes[6]); // ML <-> NLP

  // Hybrid query: search + traverse
  const results = await graph.queryByContent(
    "neural networks",
    5,   // top 5
    2,   // traverse 2 steps
    ["concept"]  // only concepts
  );

  console.log(`Hybrid query results: ${results.length} nodes`);
  results.forEach((node, index) => {
    console.log(`${index + 1}. ${node.content}`);
  });

  return graph;
}

/**
 * Example 5: Finding Intersections
 */
async function example5_Intersection() {
  console.log('\n=== Example 5: Finding Intersections ===\n');

  const graph = new UndirectedGraph(mockEmbeddingFunction);

  // Create a knowledge graph
  const ai = new UndirectedNode("Artificial Intelligence", "concept");
  const ml = new UndirectedNode("Machine Learning", "concept");
  const dl = new UndirectedNode("Deep Learning", "concept");
  const data = new UndirectedNode("Data Science", "field");
  const stats = new UndirectedNode("Statistics", "field");

  // Build connections
  await graph.addNode(ai, ml);
  await graph.addNode(ai, dl);
  await graph.addNode(ml, data);
  await graph.addNode(dl, data);
  await graph.addNode(data, stats);

  // Find what AI and Data Science have in common
  const commonNodes = await graph.getNodesIntersection(
    [ai, data],
    2,  // within 2 steps
    ["concept"]  // only concepts
  );

  console.log(`Common concepts between AI and Data Science:`);
  commonNodes.forEach(node => {
    console.log(`- ${node.content}`);
  });

  return graph;
}

/**
 * Example 6: Content Chunking
 */
async function example6_Chunking() {
  console.log('\n=== Example 6: Content Chunking ===\n');

  const longDocument = `
    Machine learning is a subset of artificial intelligence that enables
    computers to learn from data without being explicitly programmed.
    It uses algorithms and statistical models to analyze and draw inferences
    from patterns in data. Deep learning is a specialized subset of machine
    learning that uses neural networks with multiple layers. These networks
    can learn hierarchical representations of data, making them particularly
    effective for tasks like image recognition and natural language processing.
  `.trim();

  const node = new KnowledgeMetaData(longDocument, "document");

  // Split into chunks
  node.splitIntoTrunks(100, 20); // 100 chars per chunk, 20 char overlap

  console.log(`Original length: ${longDocument.length} characters`);
  console.log(`Number of chunks: ${node.trunks.length}`);
  console.log(`\nChunks:`);
  node.trunks.forEach((chunk, index) => {
    console.log(`${index + 1}. ${chunk.substring(0, 50)}...`);
  });
}

/**
 * Example 7: Using with Agent Tools
 */
async function example7_AgentTools() {
  console.log('\n=== Example 7: Agent Tools Integration ===\n');

  // This demonstrates how the agent would use the tools

  console.log('User: "Create a knowledge node about vector databases"');
  console.log('\nAgent calls kg_create_node:');
  console.log(JSON.stringify({
    content: "Vector databases enable semantic search using embeddings",
    label: "technology"
  }, null, 2));

  console.log('\nUser: "Connect it to semantic search"');
  console.log('\nAgent calls kg_add_edge:');
  console.log(JSON.stringify({
    node1Content: "Vector databases enable semantic search using embeddings",
    node1Label: "technology",
    node2Content: "Semantic search finds similar content using meaning",
    node2Label: "concept"
  }, null, 2));

  console.log('\nUser: "Find related concepts"');
  console.log('\nAgent calls kg_traverse:');
  console.log(JSON.stringify({
    content: "Vector databases enable semantic search using embeddings",
    label: "technology",
    steps: 2,
    constraintLabels: ["concept", "technology"]
  }, null, 2));
}

/**
 * Example 8: Graph Statistics
 */
async function example8_Statistics() {
  console.log('\n=== Example 8: Graph Statistics ===\n');

  const graph = await example4_HybridQuery();

  const allNodes = graph.getAllNodes() as UndirectedNode[];

  const stats = {
    totalNodes: allNodes.length,
    labels: {} as Record<string, number>,
    totalEdges: 0,
    avgNeighbors: 0,
    nodesWithEmbeddings: 0,
  };

  for (const node of allNodes) {
    stats.labels[node.label] = (stats.labels[node.label] || 0) + 1;
    stats.totalEdges += node.neighbors.size;
    if (node.embedding !== null) {
      stats.nodesWithEmbeddings++;
    }
  }

  stats.totalEdges = stats.totalEdges / 2; // Bidirectional
  stats.avgNeighbors = stats.totalEdges / allNodes.length;

  console.log('Graph Statistics:');
  console.log(JSON.stringify(stats, null, 2));
}

/**
 * Example 9: Batch Operations
 */
async function example9_BatchOperations() {
  console.log('\n=== Example 9: Batch Operations ===\n');

  // Create multiple nodes
  const nodes = [
    new UndirectedNode("Python", "language"),
    new UndirectedNode("JavaScript", "language"),
    new UndirectedNode("TypeScript", "language"),
    new UndirectedNode("Java", "language"),
  ];

  // Batch create embeddings
  const nodesWithEmbeddings = await UndirectedGraph.batchEmbedding(
    nodes,
    mockEmbeddingFunction
  );

  console.log(`Created embeddings for ${nodesWithEmbeddings.length} nodes`);
  console.log(`First node embedding dimension: ${nodesWithEmbeddings[0].embedding?.length}`);
}

/**
 * Example 10: Export and Import
 */
async function example10_ExportImport() {
  console.log('\n=== Example 10: Export and Import ===\n');

  const graph = await example1_BasicGraph();

  // Export graph data
  const nodes = graph.getAllNodes();
  const exportData = nodes.map(node => node.toDict());

  console.log(`Exported ${exportData.length} nodes`);
  console.log('Export format:', JSON.stringify(exportData[0], null, 2).substring(0, 200) + '...');

  // Import into new graph
  const newGraph = new UndirectedGraph(mockEmbeddingFunction);

  for (const nodeData of exportData) {
    const node = new UndirectedNode();
    node.fromDict(nodeData);
    await newGraph.addNode(node);
  }

  console.log(`Imported ${newGraph.size()} nodes into new graph`);
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Knowledge Graph Examples - RD-Agent TypeScript Style    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await example1_BasicGraph();
    await example2_SemanticSearch();
    await example3_GraphTraversal();
    await example4_HybridQuery();
    await example5_Intersection();
    await example6_Chunking();
    await example7_AgentTools();
    await example8_Statistics();
    await example9_BatchOperations();
    await example10_ExportImport();

    console.log('\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
  }
}

// Export for use
export {
  example1_BasicGraph,
  example2_SemanticSearch,
  example3_GraphTraversal,
  example4_HybridQuery,
  example5_Intersection,
  example6_Chunking,
  example7_AgentTools,
  example8_Statistics,
  example9_BatchOperations,
  example10_ExportImport,
  runAllExamples
};

// Run if executed directly
if (require.main === module) {
  runAllExamples();
}
