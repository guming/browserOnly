import React, { useRef, useState, useEffect } from 'react';
import { MemoryService, type AgentMemory } from '../../tracking/memoryService';

export function MemoryManagement() {
  // Memory management state
  const [memoryCount, setMemoryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [draftTask, setDraftTask] = useState('');
  const [draftSteps, setDraftSteps] = useState('');
  const [managementStatus, setManagementStatus] = useState('');
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
      setMemories(memories.sort((a, b) => {
        const aReview = (a.status ?? 'needs_review') === 'needs_review' ? 1 : 0;
        const bReview = (b.status ?? 'needs_review') === 'needs_review' ? 1 : 0;
        return bReview - aReview || (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt);
      }));
      setLoadError(false);
    } catch (error) {
      console.error('Error loading memory count:', error);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (memory: AgentMemory, status: AgentMemory['status']) => {
    if (memory.id === undefined || !status) return;
    try {
      await MemoryService.getInstance().updateMemory(memory.id, { status });
      await loadMemoryCount();
      setManagementStatus(status === 'active' ? 'Memory confirmed for use.' : 'Memory status updated.');
    } catch (error) {
      setManagementStatus(`Could not update memory: ${String(error)}`);
    }
  };

  const saveEdit = async (memory: AgentMemory) => {
    if (memory.id === undefined) return;
    const steps = draftSteps.split('\n').map(step => step.trim()).filter(Boolean);
    if (!draftTask.trim() || steps.length === 0) {
      setManagementStatus('Task and at least one tool step are required.');
      return;
    }
    try {
      await MemoryService.getInstance().updateMemory(memory.id, {
        taskDescription: draftTask.trim(), toolSequence: steps, status: 'needs_review',
      });
      setEditingId(null);
      await loadMemoryCount();
      setManagementStatus('Memory saved. Review its steps, then confirm it for use.');
    } catch (error) {
      setManagementStatus(`Could not save memory: ${String(error)}`);
    }
  };

  const deleteRecord = async (memory: AgentMemory) => {
    if (memory.id === undefined) {
      setManagementStatus('This memory has no saved ID and cannot be deleted.');
      return;
    }
    if (deletingId !== memory.id) {
      setDeletingId(memory.id);
      return;
    }
    try {
      await MemoryService.getInstance().deleteMemory(memory.id);
      setDeletingId(null);
      await loadMemoryCount();
      setManagementStatus('Memory deleted.');
    } catch (error) {
      setManagementStatus(`Could not delete memory: ${String(error)}`);
      setDeletingId(null);
    }
  };

  const visibleMemories = memories.filter(memory => {
    const matchesText = `${memory.domain} ${memory.taskDescription}`.toLowerCase().includes(search.toLowerCase());
    return matchesText && (statusFilter === 'all' || (memory.status ?? 'needs_review') === statusFilter);
  });

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
            
            await memoryService.storeMemory({ ...memory, source: 'import', status: 'needs_review' });
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

  const reviewCount = memories.filter(memory => (memory.status ?? 'needs_review') === 'needs_review').length;
  const statusLabel: Record<string, string> = { needs_review: 'Needs review', active: 'Ready to use', disabled: 'Paused' };

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <header className="border-b border-gray-200 px-5 py-5 sm:px-7">
        <h2 className="text-xl font-semibold text-gray-900">Memory</h2>
        <p className="mt-1 text-sm text-gray-600">Review the website tasks BrowserOnly has saved. Only memories you confirm can be reused.</p>
      </header>

      <div className="space-y-6 px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Saved tasks <span className="ml-1 text-sm font-normal text-gray-500">{isLoading ? '…' : memoryCount}</span></h3>
            {!isLoading && reviewCount > 0 && <p className="mt-1 text-sm text-amber-700">{reviewCount} waiting for your review</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleExportMemories} disabled={memoryCount === 0 || isLoading} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50">Export</button>
            <button type="button" onClick={triggerFileInput} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Import</button>
            <input type="file" ref={fileInputRef} onChange={handleImportMemories} accept=".json,application/json" className="hidden" aria-label="Import memories from JSON" />
          </div>
        </div>

        {memoryCount > 0 && <div className="flex flex-col gap-2 sm:flex-row">
          <input aria-label="Search memories" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by website or task" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          <select aria-label="Filter memory status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
            <option value="all">All tasks</option>
            <option value="needs_review">Needs review</option>
            <option value="active">Ready to use</option>
            <option value="disabled">Paused</option>
          </select>
        </div>}

        {managementStatus && <p role="status" className="text-sm text-gray-700">{managementStatus}</p>}
        {isLoading ? <p role="status" className="py-10 text-center text-sm text-gray-500">Loading saved tasks…</p>
          : loadError ? <div className="py-10 text-center text-sm text-gray-600">Could not load saved tasks. <button type="button" onClick={() => void loadMemoryCount()} className="font-medium text-blue-700 underline">Try again</button></div>
          : visibleMemories.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 px-5 py-10 text-center">
              <p className="font-medium text-gray-800">{memoryCount === 0 ? 'No saved tasks yet' : 'No tasks match your search'}</p>
              <p className="mt-1 text-sm text-gray-500">{memoryCount === 0 ? 'Successful website tasks will appear here for your review.' : 'Try another website, task, or status.'}</p>
            </div>
          : <div className="max-h-[38rem] space-y-2 overflow-y-auto">
            {visibleMemories.map(memory => {
              const status = memory.status ?? 'needs_review';
              return <details key={memory.id} className="group rounded-xl border border-gray-200 bg-white open:border-gray-300">
                <summary className="cursor-pointer list-none px-4 py-3 marker:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-gray-500">{memory.domain}</p>
                      <p className="mt-0.5 break-words font-medium text-gray-900">{memory.taskDescription}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${status === 'needs_review' ? 'bg-amber-50 text-amber-800' : status === 'active' ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-100 text-gray-600'}`}>{statusLabel[status] ?? status}</span>
                  </div>
                </summary>
                <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                  <p className="text-xs text-gray-500">Saved {new Date(memory.createdAt).toLocaleDateString()} · {memory.lastVerifiedAt ? `Verified ${new Date(memory.lastVerifiedAt).toLocaleDateString()}` : 'Not verified yet'}</p>
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-500">Steps</p>
                  {editingId === memory.id ? <div className="mt-2 space-y-2">
                    <input aria-label="Memory task" value={draftTask} onChange={event => setDraftTask(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    <textarea aria-label="Memory steps" value={draftSteps} onChange={event => setDraftSteps(event.target.value)} rows={Math.max(3, memory.toolSequence.length)} className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm" />
                    <div className="flex gap-2"><button type="button" onClick={() => void saveEdit(memory)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">Save changes</button><button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Cancel</button></div>
                  </div> : <>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 font-mono text-sm text-gray-700">{memory.toolSequence.map((step, index) => <li key={index} className="break-all">{step}</li>)}</ol>
                    <div className="mt-4 flex flex-wrap gap-2 text-sm">
                      {status !== 'active' && <button type="button" onClick={() => void updateStatus(memory, 'active')} className="rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700">Confirm for use</button>}
                      <button type="button" onClick={() => { setEditingId(memory.id ?? null); setDraftTask(memory.taskDescription); setDraftSteps(memory.toolSequence.join('\n')); }} className="rounded-lg border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50">Edit</button>
                      {status !== 'disabled' && <button type="button" onClick={() => void updateStatus(memory, 'disabled')} className="rounded-lg border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50">Pause</button>}
                      {deletingId === memory.id ? <>
                        <span className="self-center text-xs text-red-700">Delete this saved task?</span>
                        <button type="button" onClick={() => void deleteRecord(memory)} className="rounded-lg bg-red-600 px-3 py-2 font-medium text-white hover:bg-red-700">Confirm delete</button>
                        <button type="button" onClick={() => setDeletingId(null)} className="rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-100">Cancel</button>
                      </> : <button type="button" onClick={() => void deleteRecord(memory)} className="rounded-lg px-3 py-2 text-red-700 hover:bg-red-50">Delete</button>}
                    </div>
                  </>}
                </div>
              </details>;
            })}
          </div>}

        {(exportStatus || importStatus) && <div role="status" className="space-y-1 text-sm text-gray-700">{exportStatus && <p>{exportStatus}</p>}{importStatus && <p>{importStatus}</p>}</div>}
        <p className="border-t border-gray-100 pt-4 text-xs text-gray-500">Importing a backup adds tasks for review. It does not make them available for use automatically.</p>
      </div>
    </section>
  );
}
