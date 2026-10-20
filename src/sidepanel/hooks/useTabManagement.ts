import { useState, useEffect, useRef } from 'react';

export const useTabManagement = () => {
  const [tabId, setTabId] = useState<number | null>(null);
  const [windowId, setWindowId] = useState<number | null>(null);
  const [tabTitle, setTabTitle] = useState<string>('');
  const currentTabIdRef = useRef<number | null>(null);
  currentTabIdRef.current = tabId;

  // Keep the side panel attached to the browser's active tab. The initial
  // query can race with tab activation when the panel reopens, so listen for
  // activation immediately and recover after the selected tab closes.
  useEffect(() => {
    let disposed = false;
    let activationObserved = false;
    let activeWindowId: number | null = null;

    const syncActiveTab = (tab: chrome.tabs.Tab | undefined) => {
      if (disposed || !tab || typeof tab.id !== 'number') return;
      setTabId(tab.id);
      currentTabIdRef.current = tab.id;
      if (typeof tab.windowId === 'number') {
        activeWindowId = tab.windowId;
        setWindowId(tab.windowId);
      }
      setTabTitle(tab.title || 'Unknown Tab');
    };

    const getCurrentTab = async () => {
      try {
        let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (activationObserved) {
          tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        }
        const activeTab = tabs?.[0];
        if (activeTab && typeof activeTab.id === 'number') {
          syncActiveTab(activeTab);
          const activeTabId = activeTab.id;
          const activeWindowId = activeTab.windowId;
          console.log(`Using tab ID ${activeTabId} in window ${activeWindowId} from last focused window`);
          console.log(`Tab title: ${activeTab.title || 'Unknown Tab'}`);

          // Initialize tab attachment early, including the window ID
          chrome.runtime.sendMessage({
            action: 'initializeTab',
            tabId: activeTabId,
            windowId: activeWindowId
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('Error initializing tab:', chrome.runtime.lastError);
            } else if (response && response.success) {
              console.log(`Tab ${activeTabId} in window ${activeWindowId} initialized successfully`);
            }
          });
        }
      } catch (error) {
        console.error('Error getting current tab:', error);
      }
    };

    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      if (activeWindowId !== null && activeInfo.windowId !== activeWindowId) return;
      activationObserved = true;
      chrome.tabs.get(activeInfo.tabId, syncActiveTab);
    };

    const handleTabRemoved = (removedTabId: number) => {
      if (currentTabIdRef.current !== removedTabId) return;
      currentTabIdRef.current = null;
      setTabId(null);
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
        if (!chrome.runtime.lastError) syncActiveTab(tabs?.[0]);
      });
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onRemoved.addListener(handleTabRemoved);
    getCurrentTab();

    return () => {
      disposed = true;
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onRemoved.removeListener(handleTabRemoved);
    };
  }, []);

  // Listen for tab updates to update the tab title in real-time
  useEffect(() => {
    if (tabId === null) return;

    const handleTabUpdated = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo, _tab: chrome.tabs.Tab) => {
      // Only update if this is our tab and the title has changed
      if (updatedTabId === tabId && changeInfo.title) {
        console.log(`Tab ${updatedTabId} title updated to: ${changeInfo.title}`);
        setTabTitle(changeInfo.title);
      }
    };

    // Add listener for tab updates
    chrome.tabs.onUpdated.addListener(handleTabUpdated);

    // Clean up listener when component unmounts or tabId changes
    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
    };
  }, [tabId]);

  // Listen for tab replacement and active tab change events
  useEffect(() => {
    if (tabId === null) return;

    const messageListener = (
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      // Handle tab replacement
      if (message.action === 'tabReplaced' && message.oldTabId === tabId) {
        console.log(`Tab ${tabId} was replaced with new tab ${message.newTabId}`);

        // Update the tab ID and title
        setTabId(message.newTabId);
        setTabTitle(message.title || "New BrowserOnly Tab");
        
        sendResponse({ received: true });
        return true;
      }

      // Handle active tab changed by the agent
      if (message.action === 'updateActiveTab' && message.oldTabId === tabId) {
        console.log(`Active tab changed from ${message.oldTabId} to ${message.newTabId}`);

        // Update the tab ID and title
        setTabId(message.newTabId);
        setTabTitle(message.title || "Unknown Tab");

        // Add a system message to indicate the tab change
        chrome.runtime.sendMessage({
          action: 'updateOutput',
          content: {
            type: 'system',
            content: `Switched to tab: ${message.title} (${message.url})`
          }
        });

        sendResponse({ received: true });
        return true;
      }

      return false;
    };

    // Add the message listener
    chrome.runtime.onMessage.addListener(messageListener);

    // Clean up the listener when the component unmounts or tabId changes
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [tabId]);

  return {
    tabId,
    windowId,
    tabTitle,
    setTabTitle
  };
};
