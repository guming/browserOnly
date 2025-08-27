import { useState, useEffect, useCallback } from 'react';
import { logWithTimestamp } from '../../background/utils';

interface UseTabSelectionProps {
  setTabTitle: (title: string) => void;
  setTabStatus: (status: 'attached' | 'detached' | 'unknown' | 'running' | 'idle' | 'error') => void;
  windowId?: number|null;
}

export const useTabSelection = ({ 
  setTabTitle, 
  setTabStatus,
  windowId,
  onTabChanged
}: UseTabSelectionProps & { onTabChanged?: (tabId: number) => void }) => {
  const [selectedTabHistory, setSelectedTabHistory] = useState<number[]>([]);
  const [isTabSwitching, setIsTabSwitching] = useState(false);

  // 核心的tab选择函数
  const handleTabSelect = useCallback(async (newTabId: number) => {
    if (isTabSwitching) {
      logWithTimestamp('⚠️ Tab switch already in progress...');
      return;
    }

    setIsTabSwitching(true);
    
    try {
      logWithTimestamp(`🔄 Switching to tab ${newTabId}...`);

      // 更新历史记录
      setSelectedTabHistory(prev => {
        const newHistory = [newTabId, ...prev.filter(id => id !== newTabId)];
        return newHistory.slice(0, 5);
      });

      // 修复Bug2: 立即通知父组件tab已更改
      if (onTabChanged) {
        onTabChanged(newTabId);
      }

      // 1. 发送切换tab消息
      chrome.runtime.sendMessage({ 
        action: 'switchToTab', 
        tabId: newTabId 
      });

      // 2. 获取tab信息
      chrome.tabs.get(newTabId, (tab) => {
        if (chrome.runtime.lastError) {
          console.error('Error getting tab info:', chrome.runtime.lastError);
          logWithTimestamp(`❌ Failed to get tab: ${chrome.runtime.lastError.message}`);
          setIsTabSwitching(false);
          return;
        }
        
        if (tab) {
          setTabTitle(tab.title || 'Untitled');
          logWithTimestamp(`✅ Switched to: ${tab.title} (${tab.url})`);
          setTabStatus('unknown'); // 等待状态更新
        }
      });

      // 3. 建立与新tab的连接
      chrome.runtime.sendMessage({
        action: 'attachToTab',
        tabId: newTabId
      });

      // 4. 检查agent状态
      if (windowId) {
        chrome.runtime.sendMessage({
          action: 'checkAgentStatus',
          tabId: newTabId,
          windowId
        });
      }

      // 5. 保存到本地存储
      chrome.storage.local.set({
        selectedTabId: newTabId,
        selectedTabHistory: [newTabId, ...selectedTabHistory.filter(id => id !== newTabId)].slice(0, 5),
        lastSelectedTime: Date.now()
      });

    } catch (error) {
      console.error('Error selecting tab:', error);
      logWithTimestamp(`❌ Failed to switch tab: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsTabSwitching(false);
    }
  }, [logWithTimestamp, setTabTitle, setTabStatus, windowId, selectedTabHistory, isTabSwitching]);

  // 带重试机制的tab选择
  const handleTabSelectWithRetry = useCallback(async (newTabId: number, retryCount = 0) => {
    const maxRetries = 3;
    
    try {
      await handleTabSelect(newTabId);
    } catch (error) {
      if (retryCount < maxRetries) {
        logWithTimestamp(`⚠️ Retrying tab switch... (${retryCount + 1}/${maxRetries})`);
        
        setTimeout(() => {
          handleTabSelectWithRetry(newTabId, retryCount + 1);
        }, 1000 * (retryCount + 1));
      } else {
        logWithTimestamp(`❌ Failed to switch tab after ${maxRetries} attempts`);
      }
    }
  }, [handleTabSelect, logWithTimestamp]);

  // 监听tab事件
  useEffect(() => {
    const handleTabUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (selectedTabHistory.includes(updatedTabId)) {
        if (changeInfo.title && tab.title) {
          // 如果是当前选中的tab（历史记录第一个），更新标题
          if (selectedTabHistory[0] === updatedTabId) {
            setTabTitle(tab.title);
          }
        }
        
        if (changeInfo.url && tab.url) {
          logWithTimestamp(`🌐 Tab ${updatedTabId} URL changed: ${tab.url}`);
        }
      }
    };

    const handleTabRemoved = (removedTabId: number) => {
      if (selectedTabHistory.includes(removedTabId)) {
        // 从历史记录中移除
        setSelectedTabHistory(prev => prev.filter(id => id !== removedTabId));
        
        // 如果删除的是当前选中的tab
        if (selectedTabHistory[0] === removedTabId) {
          logWithTimestamp(`🗑️ Current tab was closed`);
          setTabStatus('detached');
          
          // 自动切换到历史记录中的下一个tab
          const nextTabId = selectedTabHistory.find(id => id !== removedTabId);
          if (nextTabId) {
            logWithTimestamp(`🔄 Auto-switching to previous tab...`);
            setTimeout(() => handleTabSelect(nextTabId), 500);
          }
        }
      }
    };

    chrome.tabs.onUpdated.addListener(handleTabUpdated);
    chrome.tabs.onRemoved.addListener(handleTabRemoved);

    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
      chrome.tabs.onRemoved.removeListener(handleTabRemoved);
    };
  }, [selectedTabHistory, logWithTimestamp, setTabTitle, setTabStatus, handleTabSelect]);

  // 从本地存储恢复历史记录
  useEffect(() => {
    const restoreTabHistory = async () => {
      try {
        const result = await chrome.storage.local.get(['selectedTabHistory', 'selectedTabId']);
        
        if (result.selectedTabHistory) {
          setSelectedTabHistory(result.selectedTabHistory);
        }
        
        // 可选：恢复上次选择的tab
        if (result.selectedTabId) {
          chrome.tabs.get(result.selectedTabId, (tab) => {
            if (!chrome.runtime.lastError && tab) {
              console.log('Found previously selected tab:', tab.title);
            }
          });
        }
      } catch (error) {
        console.error('Error restoring tab history:', error);
      }
    };

    restoreTabHistory();
  }, []);

  // 获取最近使用的tabs用于快速切换
  const getRecentTabs = useCallback(async () => {
    try {
      const recentTabIds = selectedTabHistory.slice(1, 4); // 除当前tab外的最近3个
      const tabs = [];
      
      for (const tabId of recentTabIds) {
        try {
          const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
            chrome.tabs.get(tabId, (tab) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(tab);
              }
            });
          });
          tabs.push(tab);
        } catch (error) {
          // Tab已经不存在，从历史记录中移除
          setSelectedTabHistory(prev => prev.filter(id => id !== tabId));
        }
      }
      
      return tabs;
    } catch (error) {
      console.error('Error getting recent tabs:', error);
      return [];
    }
  }, [selectedTabHistory]);

  return {
    handleTabSelect: handleTabSelectWithRetry,
    selectedTabHistory,
    isTabSwitching,
    getRecentTabs
  };
};