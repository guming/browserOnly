import React, { useEffect, useMemo, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { AskBooksPanel } from './AskBooksPanel';
import { availableBooks } from './askBooksData';
import { ExpertPanel } from './ExpertPanel';
import { getExpert, type ExpertId } from './expertData';
import { MultiTabSelector, type TabInfo } from './MultiTabSelector';

interface PromptFormProps {
  onSubmit: (prompt: string, role: string, selectedTabIds?: number[]) => void;
  onCancel: () => void;
  isProcessing: boolean;
  tabStatus: 'attached' | 'detached' | 'unknown' | 'running' | 'idle' | 'error';
}

type ModeType = 'operator' | 'ask';
type AskTarget = 'books' | 'experts';
type OperatorRoleType = 'operator' | 'notebooklm' | 'researcher' | 'health' | 'wiki';
type RoleType = OperatorRoleType | 'books' | ExpertId;
type NotebookLMOption = 'summary' | 'study-guide' | 'faq' | 'mindmap';

const operatorRoleOptions = [
  { value: 'operator', label: 'Browser Operator' },
  { value: 'notebooklm', label: 'NotebookLM' },
  { value: 'researcher', label: 'Research Analyst' },
  { value: 'health', label: 'Medical Assistant' },
  { value: 'wiki', label: 'Wiki Assistant' },
] as const satisfies ReadonlyArray<{ value: OperatorRoleType; label: string }>;

const notebookLMOptions = [
  { id: 'summary' as const, title: 'Summary', description: 'Generate a comprehensive summary of the content' },
  { id: 'study-guide' as const, title: 'Study Guide', description: 'Create a detailed study guide with key points' },
  { id: 'faq' as const, title: 'FAQ', description: 'Generate frequently asked questions and answers' },
  { id: 'mindmap' as const, title: 'Mind Map', description: 'Generate a visual mind map structure of the content' },
];

const isOperatorRole = (value: string): value is OperatorRoleType =>
  operatorRoleOptions.some(option => option.value === value);

export const PromptForm: React.FC<PromptFormProps> = ({ onSubmit, onCancel, isProcessing, tabStatus }) => {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<ModeType>('operator');
  const [role, setRole] = useState<RoleType>('operator');
  const [askTarget, setAskTarget] = useState<AskTarget>('books');
  const [selectedBookId, setSelectedBookId] = useState(availableBooks[0].id);
  const [selectedExpertId, setSelectedExpertId] = useState<ExpertId>('munger');
  const [selectedNotebookLMOption, setSelectedNotebookLMOption] = useState<NotebookLMOption>('summary');
  const [showMultiTabSelector, setShowMultiTabSelector] = useState(false);
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);

  const selectedBook = useMemo(
    () => availableBooks.find(book => book.id === selectedBookId) ?? availableBooks[0],
    [selectedBookId],
  );
  const selectedExpert = useMemo(() => getExpert(selectedExpertId), [selectedExpertId]);
  const selectedNotebookOption = notebookLMOptions.find(option => option.id === selectedNotebookLMOption);
  const isDisabled = isProcessing || tabStatus === 'detached';

  useEffect(() => {
    setRole(mode === 'ask' ? (askTarget === 'books' ? 'books' : selectedExpertId) : 'operator');
    setSelectedTabIds([]);
  }, [askTarget, mode, selectedExpertId]);

  useEffect(() => {
    const listener = (message: { type?: string; text?: string }) => {
      if (message.type === 'copyToPrompt' && message.text) setPrompt(message.text);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() || isDisabled) return;

    const finalRole = role === 'books'
      ? `books-${selectedBook.id}`
      : role === 'notebooklm'
          ? `notebooklm-${selectedNotebookLMOption}`
          : role;
    const tabIds = role === 'researcher' && selectedTabIds.length > 0 ? selectedTabIds : undefined;
    onSubmit(prompt, finalRole, tabIds);
    setPrompt('');
  };

  const handleTabsSelected = (tabs: TabInfo[]) => {
    const ids = tabs.map(tab => tab.id);
    setSelectedTabIds(ids);
    setShowMultiTabSelector(false);
    if (tabs.length > 0) {
      const urls = tabs.map(tab => `- ${tab.url} (${tab.title})`).join('\n');
      setPrompt(`Please conduct research on the following URLs, focusing on the topics covered by their content.\n\n${urls}`);
    }
  };

  return (
    <form className="relative mt-2" onSubmit={handleSubmit}>
      <nav aria-label="Mode" className="mb-5 grid grid-cols-2 border-b border-stone-200">
        {(['operator', 'ask'] as const).map(item => (
          <button
            aria-current={mode === item ? 'page' : undefined}
            className={`relative min-h-10 px-3 pb-2 pt-1 text-xs font-medium transition-colors duration-150 active:scale-[0.98] motion-reduce:transform-none ${
              mode === item
                ? 'text-slate-900 after:absolute after:inset-x-[24%] after:-bottom-px after:h-0.5 after:bg-[#315a78]'
                : 'text-stone-500 hover:text-stone-900'
            }`}
            disabled={isDisabled}
            key={item}
            onClick={() => setMode(item)}
            type="button"
          >
            {item === 'operator' ? 'Operator' : 'Ask'}
          </button>
        ))}
      </nav>

      {mode === 'ask' ? (
        <>
          <nav aria-label="Ask type" className="mb-5 flex gap-5 border-b border-stone-200">
            {(['books', 'experts'] as const).map(item => (
              <button
                aria-current={askTarget === item ? 'page' : undefined}
                className={`relative min-h-9 pb-2 text-xs font-medium transition-colors duration-150 active:scale-[0.98] motion-reduce:transform-none ${
                  askTarget === item
                    ? 'text-slate-900 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[#315a78]'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
                disabled={isDisabled}
                key={item}
                onClick={() => {
                  setAskTarget(item);
                  setRole(item === 'books' ? 'books' : selectedExpertId);
                }}
                type="button"
              >
              {item === 'books' ? 'Books' : 'Experts'}
              </button>
            ))}
          </nav>
          {askTarget === 'books' ? (
            <AskBooksPanel book={selectedBook} disabled={isDisabled} onSelectBook={setSelectedBookId} />
          ) : (
            <ExpertPanel expert={selectedExpert} disabled={isDisabled} onSelectExpert={setSelectedExpertId} />
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <select
              aria-label="Assistant role"
              className="w-full appearance-none rounded-lg border border-stone-300 bg-white px-3 py-2.5 pr-9 text-sm font-medium text-stone-800 outline-none transition-[border-color,box-shadow] duration-150 hover:border-stone-500 focus:border-[#315a78] focus:ring-2 focus:ring-[#315a78]/10"
              disabled={isDisabled}
              onChange={event => setRole(isOperatorRole(event.target.value) ? event.target.value : 'operator')}
              value={role}
            >
              {operatorRoleOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <svg aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
          </div>

          {role === 'notebooklm' && (
            <section className="space-y-2">
              <div className="grid grid-cols-4 gap-2">
                {notebookLMOptions.map(option => (
                  <button
                    className={`min-h-16 rounded-lg border px-2 py-2 text-xs font-medium transition-colors duration-150 active:scale-[0.98] motion-reduce:transform-none ${
                      selectedNotebookLMOption === option.id
                        ? 'border-[#315a78] bg-[#eaf2f7] text-[#315a78]'
                        : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400 hover:text-stone-900'
                    }`}
                    disabled={isDisabled}
                    key={option.id}
                    onClick={() => {
                      setSelectedNotebookLMOption(option.id);
                      onSubmit(`#${option.id}`, `notebooklm-${option.id}`);
                    }}
                    type="button"
                  >
                    <span className="mt-1 block">{option.title}</span>
                  </button>
                ))}
              </div>
              <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-600">
                <strong className="font-semibold text-stone-800">{selectedNotebookOption?.title}: </strong>
                {selectedNotebookOption?.description}
              </p>
            </section>
          )}

          {role === 'researcher' && (
            <section className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-stone-900">Multi-Tab Analysis</h3>
                  <p className="mt-0.5 text-xs leading-5 text-stone-500">
                    {selectedTabIds.length > 0 ? `${selectedTabIds.length} tabs selected for analysis` : 'Analyze several open tabs together.'}
                  </p>
                </div>
                <button
                  className="min-h-10 shrink-0 rounded-md border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 transition-colors duration-150 hover:border-stone-500 hover:text-stone-900 active:scale-[0.98] motion-reduce:transform-none"
                  disabled={isDisabled}
                  onClick={() => setShowMultiTabSelector(true)}
                  type="button"
                >
                  Select Tabs
                </button>
              </div>
              {selectedTabIds.length > 0 && (
                <button className="mt-2 text-xs font-medium text-stone-500 hover:text-stone-900" onClick={() => setSelectedTabIds([])} type="button">
                  Clear selection
                </button>
              )}
            </section>
          )}
        </div>
      )}

      <div className={mode === 'ask' ? 'mt-5' : 'mt-3'}>
        {tabStatus === 'detached' && <p className="mb-2 text-xs text-red-700" role="status">Tab connection lost. Refresh the tab to continue.</p>}
        <div className="relative rounded-[11px] border border-stone-300 bg-white transition-[border-color,box-shadow] duration-150 focus-within:border-[#315a78] focus-within:ring-2 focus-within:ring-[#315a78]/10">
          <TextareaAutosize
            aria-label="Prompt"
            autoFocus
            className={`block w-full resize-none bg-transparent px-3.5 pb-12 pr-14 pt-3 text-sm leading-6 text-stone-800 outline-none placeholder:text-stone-400 ${mode === 'ask' ? 'min-h-24' : 'min-h-12'}`}
            disabled={isDisabled}
            maxRows={10}
            minRows={mode === 'ask' ? 3 : 1}
            onChange={event => setPrompt(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSubmit(event);
              }
            }}
            placeholder={tabStatus === 'detached'
              ? 'Refresh the tab to continue'
              : mode === 'ask'
                ? askTarget === 'books'
                  ? `Share your situation and goals for ${selectedBook.title}`
                  : selectedExpert.placeholder
                : role === 'notebooklm'
                  ? `Generate ${selectedNotebookOption?.title.toLowerCase()} for this content`
                  : role === 'researcher' && selectedTabIds.length > 0
                    ? 'Enter your research question for the selected tabs'
                    : 'Type your message'}
            value={prompt}
          />
          <div className="absolute inset-x-3 bottom-2 flex items-center justify-between text-[11px] text-stone-400">
            <span>Shift + Enter for a new line</span>
            {isProcessing ? (
              <button aria-label="Cancel" className="min-h-8 rounded-md bg-stone-900 px-3 text-xs font-semibold text-white transition-colors duration-150 hover:bg-stone-700 active:scale-96 motion-reduce:transform-none" onClick={onCancel} type="button">
                Cancel
              </button>
            ) : (
              <button className="min-h-8 rounded-md bg-[#315a78] px-3 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#274a64] active:scale-96 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transform-none" disabled={!prompt.trim() || tabStatus === 'detached'} type="submit">
                Send
              </button>
            )}
          </div>
        </div>
      </div>

      <MultiTabSelector
        initialSelectedTabIds={selectedTabIds}
        isVisible={showMultiTabSelector}
        onClose={() => setShowMultiTabSelector(false)}
        onTabsSelected={handleTabsSelected}
      />
    </form>
  );
};
