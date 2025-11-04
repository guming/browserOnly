import type { Page } from "playwright-crx";
import { logWithTimestamp } from '../../background/utils';
import { UndirectedGraph, UndirectedNode } from '../../tracking/knowledgeGraph';

// Global graph instance (singleton pattern)
let graphInstance: UndirectedGraph | null = null;

/**
 * Get or create the global graph instance
 */
function getGraphInstance(): UndirectedGraph {
  if (!graphInstance) {
    graphInstance = new UndirectedGraph();
    logWithTimestamp('Created new KnowledgeGraph instance', 'log');
  }
  return graphInstance;
}

/**
 * Set embedding function for the graph
 */
export function setGraphEmbeddingFunction(
  embeddingFn: (texts: string[]) => Promise<number[][]>
): void {
  const graph = getGraphInstance();
  graph.setEmbeddingFunction(embeddingFn);
  logWithTimestamp('Set embedding function for KnowledgeGraph', 'log');
}

/**
 * Create a new knowledge node
 */
export function createKnowledgeNode(page: Page) {
  return {
    name: "kg_create_node",
    description: "Create a new node in the knowledge graph. Requires content and label. Optional: embedding (array of numbers) and appendix (any additional data). If no embedding provided, it will be created automatically if embedding function is configured.",
    func: async (input: string): Promise<string> => {
      try {
        const inputObj = JSON.parse(input);
        const { content, label, embedding, appendix } = inputObj;

        if (!content || !label) {
          return "Error: Missing required fields. Please provide content and label.";
        }

        const graph = getGraphInstance();
        const node = new UndirectedNode(content, label, embedding || null, appendix);

        await graph.addNode(node);

        return `Knowledge node created successfully with ID: ${node.id}`;
      } catch (error) {
        logWithTimestamp(`Error creating knowledge node: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error creating knowledge node: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Add an edge between two nodes
 */
export function addKnowledgeEdge(page: Page) {
  return {
    name: "kg_add_edge",
    description: "Create a bidirectional edge between two existing nodes in the knowledge graph. Provide the content and label of both nodes, or create new nodes if they don't exist.",
    func: async (input: string): Promise<string> => {
      try {
        const inputObj = JSON.parse(input);
        const { node1Content, node1Label, node2Content, node2Label, node1Embedding, node2Embedding } = inputObj;

        if (!node1Content || !node1Label || !node2Content || !node2Label) {
          return "Error: Missing required fields. Provide node1Content, node1Label, node2Content, node2Label.";
        }

        const graph = getGraphInstance();

        // Create or get nodes
        const node1 = new UndirectedNode(node1Content, node1Label, node1Embedding || null);
        const node2 = new UndirectedNode(node2Content, node2Label, node2Embedding || null);

        // Add node1 with node2 as neighbor
        await graph.addNode(node1, node2);

        return `Edge created between nodes: ${node1.id} <-> ${node2.id}`;
      } catch (error) {
        logWithTimestamp(`Error adding edge: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error adding edge: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Get all nodes in the graph
 */
export function listKnowledgeNodes(page: Page) {
  return {
    name: "kg_list_nodes",
    description: "List all nodes in the knowledge graph. Optional: provide labels array to filter by specific labels.",
    func: async (input: string): Promise<string> => {
      try {
        const graph = getGraphInstance();
        let nodes;

        if (input.trim()) {
          const inputObj = JSON.parse(input);
          const { labels } = inputObj;

          if (labels && Array.isArray(labels)) {
            nodes = graph.getAllNodesByLabelList(labels);
          } else {
            nodes = graph.getAllNodes();
          }
        } else {
          nodes = graph.getAllNodes();
        }

        if (nodes.length === 0) {
          return "No nodes found in the knowledge graph.";
        }

        return JSON.stringify(nodes.map(node => ({
          id: node.id,
          label: node.label,
          content: node.content.substring(0, 100) + (node.content.length > 100 ? '...' : ''),
          hasEmbedding: node.embedding !== null,
          neighborCount: (node as UndirectedNode).neighbors?.size || 0
        })), null, 2);
      } catch (error) {
        logWithTimestamp(`Error listing nodes: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error listing nodes: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Semantic search in the knowledge graph
 */
export function searchKnowledge(page: Page) {
  return {
    name: "kg_search",
    description: "Search the knowledge graph using semantic similarity. Provide query text, and optionally topK (default 5), similarityThreshold (default 0.0), and constraintLabels (array of labels to filter by).",
    func: async (input: string): Promise<string> => {
      try {
        const inputObj = JSON.parse(input);
        const { query, topK, similarityThreshold, constraintLabels } = inputObj;

        if (!query) {
          return "Error: Missing required field 'query'.";
        }

        const graph = getGraphInstance();
        const results = await graph.semanticSearch(
          query,
          similarityThreshold || 0.0,
          topK || 5,
          constraintLabels
        );

        if (results.length === 0) {
          return `No nodes found matching query: "${query}"`;
        }

        return JSON.stringify(results.map(node => ({
          id: node.id,
          label: node.label,
          content: node.content.substring(0, 200) + (node.content.length > 200 ? '...' : ''),
          neighborCount: node.neighbors.size
        })), null, 2);
      } catch (error) {
        logWithTimestamp(`Error searching knowledge: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error searching knowledge: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Traverse graph from a node
 */
export function traverseKnowledgeGraph(page: Page) {
  return {
    name: "kg_traverse",
    description: "Traverse the knowledge graph from a starting node using BFS. Provide nodeId or (content + label) to identify the start node, steps (default 1), and optionally constraintLabels to filter results.",
    func: async (input: string): Promise<string> => {
      try {
        const inputObj = JSON.parse(input);
        const { nodeId, content, label, steps, constraintLabels, block } = inputObj;

        const graph = getGraphInstance();
        let startNode: UndirectedNode | null = null;

        // Find start node
        if (nodeId) {
          startNode = graph.getNode(nodeId);
        } else if (content && label) {
          startNode = graph.findNode(content, label) as UndirectedNode | null;
        } else {
          return "Error: Provide either nodeId or (content + label) to identify the start node.";
        }

        if (!startNode) {
          return "Error: Start node not found in the graph.";
        }

        const results = await graph.getNodesWithinSteps(
          startNode,
          steps || 1,
          constraintLabels,
          block || false
        );

        if (results.length === 0) {
          return `No nodes found within ${steps || 1} steps of the start node.`;
        }

        return JSON.stringify(results.map(node => ({
          id: node.id,
          label: node.label,
          content: node.content.substring(0, 100) + '...',
          neighborCount: node.neighbors.size
        })), null, 2);
      } catch (error) {
        logWithTimestamp(`Error traversing graph: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error traversing graph: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Hybrid query combining semantic search and graph traversal
 */
export function hybridKnowledgeQuery(page: Page) {
  return {
    name: "kg_hybrid_query",
    description: "Powerful hybrid query combining semantic search and graph traversal. Search for similar nodes, then expand through graph connections. Provide query (string or array), topK (default 5), step (traversal depth, default 1), similarityThreshold (default 0.0), and optionally constraintLabels.",
    func: async (input: string): Promise<string> => {
      try {
        const inputObj = JSON.parse(input);
        const {
          query,
          topK,
          step,
          constraintLabels,
          similarityThreshold,
          block
        } = inputObj;

        if (!query) {
          return "Error: Missing required field 'query'.";
        }

        const graph = getGraphInstance();
        const results = await graph.queryByContent(
          query,
          topK || 5,
          step || 1,
          constraintLabels,
          undefined,
          similarityThreshold || 0.0,
          0,
          block || false
        );

        if (results.length === 0) {
          return `No nodes found for hybrid query: "${query}"`;
        }

        return JSON.stringify(results.map(node => ({
          id: node.id,
          label: node.label,
          content: node.content.substring(0, 200) + '...',
          neighborCount: node.neighbors.size
        })), null, 2);
      } catch (error) {
        logWithTimestamp(`Error in hybrid query: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error in hybrid query: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Find intersection of nodes connected to multiple nodes
 */
export function findKnowledgeIntersection(page: Page) {
  return {
    name: "kg_find_intersection",
    description: "Find nodes that are connected to ALL specified nodes. Provide an array of nodeIds or node objects (with content + label), steps (default 1), and optionally constraintLabels.",
    func: async (input: string): Promise<string> => {
      try {
        const inputObj = JSON.parse(input);
        const { nodeIds, nodes, steps, constraintLabels } = inputObj;

        const graph = getGraphInstance();
        const targetNodes: UndirectedNode[] = [];

        // Get nodes by IDs
        if (nodeIds && Array.isArray(nodeIds)) {
          for (const id of nodeIds) {
            const node = graph.getNode(id);
            if (node) {
              targetNodes.push(node);
            }
          }
        }

        // Get nodes by content + label
        if (nodes && Array.isArray(nodes)) {
          for (const nodeSpec of nodes) {
            const { content, label } = nodeSpec;
            const node = graph.findNode(content, label) as UndirectedNode | null;
            if (node) {
              targetNodes.push(node);
            }
          }
        }

        if (targetNodes.length < 2) {
          return "Error: Need at least 2 nodes to find intersection.";
        }

        const results = await graph.getNodesIntersection(
          targetNodes,
          steps || 1,
          constraintLabels
        );

        if (results.length === 0) {
          return "No common nodes found in the intersection.";
        }

        return JSON.stringify(results.map(node => ({
          id: node.id,
          label: node.label,
          content: node.content.substring(0, 100) + '...',
          neighborCount: node.neighbors.size
        })), null, 2);
      } catch (error) {
        logWithTimestamp(`Error finding intersection: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error finding intersection: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Get statistics about the knowledge graph
 */
export function getKnowledgeGraphStats(page: Page) {
  return {
    name: "kg_get_stats",
    description: "Get statistics about the knowledge graph including total nodes, labels distribution, and average connections.",
    func: async (): Promise<string> => {
      try {
        const graph = getGraphInstance();
        const allNodes = graph.getAllNodes() as UndirectedNode[];

        const stats = {
          totalNodes: allNodes.length,
          labels: {} as Record<string, number>,
          totalEdges: 0,
          avgNeighbors: 0,
          nodesWithEmbeddings: 0,
        };

        for (const node of allNodes) {
          // Count labels
          stats.labels[node.label] = (stats.labels[node.label] || 0) + 1;

          // Count edges
          stats.totalEdges += node.neighbors.size;

          // Count embeddings
          if (node.embedding !== null) {
            stats.nodesWithEmbeddings++;
          }
        }

        // Calculate average neighbors (divide by 2 because edges are bidirectional)
        stats.totalEdges = stats.totalEdges / 2;
        stats.avgNeighbors = allNodes.length > 0 ? stats.totalEdges / allNodes.length : 0;

        return JSON.stringify(stats, null, 2);
      } catch (error) {
        logWithTimestamp(`Error getting stats: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error getting stats: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Clear the entire knowledge graph
 */
export function clearKnowledgeGraph(page: Page) {
  return {
    name: "kg_clear",
    description: "Clear all nodes and edges from the knowledge graph. This operation is irreversible. Use with caution.",
    func: async (): Promise<string> => {
      try {
        const graph = getGraphInstance();
        graph.clear();
        return "Knowledge graph cleared successfully.";
      } catch (error) {
        logWithTimestamp(`Error clearing graph: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error clearing graph: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Get a specific node by ID or content
 */
export function getKnowledgeNode(page: Page) {
  return {
    name: "kg_get_node",
    description: "Get a specific node by ID or by content+label. Returns the node details including neighbors.",
    func: async (input: string): Promise<string> => {
      try {
        const inputObj = JSON.parse(input);
        const { nodeId, content, label } = inputObj;

        const graph = getGraphInstance();
        let node: UndirectedNode | null = null;

        if (nodeId) {
          node = graph.getNode(nodeId);
        } else if (content && label) {
          node = graph.findNode(content, label) as UndirectedNode | null;
        } else {
          return "Error: Provide either nodeId or (content + label).";
        }

        if (!node) {
          return "Node not found.";
        }

        const neighbors = Array.from(node.neighbors).map(n => ({
          id: n.id,
          label: n.label,
          content: n.content.substring(0, 50) + '...'
        }));

        return JSON.stringify({
          id: node.id,
          label: node.label,
          content: node.content,
          hasEmbedding: node.embedding !== null,
          embeddingDimension: node.embedding?.length || 0,
          neighborCount: node.neighbors.size,
          neighbors: neighbors
        }, null, 2);
      } catch (error) {
        logWithTimestamp(`Error getting node: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error getting node: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}
