import { KnowledgeMetaData, Document } from './knowledgeMetaData';
import { VectorBase, MemoryVectorBase, cosineSimilarity, createEmbedding } from './graphVectorBase';
import { logWithTimestamp } from '../background/utils';

// Type alias for Node (like RD-Agent)
export type Node = KnowledgeMetaData;

/**
 * UndirectedNode - Node with bidirectional edges
 * Equivalent to RD-Agent's UndirectedNode
 */
export class UndirectedNode extends KnowledgeMetaData {
  public neighbors: Set<UndirectedNode>;
  public appendix: unknown;

  constructor(
    content: string = "",
    label: string = "",
    embedding: number[] | null = null,
    appendix: unknown = null
  ) {
    super(content, label, embedding);
    this.neighbors = new Set<UndirectedNode>();
    this.appendix = appendix;

    if (typeof content !== 'string') {
      throw new Error("Content must be a string");
    }
  }

  /**
   * Add bidirectional edge to another node
   */
  addNeighbor(node: UndirectedNode): void {
    this.neighbors.add(node);
    node.neighbors.add(this);
  }

  /**
   * Remove bidirectional edge from another node
   */
  removeNeighbor(node: UndirectedNode): void {
    if (this.neighbors.has(node)) {
      this.neighbors.delete(node);
      node.neighbors.delete(this);
    }
  }

  /**
   * Get all neighbors
   */
  getNeighbors(): Set<UndirectedNode> {
    return this.neighbors;
  }

  toString(): string {
    const neighborIds = Array.from(this.neighbors).map(n => n.id).join(', ');
    return `UndirectedNode(id=${this.id}, label=${this.label}, content=${this.content.substring(0, 100)}, neighbors=[${neighborIds}])`;
  }

  repr(): string {
    return this.toString();
  }
}

/**
 * Base Graph class for Knowledge Graph
 * Equivalent to RD-Agent's Graph
 */
export abstract class Graph {
  protected nodes: Map<string, Node>;

  constructor() {
    this.nodes = new Map<string, Node>();
  }

  /**
   * Get the number of nodes in the graph
   */
  size(): number {
    return this.nodes.size;
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId: string): Node | null {
    return this.nodes.get(nodeId) || null;
  }

  /**
   * Add a node to the graph (must be implemented by subclass)
   */
  abstract addNode(...args: unknown[]): void;

  /**
   * Get all nodes in the graph
   */
  getAllNodes(): Node[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all nodes by label list
   */
  getAllNodesByLabelList(labelList: string[]): Node[] {
    return Array.from(this.nodes.values()).filter(node =>
      labelList.includes(node.label)
    );
  }

  /**
   * Find a node by content and label
   */
  findNode(content: string, label: string): Node | null {
    for (const node of this.nodes.values()) {
      if (node.content === content && node.label === label) {
        return node;
      }
    }
    return null;
  }

  /**
   * Batch create embeddings for nodes
   */
  static async batchEmbedding(
    nodes: Node[],
    embeddingFn: (texts: string[]) => Promise<number[][]>
  ): Promise<Node[]> {
    const contents = nodes.map(node => node.content);

    // Process in batches of 16 (like RD-Agent)
    const batchSize = 16;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < contents.length; i += batchSize) {
      const batch = contents.slice(i, Math.min(i + batchSize, contents.length));
      logWithTimestamp(
        `Creating embedding for index ${i} to ${i + batch.length} with ${contents.length} contents`,
        'log'
      );

      const embeddings = await embeddingFn(batch);
      allEmbeddings.push(...embeddings);
    }

    if (nodes.length !== allEmbeddings.length) {
      throw new Error("Nodes length must equal embeddings length");
    }

    // Assign embeddings to nodes
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].embedding = allEmbeddings[i];
    }

    return nodes;
  }

  toString(): string {
    return `Graph(nodes=${this.nodes.size})`;
  }
}

/**
 * UndirectedGraph - Graph with undirected edges
 * Equivalent to RD-Agent's UndirectedGraph
 */
export class UndirectedGraph extends Graph {
  private vectorBase: VectorBase;
  private embeddingFn?: (texts: string[]) => Promise<number[][]>;

  constructor(embeddingFn?: (texts: string[]) => Promise<number[][]>) {
    super();
    this.vectorBase = new MemoryVectorBase();
    this.embeddingFn = embeddingFn;
  }

  /**
   * Set embedding function
   */
  setEmbeddingFunction(embeddingFn: (texts: string[]) => Promise<number[][]>): void {
    this.embeddingFn = embeddingFn;
  }

  /**
   * Add a node and optionally a neighbor with edge
   */
  async addNode(
    node: UndirectedNode,
    neighbor?: UndirectedNode,
    sameNodeThreshold: number = 0.95
  ): Promise<void> {
    // Check if node already exists by ID
    let existingNode = this.getNode(node.id) as UndirectedNode | null;
    if (existingNode) {
      node = existingNode;
    } else {
      // Check if node exists by content and label
      existingNode = this.findNode(node.content, node.label) as UndirectedNode | null;
      if (existingNode) {
        node = existingNode;
      } else {
        // Optional: Check for semantic duplicates (commented out like in RD-Agent)
        // const sameNodes = await this.semanticSearch(node.content, sameNodeThreshold, 1);
        // if (sameNodes.length > 0) {
        //   node = sameNodes[0] as UndirectedNode;
        // } else {

        // Create embedding and add to vector base
        if (this.embeddingFn && node.embedding === null) {
          await node.createEmbedding(async (text) => {
            const embeddings = await this.embeddingFn!([text]);
            return embeddings[0];
          });
        }

        if (node.embedding !== null) {
          await this.vectorBase.add(node);
        }

        this.nodes.set(node.id, node);
        // }
      }
    }

    // Handle neighbor if provided
    if (neighbor !== undefined) {
      let existingNeighbor = this.getNode(neighbor.id) as UndirectedNode | null;
      if (existingNeighbor) {
        neighbor = existingNeighbor;
      } else {
        existingNeighbor = this.findNode(neighbor.content, neighbor.label) as UndirectedNode | null;
        if (existingNeighbor) {
          neighbor = existingNeighbor;
        } else {
          // Optional: Check for semantic duplicates
          // const sameNodes = await this.semanticSearch(neighbor.content, sameNodeThreshold, 1);
          // if (sameNodes.length > 0) {
          //   neighbor = sameNodes[0] as UndirectedNode;
          // } else {

          // Create embedding and add to vector base
          if (this.embeddingFn && neighbor.embedding === null) {
            await neighbor.createEmbedding(async (text) => {
              const embeddings = await this.embeddingFn!([text]);
              return embeddings[0];
            });
          }

          if (neighbor.embedding !== null) {
            await this.vectorBase.add(neighbor);
          }

          this.nodes.set(neighbor.id, neighbor);
          // }
        }
      }

      // Add bidirectional edge
      node.addNeighbor(neighbor);
    }
  }

  /**
   * Add a node with multiple neighbors
   */
  async addNodes(node: UndirectedNode, neighbors?: UndirectedNode[]): Promise<void> {
    if (!neighbors || neighbors.length === 0) {
      await this.addNode(node);
    } else {
      for (const neighbor of neighbors) {
        await this.addNode(node, neighbor);
      }
    }
  }

  /**
   * Get node by ID (typed as UndirectedNode)
   */
  getNode(nodeId: string): UndirectedNode | null {
    return super.getNode(nodeId) as UndirectedNode | null;
  }

  /**
   * Get node by content using semantic search
   */
  async getNodeByContent(content: string): Promise<UndirectedNode | null> {
    const matches = await this.semanticSearch(content, 0.999, 1);
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Get all nodes within N steps using BFS
   */
  async getNodesWithinSteps(
    startNode: UndirectedNode,
    steps: number = 1,
    constraintLabels?: string[],
    block: boolean = false
  ): Promise<UndirectedNode[]> {
    const visited = new Set<string>();
    const queue: Array<{ node: UndirectedNode; currentSteps: number }> = [
      { node: startNode, currentSteps: 0 }
    ];
    const result: UndirectedNode[] = [];

    while (queue.length > 0) {
      const { node, currentSteps } = queue.shift()!;

      if (currentSteps > steps) {
        break;
      }

      if (!visited.has(node.id)) {
        visited.add(node.id);
        result.push(node);

        // Get neighbors and sort by content for deterministic results
        const neighbors = Array.from(this.getNode(node.id)?.getNeighbors() || []);
        neighbors.sort((a, b) => a.content.localeCompare(b.content));

        for (const neighbor of neighbors) {
          const shouldBlock = block && constraintLabels && !constraintLabels.includes(neighbor.label);
          if (!visited.has(neighbor.id) && !shouldBlock) {
            queue.push({ node: neighbor, currentSteps: currentSteps + 1 });
          }
        }
      }
    }

    // Filter by constraint labels if specified
    let filteredResult = result;
    if (constraintLabels) {
      filteredResult = result.filter(node => constraintLabels.includes(node.label));
    }

    // Remove start node from results
    return filteredResult.filter(node => node.id !== startNode.id);
  }

  /**
   * Get intersection of nodes connected to multiple nodes
   */
  async getNodesIntersection(
    nodes: UndirectedNode[],
    steps: number = 1,
    constraintLabels?: string[]
  ): Promise<UndirectedNode[]> {
    if (nodes.length < 2) {
      throw new Error("Nodes length must be >= 2");
    }

    let intersection: UndirectedNode[] | null = null;

    for (const node of nodes) {
      const connectedNodes = await this.getNodesWithinSteps(node, steps, constraintLabels);

      if (intersection === null) {
        intersection = connectedNodes;
      } else {
        intersection = this.intersection(intersection, connectedNodes);
      }
    }

    return intersection || [];
  }

  /**
   * Semantic search using vector similarity
   */
  async semanticSearch(
    node: UndirectedNode | string,
    similarityThreshold: number = 0.0,
    topK?: number,
    constraintLabels?: string[]
  ): Promise<UndirectedNode[]> {
    // Convert string to node if needed
    let searchNode: UndirectedNode;
    if (typeof node === 'string') {
      searchNode = new UndirectedNode(node);

      // Create embedding for search
      if (this.embeddingFn) {
        await searchNode.createEmbedding(async (text) => {
          const embeddings = await this.embeddingFn!([text]);
          return embeddings[0];
        });
      }
    } else {
      searchNode = node;
    }

    if (searchNode.embedding === null) {
      logWithTimestamp('Search node has no embedding', 'warn');
      return [];
    }

    // Search in vector base
    const [docs, scores] = await this.vectorBase.search(
      searchNode.content,
      topK || null,
      similarityThreshold,
      constraintLabels || null
    );

    // Convert documents back to UndirectedNodes from graph
    const results: UndirectedNode[] = [];
    for (const doc of docs) {
      const graphNode = this.getNode(doc.id);
      if (graphNode) {
        results.push(graphNode);
      }
    }

    return results;
  }

  /**
   * Query by node with graph traversal and optional constraints
   */
  async queryByNode(
    node: UndirectedNode,
    step: number = 1,
    constraintLabels?: string[],
    constraintNode?: UndirectedNode,
    constraintDistance: number = 0,
    block: boolean = false
  ): Promise<UndirectedNode[]> {
    const nodes = await this.getNodesWithinSteps(node, step, constraintLabels, block);

    // If constraint node specified, filter by distance
    if (constraintNode !== undefined) {
      for (const n of nodes) {
        const distance = this.calDistance(n, constraintNode);
        if (distance > constraintDistance) {
          return nodes;
        }
      }
      return [];
    }

    return nodes;
  }

  /**
   * Hybrid query combining semantic search and graph traversal
   */
  async queryByContent(
    content: string | string[],
    topK: number = 5,
    step: number = 1,
    constraintLabels?: string[],
    constraintNode?: UndirectedNode,
    similarityThreshold: number = 0.0,
    constraintDistance: number = 0,
    block: boolean = false
  ): Promise<UndirectedNode[]> {
    const queries = typeof content === 'string' ? [content] : content;
    const resList: UndirectedNode[] = [];

    for (const query of queries) {
      // Step 1: Semantic search
      const similarNodes = await this.semanticSearch(
        query,
        similarityThreshold,
        topK
      );

      // Step 2: Expand through graph
      const connectedNodes: UndirectedNode[] = [];
      for (const node of similarNodes) {
        const graphQueryResult = await this.queryByNode(
          node,
          step,
          constraintLabels,
          constraintNode,
          constraintDistance,
          block
        );

        // Add unique nodes
        for (const resultNode of graphQueryResult) {
          if (!connectedNodes.some(n => n.id === resultNode.id)) {
            connectedNodes.push(resultNode);
          }
        }

        if (connectedNodes.length >= topK) {
          break;
        }
      }

      // Add to result list
      for (const node of connectedNodes.slice(0, topK)) {
        if (!resList.some(n => n.id === node.id)) {
          resList.push(node);
        }
      }
    }

    return resList;
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.nodes.clear();
    this.vectorBase.clear();
    logWithTimestamp('Graph cleared', 'log');
  }

  /**
   * Calculate intersection of two node arrays
   */
  static intersection(nodes1: UndirectedNode[], nodes2: UndirectedNode[]): UndirectedNode[] {
    const ids2 = new Set(nodes2.map(n => n.id));
    return nodes1.filter(node => ids2.has(node.id));
  }

  /**
   * Instance method for intersection
   */
  intersection(nodes1: UndirectedNode[], nodes2: UndirectedNode[]): UndirectedNode[] {
    return UndirectedGraph.intersection(nodes1, nodes2);
  }

  /**
   * Calculate symmetric difference between two node arrays
   */
  static different(nodes1: UndirectedNode[], nodes2: UndirectedNode[]): UndirectedNode[] {
    const ids1 = new Set(nodes1.map(n => n.id));
    const ids2 = new Set(nodes2.map(n => n.id));

    const onlyIn1 = nodes1.filter(n => !ids2.has(n.id));
    const onlyIn2 = nodes2.filter(n => !ids1.has(n.id));

    return [...onlyIn1, ...onlyIn2];
  }

  /**
   * Calculate distance between two nodes using cosine similarity
   */
  calDistance(node1: UndirectedNode, node2: UndirectedNode): number {
    if (!node1.embedding || !node2.embedding) {
      throw new Error("Both nodes must have embeddings");
    }
    return 1 - cosineSimilarity(node1.embedding, node2.embedding);
  }

  /**
   * Filter nodes by labels
   */
  static filterLabel(nodes: UndirectedNode[], labels: string[]): UndirectedNode[] {
    return nodes.filter(node => labels.includes(node.label));
  }

  /**
   * Get the vector base (for advanced usage)
   */
  getVectorBase(): VectorBase {
    return this.vectorBase;
  }

  toString(): string {
    return `UndirectedGraph(nodes=${this.nodes.size})`;
  }
}

/**
 * Helper functions for graph visualization
 */

export function graphToEdges(graph: Map<string, string[]>): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  const edgeSet = new Set<string>();

  for (const [node, neighbors] of graph.entries()) {
    for (const neighbor of neighbors) {
      const edgeKey1 = `${node}-${neighbor}`;
      const edgeKey2 = `${neighbor}-${node}`;

      if (!edgeSet.has(edgeKey1) && !edgeSet.has(edgeKey2)) {
        edges.push([node, neighbor]);
        edgeSet.add(edgeKey1);
      }
    }
  }

  return edges;
}

export function assignRandomCoordinateToNode(
  nodes: string[],
  scope: number = 1.0,
  origin: [number, number] = [0.0, 0.0]
): Map<string, [number, number]> {
  const coordinates = new Map<string, [number, number]>();

  for (const node of nodes) {
    const x = Math.random() * scope + origin[0];
    const y = Math.random() * scope + origin[1];
    coordinates.set(node, [x, y]);
  }

  return coordinates;
}

export function assignIsometricCoordinateToNode(
  nodes: unknown[],
  xStep: number = 1.0,
  xOrigin: number = 0.0,
  yOrigin: number = 0.0
): Map<unknown, [number, number]> {
  const coordinates = new Map<unknown, [number, number]>();

  for (let i = 0; i < nodes.length; i++) {
    const x = xOrigin + i * xStep;
    const y = yOrigin;
    coordinates.set(nodes[i], [x, y]);
  }

  return coordinates;
}

export function curlyNodeCoordinate(
  coordinates: Map<unknown, [number, number]>,
  centerY: number = 1.0,
  r: number = 1.0
): Map<unknown, [number, number]> {
  const curled = new Map<unknown, [number, number]>();

  for (const [node, [x, y]] of coordinates.entries()) {
    const newY = centerY + Math.sqrt(r * r - x * x);
    curled.set(node, [x, newY]);
  }

  return curled;
}
