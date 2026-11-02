// Define message types
export type MessageType = 'system' | 'llm' | 'ocr' | 'image_analysis' | 'screenshot' | 'workflow' | 'workflow_offer' | 'task_complete';

export interface Message {
  runId?: string;
  activity?: { status: 'running' | 'completed' | 'failed' | 'cancelled'; startedAt?: number; endedAt?: number; durationMs?: number; steps: Array<{ executionId: string; toolName: string; status: string; durationMs?: number }> };
  type: MessageType;
  content: string;
  isComplete?: boolean;
  segmentId?: number;
  isStreaming?: boolean;
  imageData?: string;
  mediaType?: string;
  workflowId?: string;
  workflowOfferId?: string;
}

// Chrome message types
export interface ChromeMessage {
  action: string;
  content?: any;
  tabId?: number;
  windowId?: number;
  runId?: string;
  workflowId?: string;
  executionTabId?: number;
  // Approval request properties
  requestId?: string;
  toolName?: string;
  toolInput?: string;
  reason?: string;
  
  status?: 'attached' | 'detached' | 'running' | 'idle' | 'error';
  lastHeartbeat?: number;
  timestamp?: number;
  targetInfo?: any;
  url?: string;
  title?: string;
  dialogInfo?: any;
  consoleInfo?: any;
  error?: string;
  
  // Tab replacement properties
  oldTabId?: number;
  newTabId?: number;
}
