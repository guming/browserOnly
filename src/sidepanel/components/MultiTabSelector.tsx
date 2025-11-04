import React, { useState, useEffect, useRef } from 'react';

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  selected: boolean;
}

interface MultiTabSelectorProps {
  onTabsSelected: (tabs: TabInfo[]) => void;
  isVisible: boolean;
  onClose: () => void;
  initialSelectedTabIds?: number[];
}

export const MultiTabSelector: React.FC<MultiTabSelectorProps> = ({
  onTabsSelected,
  isVisible,
  onClose,
  initialSelectedTabIds = []
}) => {
  const [availableTabs, setAvailableTabs] = useState<TabInfo[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<Set<number>>(new Set());
  const modalRef = useRef<HTMLDivElement>(null);

  // Fetch available tabs when component becomes visible
  useEffect(() => {
    if (isVisible) {
      fetchTabs();
    }
  }, [isVisible]);

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible, onClose]);

  const fetchTabs = async () => {
    try {
      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
        chrome.tabs.query({}, resolve);
      });

      const tabInfos: TabInfo[] = tabs
        .filter(tab => tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://'))
        .map(tab => ({
          id: tab.id!,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          selected: initialSelectedTabIds.includes(tab.id!)
        }));

      setAvailableTabs(tabInfos);

      // Restore previously selected tabs
      const initialSelected = new Set(initialSelectedTabIds.filter(id =>
        tabInfos.some(tab => tab.id === id)
      ));
      setSelectedTabs(initialSelected);
    } catch (error) {
      console.error('Error fetching tabs:', error);
    }
  };

  const handleTabToggle = (tabId: number) => {
    const newSelectedTabs = new Set(selectedTabs);
    if (newSelectedTabs.has(tabId)) {
      newSelectedTabs.delete(tabId);
    } else {
      newSelectedTabs.add(tabId);
    }
    setSelectedTabs(newSelectedTabs);

    setAvailableTabs(prev =>
      prev.map(tab => ({
        ...tab,
        selected: newSelectedTabs.has(tab.id)
      }))
    );
  };

  const handleSelectAll = () => {
    if (selectedTabs.size === availableTabs.length) {
      // Deselect all
      setSelectedTabs(new Set());
      setAvailableTabs(prev => prev.map(tab => ({ ...tab, selected: false })));
    } else {
      // Select all
      const allTabIds = new Set(availableTabs.map(tab => tab.id));
      setSelectedTabs(allTabIds);
      setAvailableTabs(prev => prev.map(tab => ({ ...tab, selected: true })));
    }
  };

  const handleClearAll = () => {
    setSelectedTabs(new Set());
    setAvailableTabs(prev => prev.map(tab => ({ ...tab, selected: false })));
  };

  const handleAnalyzeTabs = () => {
    const selectedTabsInfo = availableTabs.filter(tab => selectedTabs.has(tab.id));
    onTabsSelected(selectedTabsInfo);
    onClose();
  };

  const getDomainFromUrl = (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl border border-white/50 w-full max-w-2xl max-h-[80vh] overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-50 to-blue-50 border-b border-sky-100 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <span className="text-2xl">🔍</span>
                Select Tabs for Research Analysis
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Choose tabs to analyze together for comprehensive research
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center transition-colors duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="bg-sky-25 border-b border-sky-100 px-4 py-2">
          <div className="flex items-center justify-between text-sm">
            <div className="text-gray-600">
              {selectedTabs.size} of {availableTabs.length} tabs selected
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSelectAll}
                className="text-sky-600 hover:text-sky-700 font-medium hover:underline transition-colors duration-200"
              >
                {selectedTabs.size === availableTabs.length ? 'Deselect All' : 'Select All'}
              </button>
              {selectedTabs.size > 0 && (
                <>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={handleClearAll}
                    className="text-red-600 hover:text-red-700 font-medium hover:underline transition-colors duration-200"
                  >
                    Clear All
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tab List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-96">
          {availableTabs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">📭</div>
              <div>No tabs available for analysis</div>
            </div>
          ) : (
            availableTabs.map(tab => (
              <div
                key={tab.id}
                className={`flex items-center p-3 rounded-xl border cursor-pointer transition-all duration-200 hover:shadow-md ${
                  tab.selected
                    ? 'bg-sky-50 border-sky-200 shadow-sm'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}
                onClick={() => handleTabToggle(tab.id)}
              >
                <div className="flex-shrink-0 mr-3">
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors duration-200 ${
                      tab.selected
                        ? 'bg-sky-500 border-sky-500'
                        : 'border-gray-300 hover:border-sky-400'
                    }`}
                  >
                    {tab.selected && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="font-medium text-gray-900 truncate">{tab.title}</div>
                  <div className="text-sm text-gray-500 truncate mt-0.5">
                    <span className="inline-flex items-center">
                      <span className="w-2 h-2 bg-green-400 rounded-full mr-2 flex-shrink-0"></span>
                      {getDomainFromUrl(tab.url)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {selectedTabs.size > 0 && (
                <span>Ready to analyze {selectedTabs.size} tab{selectedTabs.size > 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-700 font-medium transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAnalyzeTabs}
                disabled={selectedTabs.size === 0}
                className={`px-6 py-2 rounded-xl font-medium transition-all duration-200 ${
                  selectedTabs.size === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span>🔍</span>
                  Analyze Selected Tabs
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};