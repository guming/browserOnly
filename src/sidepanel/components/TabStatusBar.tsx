import { faSync } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState, useEffect } from 'react';

interface TabStatusBarProps {
  tabId: number | null;
  tabTitle: string;
  tabStatus: 'attached' | 'detached' | 'unknown' | 'running' | 'idle' | 'error';
}

export const TabStatusBar: React.FC<TabStatusBarProps> = ({
  tabId,
  tabTitle,
  tabStatus
}) => {
  const [tabUrl, setTabUrl] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Listen for URL changes only
  useEffect(() => {
    if (!tabId) return;
    
    const statusListener = (
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      // Ignore messages from other extensions
      if (sender.id !== chrome.runtime.id) {
        return;
      }
      
      // Only process messages for our tab
      if (message.tabId !== tabId) {
        return;
      }
      
      // Update URL based on message type
      if (message.action === 'targetChanged' && message.url) {
        setTabUrl(message.url);
        sendResponse({ received: true });
      }
      
      return true;
    };
    
    // Add the message listener
    chrome.runtime.onMessage.addListener(statusListener);
    
    // Get initial tab URL
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting tab:', chrome.runtime.lastError);
        return;
      }
      
      if (tab && tab.url) {
        setTabUrl(tab.url);
      }
    });
    
    // Clean up the listener when the component unmounts
    return () => {
      chrome.runtime.onMessage.removeListener(statusListener);
    };
  }, [tabId]);
  
  if (!tabId) return null;
  
  const handleTabClick = () => {
    // Send message to background script to switch to this tab
    chrome.runtime.sendMessage({ 
      action: 'switchToTab', 
      tabId 
    });
  };
  
  const handleRefresh = () => {
    setIsRefreshing(true);
    
    // Show a message to the user
    chrome.runtime.sendMessage({
      action: 'updateOutput',
      content: {
        type: 'system',
        content: 'Refreshing connection to tab...'
      }
    });
    
    // Reload the page to reinitialize tab connection
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };
  
  return (
    <div className="text-sm bg-white/80 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/50 shadow-md flex items-center justify-between max-w-[240px] transition-all duration-200 hover:shadow-lg">
      <div className="flex items-center flex-grow overflow-hidden">
      <div className={`w-2.5 h-2.5 rounded-full mr-3 flex-shrink-0 shadow-sm ${
        tabStatus === 'attached' ? 'bg-emerald-500 shadow-emerald-200 animate-pulse' : 
        tabStatus === 'detached' ? 'bg-red-500 shadow-red-200' : 
        tabStatus === 'running' ? 'bg-blue-500 shadow-blue-200 animate-pulse' :
        tabStatus === 'idle' ? 'bg-emerald-500 shadow-emerald-200' :
        tabStatus === 'error' ? 'bg-red-500 shadow-red-200 animate-pulse' : 'bg-amber-500 shadow-amber-200'
      }`} title={
        tabStatus === 'attached' ? 'Connected' : 
        tabStatus === 'detached' ? 'Disconnected' : 
        tabStatus === 'running' ? 'Agent Running' :
        tabStatus === 'idle' ? 'Agent Idle' :
        tabStatus === 'error' ? 'Agent Error' : 'Unknown'
      }></div>
      <span 
        className="cursor-pointer hover:text-sky-600 truncate text-gray-700 font-medium transition-colors duration-200 hover:underline decoration-sky-400 underline-offset-2"
        onClick={handleTabClick}
        title={`${tabTitle}${tabUrl ? `\n${tabUrl}` : ''}`}
      > 
        {tabTitle}
      </span>
      </div>
    
      <div className="flex items-center ml-3">
      <button 
        className="px-2 py-1 bg-gradient-to-r from-sky-100 to-blue-100 hover:from-sky-200 hover:to-blue-200 text-sky-700 hover:text-sky-800 rounded-lg text-xs border border-sky-200 hover:border-sky-300 shadow-sm hover:shadow transition-all duration-200 transform hover:scale-105"
        onClick={handleRefresh}
        disabled={isRefreshing}
        title="Attach to current tab"
      >
        <svg 
          className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
      </div>
    </div>
);
};
