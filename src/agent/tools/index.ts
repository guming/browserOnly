import type { Page } from "playwright-crx";

// Import all tools from their respective modules
import { 
  browserClick, 
  browserType, 
  browserHandleDialog 
} from "./interactionTools";
import { 
  browserPressKey, 
  browserKeyboardType 
} from "./keyboardTools";
import {
  saveMemory,
  lookupMemories,
  getAllMemories,
  deleteMemory,
  clearAllMemories
} from "./memoryTools";

import {
  createVectorCollection,
  listVectorCollections,
  deleteVectorCollection,
  storeVector,
  searchVectors,
  getVectorDocument,
  deleteVectorDocument,
  listVectorDocuments,
  clearAllVectorData
} from "./vectorTools";

import {
  createKnowledgeNode,
  addKnowledgeEdge,
  listKnowledgeNodes,
  searchKnowledge,
  traverseKnowledgeGraph,
  hybridKnowledgeQuery,
  findKnowledgeIntersection,
  getKnowledgeGraphStats,
  clearKnowledgeGraph,
  getKnowledgeNode
} from "./knowledgeGraphTools";

import {
  browserReadTextEnhanced,
  browserGetPageSummary,
  browserReadMainContent,
  browserGetCacheStats,
  browserClearCache
} from "./enhancedReadTools";

import {
  browserReadTextAST,
  browserGetOverview,
  browserGetSection,
  browserGetPageSummaryAST,
  browserGetASTStats,
  browserGetTopContent,
  browserManageASTCache
} from "./astReadTools";

import { 
  browserMoveMouse, 
  browserClickXY, 
  browserDrag 
} from "./mouseTools";
import { 
  browserNavigate, 
  browserWaitForNavigation, 
  browserNavigateBack, 
  browserNavigateForward 
} from "./navigationTools";

import { 
  browserGetTitle, 
  browserSnapshotDom, 
  browserQuery, 
  browserAccessibleTree, 
  browserReadText, 
  browserScreenshot 
} from "./observationTools";
import {
  browserGetActiveTab,
  browserNavigateTab,
  browserScreenshotTab
} from "./tabContextTools";





import { 
  browserTabList, 
  browserTabNew, 
  browserTabSelect, 
  browserTabClose 
} from "./tabTools";

import { startExtract } from "./extractHtml";

// Export all tools
export {
  // Navigation tools
  browserNavigate,
  browserWaitForNavigation,
  browserNavigateBack,
  browserNavigateForward,
  
  // Tab context tools
  browserGetActiveTab,
  browserNavigateTab,
  browserScreenshotTab,
  
  // Interaction tools
  browserClick,
  browserType,
  browserHandleDialog,
  
  // Observation tools
  browserGetTitle,
  browserSnapshotDom,
  browserQuery,
  browserAccessibleTree,
  browserReadText,
  browserScreenshot,
  
  // Mouse tools
  browserMoveMouse,
  browserClickXY,
  browserDrag,
  
  // Keyboard tools
  browserPressKey,
  browserKeyboardType,
  
  // Tab tools
  browserTabList,
  browserTabNew,
  browserTabSelect,
  browserTabClose,
  
  // Memory tools
  saveMemory,
  lookupMemories,
  getAllMemories,
  deleteMemory,
  clearAllMemories,

  // Vector database tools
  createVectorCollection,
  listVectorCollections,
  deleteVectorCollection,
  storeVector,
  searchVectors,
  getVectorDocument,
  deleteVectorDocument,
  listVectorDocuments,
  clearAllVectorData,

  // Knowledge graph tools
  createKnowledgeNode,
  addKnowledgeEdge,
  listKnowledgeNodes,
  searchKnowledge,
  traverseKnowledgeGraph,
  hybridKnowledgeQuery,
  findKnowledgeIntersection,
  getKnowledgeGraphStats,
  clearKnowledgeGraph,
  getKnowledgeNode,

  // Enhanced read tools
  browserReadTextEnhanced,
  browserGetPageSummary,
  browserReadMainContent,
  browserGetCacheStats,
  browserClearCache,

  // AST read tools
  browserReadTextAST,
  browserGetOverview,
  browserGetSection,
  browserGetPageSummaryAST,
  browserGetASTStats,
  browserGetTopContent,
  browserManageASTCache,

  // Extract tools
  startExtract
  // Notion tools are exported separately from ./notionTools
};

// Function to get all tools as an array
export function getAllTools(page: Page) {
  
  const tools = [
    // Navigation tools
    browserNavigate(page),
    browserWaitForNavigation(page),
    browserNavigateBack(page),
    browserNavigateForward(page),
    
    // Tab context tools
    browserGetActiveTab(page),
    browserNavigateTab(page),
    browserScreenshotTab(page),
    
    // Interaction tools
    browserClick(page),
    browserType(page),
    browserHandleDialog(page),
    
    // Observation tools
    browserGetTitle(page),
    browserSnapshotDom(page),
    browserQuery(page),
    browserAccessibleTree(page),
    browserReadText(page),
    browserScreenshot(page),
    
    // Mouse tools
    browserMoveMouse(page),
    browserClickXY(page),
    browserDrag(page),
    
    // Keyboard tools
    browserPressKey(page),
    browserKeyboardType(page),
    
    // Tab tools
    browserTabList(page),
    browserTabNew(page),
    browserTabSelect(page),
    browserTabClose(page),
    
    // Memory tools
    saveMemory(page),
    lookupMemories(page),
    getAllMemories(page),
    deleteMemory(page),
    clearAllMemories(page),

    // Vector database tools
    createVectorCollection(page),
    listVectorCollections(page),
    deleteVectorCollection(page),
    storeVector(page),
    searchVectors(page),
    getVectorDocument(page),
    deleteVectorDocument(page),
    listVectorDocuments(page),
    clearAllVectorData(page),

    // Knowledge graph tools
    createKnowledgeNode(page),
    addKnowledgeEdge(page),
    listKnowledgeNodes(page),
    searchKnowledge(page),
    traverseKnowledgeGraph(page),
    hybridKnowledgeQuery(page),
    findKnowledgeIntersection(page),
    getKnowledgeGraphStats(page),
    clearKnowledgeGraph(page),
    getKnowledgeNode(page),

    // Enhanced read tools
    browserReadTextEnhanced(page),
    browserGetPageSummary(page),
    browserReadMainContent(page),
    browserGetCacheStats(page),
    browserClearCache(page),

    // AST read tools
    browserReadTextAST(page),
    browserGetOverview(page),
    browserGetSection(page),
    browserGetPageSummaryAST(page),
    browserGetASTStats(page),
    browserGetTopContent(page),
    browserManageASTCache(page),

    // Extract tools
    startExtract(page)
    // Notion tools are not included here as they require a NotionMCPClient instance
    // Use getAllNotionTools(client) from ./notionTools for Notion-specific tools
  ];
  
  return tools;
}
