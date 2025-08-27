import { faSync, faChevronDown, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState, useEffect, useRef } from 'react';

interface TabInfo {
  id: number;
  title: string;
  url: string;
  status: 'attached' | 'detached' | 'unknown' | 'running' | 'idle' | 'error';
}

interface MultiTabStatusBarProps {
  selectedTabId: number | null;
  onTabSelect: (tabId: number) => void;
}

export const MultiTabStatusBar: React.FC<MultiTabStatusBarProps> = ({
  selectedTabId,
  onTabSelect
}) => {
  const [availableTabs, setAvailableTabs] = useState<TabInfo[]>([]);
  const [selectedTab, setSelectedTab] = useState<TabInfo | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tabUrl, setTabUrl] = useState<string>('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 监听点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 获取所有可用的tabs
  useEffect(() => {
    const fetchTabs = async () => {
      try {
        const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
          chrome.tabs.query({}, resolve);
        });

        const tabInfos: TabInfo[] = tabs
          .filter(tab => tab.id && tab.url && !tab.url.startsWith('chrome://'))
          .map(tab => ({
            id: tab.id!,
            title: tab.title || 'Untitled',
            url: tab.url || '',
            status: tab.id === selectedTabId ? 'attached' : 'detached'
          }));

        setAvailableTabs(tabInfos);
      } catch (error) {
        console.error('Error fetching tabs:', error);
      }
    };

    fetchTabs();
  }, [selectedTabId]);

  // 监听消息更新tab状态
  useEffect(() => {
    if(!selectedTabId) return;
    const statusListener = (
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      if (sender.id !== chrome.runtime.id) return;

      if (message.action === 'targetChanged' && message.tabId && message.url) {
        setTabUrl(message.url);
        setAvailableTabs(prev => prev.map(tab => 
          tab.id === message.tabId 
            ? { ...tab, url: message.url }
            : tab
        ));
        sendResponse({ received: true });
      }

      if (message.action === 'tabStatusUpdate') {
        setAvailableTabs(prev => prev.map(tab => 
          tab.id === message.tabId 
            ? { ...tab, status: message.status }
            : tab
        ));
      }

      return true;
    };
    // Get initial tab URL for selected tab
    chrome.tabs.get(selectedTabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting tab:', chrome.runtime.lastError);
        return;
      }
      
      if (tab && tab.url) {
        setTabUrl(tab.url);
      }
    });

    chrome.runtime.onMessage.addListener(statusListener);
    return () => chrome.runtime.onMessage.removeListener(statusListener);
  }, [selectedTabId]);

  // 更新当前选中的tab信息
  useEffect(() => {
    const current = availableTabs.find(tab => tab.id === selectedTabId);
    console.log("the current:",current);
    setSelectedTab(current || null);
  }, [selectedTabId, availableTabs]);

  const handleTabSelect = (tab: TabInfo) => {
    onTabSelect(tab.id);
    setIsDropdownOpen(false);
    
    // 发送消息切换到选中的tab
    chrome.runtime.sendMessage({ 
      action: 'switchToTab', 
      tabId: tab.id
    });
    handleRefresh();
  };

  const handleTabClick = () => {
    if (selectedTab) {
      chrome.runtime.sendMessage({ 
        action: 'switchToTab', 
        tabId: selectedTab.id 
      });
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    
    chrome.runtime.sendMessage({
      action: 'updateOutput',
      content: {
        type: 'system',
        content: 'Refreshing connection to tab...'
      }
    });
    
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const getStatusConfig = (status: TabInfo['status']) => {
    switch (status) {
      case 'attached':
        return { 
          className: 'bg-emerald-500 shadow-emerald-200 animate-pulse',
          title: 'Connected'
        };
      case 'detached':
        return {
          className: 'bg-red-500 shadow-red-200',
          title: 'Disconnected'
        };
      case 'running':
        return {
          className: 'bg-blue-500 shadow-blue-200 animate-pulse',
          title: 'Agent Running'
        };
      case 'idle':
        return {
          className: 'bg-emerald-500 shadow-emerald-200',
          title: 'Agent Idle'
        };
      case 'error':
        return {
          className: 'bg-red-500 shadow-red-200 animate-pulse',
          title: 'Agent Error'
        };
      default:
        return {
          className: 'bg-amber-500 shadow-amber-200',
          title: 'Unknown'
        };
    }
  };

  if (!selectedTab) {
    return (
      <div className="text-sm bg-white/80 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/50 shadow-md flex items-center justify-between max-w-[240px] transition-all duration-200 hover:shadow-lg">
        <span className="text-gray-500">No tab selected</span>
        <div className="relative" ref={dropdownRef}>
          <button
            className="px-2 py-1 bg-gradient-to-r from-sky-100 to-blue-100 hover:from-sky-200 hover:to-blue-200 text-sky-700 hover:text-sky-800 rounded-lg text-xs border border-sky-200 hover:border-sky-300 shadow-sm hover:shadow transition-all duration-200 transform hover:scale-105 flex items-center"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
          </button>
          
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-64 overflow-y-auto">
              <div className="p-2">
                <div className="text-xs text-gray-500 px-2 py-1 font-medium">Select a tab to connect:</div>
                {availableTabs.map(tab => (
                  <div
                    key={tab.id}
                    className="flex items-center p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors duration-150"
                    onClick={() => handleTabSelect(tab)}
                  >
                    <div className={`w-2 h-2 rounded-full mr-2 flex-shrink-0 shadow-sm ${getStatusConfig(tab.status).className}`}></div>
                    <div className="flex-grow overflow-hidden">
                      <div className="text-sm font-medium text-gray-900 truncate">{tab.title}</div>
                      <div className="text-xs text-gray-500 truncate">{tab.url}</div>
                    </div>
                  </div>
                ))}
                {availableTabs.length === 0 && (
                  <div className="text-xs text-gray-400 px-2 py-4 text-center">No available tabs</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(selectedTab.status);

  return (
    <div className="text-sm bg-white/80 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/50 shadow-md flex items-center justify-between max-w-[280px] transition-all duration-200 hover:shadow-lg">
      <div className="flex items-center flex-grow overflow-hidden">
        <div 
          className={`w-2.5 h-2.5 rounded-full mr-3 flex-shrink-0 shadow-sm ${statusConfig.className}`}
          title={statusConfig.title}
        ></div>
        <span 
          className="cursor-pointer hover:text-sky-600 truncate text-gray-700 font-medium transition-colors duration-200 hover:underline decoration-sky-400 underline-offset-2"
          onClick={handleTabClick}
          title={`${selectedTab.title}\n${selectedTab.url}`}
        > 
          {selectedTab.title}
        </span>
      </div>

      <div className="flex items-center ml-3 space-x-1">
        {/* Tab选择下拉菜单 */}
        <div className="relative" ref={dropdownRef}>
          <button
            className="px-2 py-1 bg-gradient-to-r from-gray-100 to-gray-100 hover:from-gray-200 hover:to-gray-200 text-gray-600 hover:text-gray-700 rounded-lg text-xs border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow transition-all duration-200 transform hover:scale-105"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            title="Switch tab"
          >
            <FontAwesomeIcon icon={faChevronDown} className="w-3 h-3" />
          </button>
          
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-64 overflow-y-auto">
              <div className="p-2">
                <div className="text-xs text-gray-500 px-2 py-1 font-medium">Available tabs:</div>
                {availableTabs.map(tab => (
                  <div
                    key={tab.id}
                    className={`flex items-center p-2 rounded-lg cursor-pointer transition-colors duration-150 ${
                      tab.id === selectedTabId 
                        ? 'bg-sky-50 border border-sky-200' 
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleTabSelect(tab)}
                  >
                    <div className={`w-2 h-2 rounded-full mr-2 flex-shrink-0 shadow-sm ${getStatusConfig(tab.status).className}`}></div>
                    <div className="flex-grow overflow-hidden">
                      <div className={`text-sm font-medium truncate ${
                        tab.id === selectedTabId ? 'text-sky-900' : 'text-gray-900'
                      }`}>
                        {tab.title}
                        {tab.id === selectedTabId && <span className="text-sky-600 ml-1">✓</span>}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{tab.url}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 刷新按钮 */}
        <button 
          className="px-2 py-1 bg-gradient-to-r from-sky-100 to-blue-100 hover:from-sky-200 hover:to-blue-200 text-sky-700 hover:text-sky-800 rounded-lg text-xs border border-sky-200 hover:border-sky-300 shadow-sm hover:shadow transition-all duration-200 transform hover:scale-105"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh connection"
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