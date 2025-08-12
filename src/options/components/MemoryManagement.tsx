import React, { useRef, useState, useEffect } from 'react';
import { MemoryService } from '../../tracking/memoryService';

export function MemoryManagement() {
  // Memory management state
  const [memoryCount, setMemoryCount] = useState(0);
  const [exportStatus, setExportStatus] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load memory count
  const loadMemoryCount = async () => {
    try {
      const memoryService = MemoryService.getInstance();
      await memoryService.init();
      const memories = await memoryService.getAllMemories();
      setMemoryCount(memories.length);
    } catch (error) {
      console.error('Error loading memory count:', error);
    }
  };

  // Export memories function
  const handleExportMemories = async () => {
    try {
      setExportStatus('Exporting...');
      const memoryService = MemoryService.getInstance();
      await memoryService.init();
      const memories = await memoryService.getAllMemories();
      
      const jsonData = JSON.stringify(memories, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const date = new Date().toISOString().split('T')[0];
      const filename = `BrowserOnly-memories-${date}.json`;
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setExportStatus(`Successfully exported ${memories.length} memories!`);
      setTimeout(() => setExportStatus(''), 3000);
    } catch (error) {
      setExportStatus(`Error exporting memories: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Import memories function
  const handleImportMemories = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;
      
      setImportStatus('Importing...');
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const memories = JSON.parse(content);
          
          if (!Array.isArray(memories)) {
            throw new Error('Invalid format: Expected an array of memories');
          }
          
          const memoryService = MemoryService.getInstance();
          await memoryService.init();
          
          let importedCount = 0;
          for (const memory of memories) {
            // Validate memory structure
            if (!memory.domain || !memory.taskDescription || !memory.toolSequence) {
              console.warn('Skipping invalid memory:', memory);
              continue;
            }
            
            // Ensure createdAt exists
            if (!memory.createdAt) {
              memory.createdAt = Date.now();
            }
            
            await memoryService.storeMemory(memory);
            importedCount++;
          }
          
          // Refresh memory count
          await loadMemoryCount();
          
          setImportStatus(`Successfully imported ${importedCount} memories!`);
          setTimeout(() => setImportStatus(''), 3000);
          
          // Reset file input
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        } catch (error) {
          setImportStatus(`Error parsing import file: ${error instanceof Error ? error.message : String(error)}`);
        }
      };
      
      reader.readAsText(file);
    } catch (error) {
      setImportStatus(`Error importing memories: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Trigger file input click
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Load memory count when component mounts
  useEffect(() => {
    loadMemoryCount();
  }, []);

  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg border border-white/50 overflow-hidden hover:shadow-xl transition-all duration-300">
  <div className="bg-gradient-to-r from-sky-50 to-blue-50 border-b border-sky-100 px-6 py-4">
    <h2 className="text-2xl font-bold text-gray-800 flex items-center">
      <span className="mr-3 text-3xl">🧠</span>
      Memory Management
    </h2>
  </div>
  
  <div className="p-6 space-y-6">
    {/* Introduction Section */}
    <div className="bg-gradient-to-r from-violet-50/50 to-purple-50/50 rounded-2xl p-4 border border-violet-100/50">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-1">
          <div className="w-8 h-8 bg-gradient-to-r from-violet-500 to-purple-600 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div>
          <p className="text-gray-700 leading-relaxed">
            <span className="font-semibold text-violet-700">BrowserOnly</span> intelligently stores memories of successful interactions with websites to enhance future automation. 
            Export your memories for backup or transfer them to another device seamlessly.
          </p>
          <div className="mt-2 flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="text-sm text-gray-600">Auto Learning</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span className="text-sm text-gray-600">Portable</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
              <span className="text-sm text-gray-600">Smart Recall</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Memory Count Display */}
    <div className="bg-gradient-to-r from-emerald-50/50 to-teal-50/50 rounded-2xl p-4 border border-emerald-100/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-emerald-700">Memory Collection</h3>
            <p className="text-sm text-emerald-600">Stored interaction patterns and optimizations</p>
          </div>
        </div>
        <div className="bg-white/70 backdrop-blur-sm rounded-xl px-4 py-2 border border-white/50 shadow-sm">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-600">Current memories:</span>
            <span className="inline-flex items-center px-3 py-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-medium rounded-full shadow-sm">
              {memoryCount}
            </span>
          </div>
        </div>
      </div>
    </div>
    
    {/* Action Buttons */}
    <div className="bg-gradient-to-r from-sky-50/50 to-cyan-50/50 rounded-2xl p-4 border border-sky-100/50">
      <h3 className="text-lg font-semibold text-sky-700 mb-4 flex items-center">
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        Memory Operations
      </h3>
      
      <div className="flex flex-wrap gap-4">
        <button 
          onClick={handleExportMemories} 
          className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:shadow-lg"
          disabled={memoryCount === 0}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>Export Memories</span>
        </button>
        
        <button 
          onClick={triggerFileInput} 
          className="flex items-center space-x-2 px-6 py-3 bg-white/70 backdrop-blur-sm border border-gray-200 text-gray-700 font-medium rounded-xl shadow-md hover:bg-white/90 hover:border-gray-300 hover:shadow-lg transform hover:scale-105 transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
          <span>Import Memories</span>
        </button>
        
        {/* Hidden file input for import */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImportMemories}
          accept=".json"
          className="hidden"
        />
      </div>
    </div>
    
    {/* Status Messages */}
    {(exportStatus || importStatus) && (
      <div className="space-y-3">
        {exportStatus && (
          <div className={`rounded-2xl p-4 border ${
            exportStatus.includes('Error') 
              ? 'bg-gradient-to-r from-red-50/50 to-pink-50/50 border-red-100/50' 
              : 'bg-gradient-to-r from-green-50/50 to-emerald-50/50 border-green-100/50'
          }`}>
            <div className="flex items-center space-x-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                exportStatus.includes('Error')
                  ? 'bg-gradient-to-r from-red-500 to-pink-600'
                  : 'bg-gradient-to-r from-green-500 to-emerald-600'
              }`}>
                {exportStatus.includes('Error') ? (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className={`text-sm font-medium ${
                exportStatus.includes('Error') ? 'text-red-700' : 'text-green-700'
              }`}>
                {exportStatus}
              </span>
            </div>
          </div>
        )}
        
        {importStatus && (
          <div className={`rounded-2xl p-4 border ${
            importStatus.includes('Error') 
              ? 'bg-gradient-to-r from-red-50/50 to-pink-50/50 border-red-100/50' 
              : 'bg-gradient-to-r from-green-50/50 to-emerald-50/50 border-green-100/50'
          }`}>
            <div className="flex items-center space-x-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                importStatus.includes('Error')
                  ? 'bg-gradient-to-r from-red-500 to-pink-600'
                  : 'bg-gradient-to-r from-green-500 to-emerald-600'
              }`}>
                {importStatus.includes('Error') ? (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className={`text-sm font-medium ${
                importStatus.includes('Error') ? 'text-red-700' : 'text-green-700'
              }`}>
                {importStatus}
              </span>
            </div>
          </div>
        )}
      </div>
    )}
  </div>
</div>
  );
}
