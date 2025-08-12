import React, { useState, useEffect } from 'react';
import { ConfigManager } from '../background/configManager';
import { TokenTrackingService } from '../tracking/tokenTrackingService';
import { ApprovalRequest } from './components/ApprovalRequest';
import { MessageDisplay } from './components/MessageDisplay';
import { OutputHeader } from './components/OutputHeader';
import { PromptForm } from './components/PromptForm';
import { ProviderSelector } from './components/ProviderSelector';
import { TabStatusBar } from './components/TabStatusBar';
import { TokenUsageDisplay } from './components/TokenUsageDisplay';
import { useChromeMessaging } from './hooks/useChromeMessaging';
import { useMessageManagement } from './hooks/useMessageManagement';
import { useTabManagement } from './hooks/useTabManagement';
import { DownloadMarkdownMessage } from '../background/types';

export function SidePanel() {
  // State for tab status
  const [tabStatus, setTabStatus] = useState<'attached' | 'detached' | 'unknown' | 'running' | 'idle' | 'error'>('unknown');

  // State for approval requests
  const [approvalRequests, setApprovalRequests] = useState<Array<{
    requestId: string;
    toolName: string;
    toolInput: string;
    reason: string;
  }>>([]);

  // State to track if any LLM providers are configured
  const [hasConfiguredProviders, setHasConfiguredProviders] = useState<boolean>(false);
  
  // State for output window expansion
  const [isOutputExpanded, setIsOutputExpanded] = useState<boolean>(false);

  // Check if any providers are configured when component mounts
  useEffect(() => {
    const checkProviders = async () => {
      const configManager = ConfigManager.getInstance();
      const providers = await configManager.getConfiguredProviders();
      setHasConfiguredProviders(providers.length > 0);
    };
   
    checkProviders();

    const handleDownloadMarkdown = (message: DownloadMarkdownMessage) =>{
        const blob = new Blob([message.content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        chrome.downloads.download({
          url,
          filename: message.filename,
          saveAs: true,
        });
    }

    // Listen for provider configuration changes
    const handleMessage = (message: any) => {
      if (message.action === 'providerConfigChanged') {
        checkProviders();
      }
      if (message.action === 'download-markdown') {
        handleDownloadMarkdown(message);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  // Use custom hooks to manage state and functionality
  const {
    tabId,
    windowId,
    tabTitle,
    setTabTitle
  } = useTabManagement();

  const {
    messages,
    streamingSegments,
    isStreaming,
    isProcessing,
    setIsProcessing,
    outputRef,
    addMessage,
    addSystemMessage,
    updateStreamingChunk,
    finalizeStreamingSegment,
    startNewSegment,
    completeStreaming,
    clearMessages,
    currentSegmentId
  } = useMessageManagement();

  // Heartbeat interval for checking agent status
  useEffect(() => {
    if (!isProcessing) return;

    const interval = setInterval(() => {
      // Request agent status
      chrome.runtime.sendMessage({
        action: 'checkAgentStatus',
        tabId,
        windowId
      });
    }, 2000); // Check every 2 seconds

    return () => clearInterval(interval);
  }, [isProcessing, tabId, windowId]);

  // Handlers for approval requests
  const handleApprove = (requestId: string) => {
    // Send approval to the background script
    approveRequest(requestId);
    // Remove the request from the list
    setApprovalRequests(prev => prev.filter(req => req.requestId !== requestId));
    // Add a system message to indicate approval
    addSystemMessage(`✅ Approved action: ${requestId}`);
  };

  const handleReject = (requestId: string) => {
    // Send rejection to the background script
    rejectRequest(requestId);
    // Remove the request from the list
    setApprovalRequests(prev => prev.filter(req => req.requestId !== requestId));
    // Add a system message to indicate rejection
    addSystemMessage(`❌ Rejected action: ${requestId}`);
  };

  // Set up Chrome messaging with callbacks
  const {
    executePrompt,
    cancelExecution,
    clearHistory,
    approveRequest,
    rejectRequest
  } = useChromeMessaging({
    tabId,
    windowId,
    onUpdateOutput: (content) => {
      addMessage({ ...content, isComplete: true });
    },
    onUpdateStreamingChunk: (content) => {
      updateStreamingChunk(content.content);
    },
    onFinalizeStreamingSegment: (id, content) => {
      finalizeStreamingSegment(id, content);
    },
    onStartNewSegment: (id) => {
      startNewSegment(id);
    },
    onStreamingComplete: () => {
      completeStreaming();
    },
    onUpdateLlmOutput: (content) => {
      addMessage({ type: 'llm', content, isComplete: true });
    },
    onRateLimit: () => {
      addSystemMessage("⚠️ Rate limit reached. Retrying automatically...");
      setIsProcessing(true);
      setTabStatus('running');
    },
    onFallbackStarted: (message) => {
      addSystemMessage(message);
      setIsProcessing(true);
      setTabStatus('running');
    },
    onUpdateScreenshot: (content) => {
      addMessage({ ...content, isComplete: true });
    },
    onProcessingComplete: () => {
      setIsProcessing(false);
      completeStreaming();
      setTabStatus('idle');
    },
    onRequestApproval: (request) => {
      setApprovalRequests(prev => [...prev, request]);
    },
    setTabTitle,
    onTabStatusChanged: (status, _tabId) => {
      setTabStatus(status);
    },
    onTargetChanged: (_tabId, _url) => {
      // Handle target change
    },
    onActiveTabChanged: (oldTabId, newTabId, title, url) => {
      console.log(`SidePanel: Active tab changed from ${oldTabId} to ${newTabId}`);
      setTabTitle(title);
      addSystemMessage(`Switched to tab: ${title} (${url})`);
    },
    onPageDialog: (tabId, dialogInfo) => {
      addSystemMessage(`📢 Dialog: ${dialogInfo.type} - ${dialogInfo.message}`);
    },
    onPageError: (tabId, error) => {
      addSystemMessage(`❌ Page Error: ${error}`);
    },
    onAgentStatusUpdate: (status, lastHeartbeat) => {
      console.log(`Agent status update: ${status}, lastHeartbeat: ${lastHeartbeat}, diff: ${Date.now() - lastHeartbeat}ms`);

      if (status === 'running' || status === 'idle' || status === 'error') {
        setTabStatus(status);
      }

      if (status === 'running') {
        setIsProcessing(true);
      }

      if (status === 'idle') {
        setIsProcessing(false);
      }
    }
  });

  // Handle form submission
  const handleSubmit = async (prompt: string, role: string) => {
    setIsProcessing(true);
    setTabStatus('running');
    addSystemMessage(`New ${role} prompt: "${prompt}"`);

    try {
      await executePrompt(prompt, role);
    } catch (error) {
      console.error('Error:', error);
      addSystemMessage('Error: ' + (error instanceof Error ? error.message : String(error)));
      setIsProcessing(false);
      setTabStatus('error');
    }
  };

  // Handle cancellation
  const handleCancel = () => {
    if (approvalRequests.length > 0) {
      addSystemMessage(`❌ Cancelled execution - all pending approval requests were automatically rejected`);
      approvalRequests.forEach(req => {
        rejectRequest(req.requestId);
      });
      setApprovalRequests([]);
    }

    cancelExecution();
    setTabStatus('idle');
  };

  // Handle clearing history
  const handleClearHistory = () => {
    clearMessages();
    clearHistory();

    const tokenTracker = TokenTrackingService.getInstance();
    tokenTracker.reset();
  };

  // Handle reflect and learn
  const handleReflectAndLearn = () => {
    chrome.runtime.sendMessage({
      action: 'reflectAndLearn',
      tabId
    });

    addSystemMessage("🧠 Reflecting on this session to learn useful patterns...");
  };

  // Function to navigate to the options page
  const navigateToOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  // Function to toggle output expansion
  const toggleOutputExpansion = () => {
    setIsOutputExpanded(!isOutputExpanded);
  };

  // Get dynamic gradient based on status - now with bright colors
  const getStatusGradient = () => {
    switch (tabStatus) {
      case 'running':
        return 'from-sky-300 via-blue-300 to-indigo-300';
      case 'error':
        return 'from-rose-300 via-pink-300 to-red-300';
      case 'idle':
        return 'from-emerald-300 via-teal-300 to-cyan-300';
      default:
        return 'from-sky-200 via-blue-200 to-indigo-200';
    }
  };

  // Get status accent color
  const getStatusAccent = () => {
    switch (tabStatus) {
      case 'running':
        return 'from-blue-500 to-indigo-500';
      case 'error':
        return 'from-rose-500 to-red-500';
      case 'idle':
        return 'from-emerald-500 to-teal-500';
      default:
        return 'from-sky-500 to-blue-500';
    }
  };

  return (
    <div className="flex flex-col h-screen relative overflow-hidden bg-gradient-to-br from-sky-50 to-blue-100">
      {/* Bright Animated Background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${getStatusGradient()} opacity-60 transition-all duration-1000`}>
        <div className="absolute inset-0 bg-gradient-to-t from-white/30 to-transparent"></div>
        {/* Floating shapes for visual interest */}
        <div className="absolute top-10 left-10 w-32 h-32 bg-white/20 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-24 h-24 bg-sky-200/30 rounded-full blur-lg animate-bounce"></div>
        <div className="absolute top-1/3 right-1/4 w-16 h-16 bg-blue-200/20 rounded-full blur-md animate-ping"></div>
      </div>

      {/* Main Container with bright glassmorphism */}
      <div className="relative z-10 flex flex-col h-full p-3 transition-all duration-300">
        
        {/* Compact Header - Reduced margin */}
        {!isOutputExpanded && (
          <header className="mb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${getStatusAccent()} shadow-lg flex items-center justify-center transform hover:scale-105 transition-transform duration-200`}>
                  <span className="text-xl">🤖</span>
                </div>
                <div>
                  <h1 className="text-2xl font-black text-gray-800 tracking-tight">BrowserOnly</h1>
                  <div className="text-xs text-sky-600 font-semibold">Your AI Browser Assistant</div>
                </div>
              </div>
              
              <TabStatusBar 
                tabId={tabId}
                tabTitle={tabTitle}
                tabStatus={tabStatus}
              />
            </div>
          </header>
        )}

        {hasConfiguredProviders ? (
  <>
    {/* Main Content Area with Bright Cards - Increased flex-1 priority */}
    <div className={`flex-grow flex flex-col gap-3 transition-all duration-300 ${isOutputExpanded ? 'fixed inset-4 z-50 bg-sky-50/95 backdrop-blur-md rounded-3xl p-4 overflow-hidden' : 'overflow-hidden min-h-0'}`}>
      
      {/* Chat Display Area - Maximized height */}
      <div className={`${isOutputExpanded ? 'flex-1' : 'flex-1 min-h-0'} bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg border border-white/50 overflow-hidden transition-all duration-300`}>
        <div className="bg-gradient-to-r from-sky-50 to-blue-50 border-b border-sky-100 flex items-center justify-between px-4 py-2">
          {/* OutputHeader - 只显示标题 */}
          <div className="text-xl font-bold text-gray-800">
            Output
          </div>
          
          {/* 按钮组：OutputHeader功能按钮 + 展开控制 */}
          <div className="flex items-center gap-2">
            {/* Reflect 按钮 */}
            <div className="tooltip tooltip-bottom" data-tip="Reflect and learn from this session">
              <button 
                onClick={handleReflectAndLearn}
                className="btn btn-sm bg-gradient-to-r from-sky-500 to-blue-600 border-0 text-white hover:from-sky-600 hover:to-blue-700 shadow-lg rounded-xl transform hover:scale-105 transition-all duration-200"
                disabled={isProcessing}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </button>
            </div>
            
            {/* Clear 按钮 */}
            <div className="tooltip tooltip-bottom" data-tip="Clear conversation history and LLM context">
              <button 
                onClick={handleClearHistory}
                className="btn btn-sm bg-white/70 backdrop-blur-sm border border-gray-200 text-gray-700 hover:bg-white/90 hover:border-gray-300 shadow-md rounded-xl transform hover:scale-105 transition-all duration-200"
                disabled={isProcessing}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
            
            {/* 分隔线 */}
            <div className="w-px h-6 bg-gray-300 mx-2"></div>
            
            {/* 展开/收缩按钮 */}
            <button
              onClick={toggleOutputExpansion}
              className={`btn btn-sm btn-circle ${isOutputExpanded ? 'bg-red-500 hover:bg-red-600 text-white border-0' : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white border-0'} shadow-lg hover:scale-110 transition-all duration-200 z-50 pointer-events-auto`}
              title={isOutputExpanded ? 'Minimize window' : 'Expand window'}
            >
              {isOutputExpanded ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              )}
            </button>
          </div>
        </div>
        <div
          ref={outputRef}
          className={`p-6 overflow-auto flex-1 bg-gradient-to-b from-white/50 to-sky-50/30 ${isOutputExpanded ? 'h-full max-h-full' : ''}`}
          style={isOutputExpanded ? { height: 'calc(100vh - 200px)', maxHeight: 'calc(100vh - 200px)' } : { maxHeight: 'calc(100% - 60px)' }}
        >
          <MessageDisplay
            messages={messages}
            streamingSegments={streamingSegments}
            isStreaming={isStreaming}
          />
        </div>
      </div>

      {/* Approval Requests with Bright Styling - Only shown when not expanded */}
      {!isOutputExpanded && approvalRequests.map(req => (
        <div key={req.requestId} className="bg-amber-100/80 backdrop-blur-sm rounded-2xl shadow-lg border border-amber-200/50 p-4">
          <ApprovalRequest
            requestId={req.requestId}
            toolName={req.toolName}
            toolInput={req.toolInput}
            reason={req.reason}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        </div>
      ))}
    </div>

    {/* Bottom Input Section - Hide when expanded */}
    {!isOutputExpanded && (
      <div className="mt-3 space-y-3 flex-shrink-0">
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg border border-white/50 p-4">
          <PromptForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isProcessing={isProcessing}
            tabStatus={tabStatus}
          />
        </div>
        
        {/* Merged Provider and Token Section */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 p-3">
          <div className="flex items-center justify-between gap-4">
            {/* Provider Selector takes more space */}
            <div className="flex-1">
              <ProviderSelector isProcessing={isProcessing} />
            </div>
            
            {/* Vertical divider */}
            <div className="w-px h-8 bg-gray-300"></div>
            
            {/* Compact Token Usage Display */}
            <div className="flex-shrink-0">
              <TokenUsageDisplay />
            </div>
          </div>
        </div>
      </div>
    )}
  </>
) : (
  /* No Provider Configured State - Bright Version */
  <div className="flex-1 flex items-center justify-center">
    <div className="text-center max-w-sm">
      <div className="w-32 h-32 mx-auto mb-8 rounded-3xl bg-white/80 backdrop-blur-sm shadow-2xl border border-white/50 flex items-center justify-center transform hover:scale-105 transition-transform duration-300">
        <span className="text-6xl">⚙️</span>
      </div>
      
      <h2 className="text-3xl font-bold text-gray-800 mb-4">Let's Get Started!</h2>
      <p className="text-gray-600 mb-8 leading-relaxed text-lg">
        Configure your AI provider to unlock powerful browser automation and assistance features.
      </p>
      
      <button
        onClick={navigateToOptions}
        className="btn btn-lg bg-gradient-to-r from-sky-500 to-blue-600 border-0 text-white hover:from-sky-600 hover:to-blue-700 shadow-2xl rounded-2xl transform hover:scale-105 transition-all duration-300"
      >
        <span className="mr-3 text-xl">🚀</span>
        Configure Providers
      </button>
      
      <div className="mt-6 flex justify-center space-x-4">
        <div className="w-2 h-2 bg-sky-400 rounded-full animate-pulse"></div>
        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
      </div>
    </div>
  </div>
)}

        {/* Bright Floating Elements */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-16 left-16 w-3 h-3 bg-sky-400/60 rounded-full animate-bounce"></div>
          <div className="absolute top-32 right-24 w-2 h-2 bg-blue-400/50 rounded-full animate-ping"></div>
          <div className="absolute bottom-32 left-24 w-4 h-4 bg-indigo-300/40 rounded-full animate-pulse"></div>
          <div className="absolute bottom-16 right-16 w-2.5 h-2.5 bg-sky-300/60 rounded-full animate-bounce" style={{animationDelay: '1s'}}></div>
        </div>
      </div>
    </div>
  );
}