import React, { useEffect, useMemo, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { BookPicker } from './BookPicker';
import { ExpertPicker } from './ExpertPicker';
import { MultiTabSelector, type TabInfo } from './MultiTabSelector';
import { availableBooks } from './askBooksData';
import { getExpert, type ExpertId } from './expertData';
import { ActionRegistry, type ActionDefinition } from '../../actions';
import { SlashCommandMenu } from './actions/SlashCommandMenu';
import { ActionChip } from './actions/ActionChip';
import type { ActionInvocation } from '../../actions';

interface PromptFormProps {
  onSubmit: (prompt: string, role: string, selectedTabIds?: number[], contextMode?: AskContextMode) => void;
  onCancel: () => void;
  isProcessing: boolean;
  tabStatus: 'attached' | 'detached' | 'unknown' | 'running' | 'idle' | 'error';
  initialAction?: ActionInvocation;
  onRunDirectAction?: (actionId: string) => boolean;
}

type ModeType = 'operator' | 'ask';
type AskTarget = 'books' | 'experts';
export type AskContextMode = 'current-tab' | 'standalone';
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

export const PromptForm: React.FC<PromptFormProps> = ({ onSubmit, onCancel, isProcessing, tabStatus, initialAction, onRunDirectAction }) => {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<ModeType>('operator');
  const [role, setRole] = useState<RoleType>('operator');
  const [askTarget, setAskTarget] = useState<AskTarget>('books');
  const [selectedBookId, setSelectedBookId] = useState(availableBooks[0].id);
  const [selectedExpertId, setSelectedExpertId] = useState<ExpertId>('munger');
  const [isBookPickerOpen, setBookPickerOpen] = useState(false);
  const [isExpertPickerOpen, setExpertPickerOpen] = useState(false);
  const [isAskGuideOpen, setAskGuideOpen] = useState(false);
  const [isAskExpanded, setAskExpanded] = useState(false);
  const [askContextMode, setAskContextMode] = useState<AskContextMode>('current-tab');
  const [selectedNotebookLMOption, setSelectedNotebookLMOption] = useState<NotebookLMOption>('summary');
  const [showMultiTabSelector, setShowMultiTabSelector] = useState(false);
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const [selectedAction, setSelectedAction] = useState<ActionDefinition>();
  const [actionIndex, setActionIndex] = useState(0);
  const registry = useMemo(() => new ActionRegistry(), []);
  const actionResults = useMemo(() => prompt.startsWith('/') ? registry.search(prompt, { hasPage: tabStatus !== 'detached', comparableTabCount: selectedTabIds.length }) : [], [prompt, registry, selectedTabIds.length, tabStatus]);
  useEffect(() => { if (initialAction) { const action = registry.get(initialAction.actionId); if (action) setSelectedAction(action); } }, [initialAction, registry]);

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
    if ((!prompt.trim() && !selectedAction) || isDisabled) return;
    if (selectedAction?.runBehavior === 'direct' && onRunDirectAction?.(selectedAction.id)) {
      setPrompt('');
      setSelectedAction(undefined);
      return;
    }

    const finalRole = role === 'books'
      ? `books-${selectedBook.id}`
      : role === 'notebooklm'
          ? `notebooklm-${selectedNotebookLMOption}`
          : role;
    const tabIds = role === 'researcher' && selectedTabIds.length > 0 ? selectedTabIds : undefined;
    if (mode === 'ask') {
      onSubmit(actionPrompt(selectedAction, prompt), finalRole, tabIds, askTarget === 'books' ? 'standalone' : askContextMode);
    } else {
      onSubmit(actionPrompt(selectedAction, prompt), finalRole, tabIds);
    }
    setPrompt('');
    setSelectedAction(undefined);
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
    <form className="relative" onSubmit={handleSubmit}>
      <nav aria-label="Mode" className="mb-3 flex gap-1 border-b border-stone-200 pb-2">
        {(['operator', 'ask'] as const).map(item => (
          <button
            aria-current={mode === item ? 'page' : undefined}
            className={`min-h-8 rounded-md px-3 text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:transform-none ${
              mode === item
                ? 'bg-[#eaf2f7] text-[#315a78]'
                : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
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
          <div className="mb-2 flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className="text-sm text-[#315a78]">✦</span>
            <nav aria-label="Ask type" className="flex shrink-0 rounded-md bg-stone-100 p-0.5">
            {(['books', 'experts'] as const).map(item => (
              <button
                aria-current={askTarget === item ? 'page' : undefined}
                className={`min-h-7 rounded px-2 text-[11px] font-semibold transition-colors duration-150 active:scale-[0.98] motion-reduce:transform-none ${
                  askTarget === item
                    ? 'bg-white text-stone-900 shadow-sm'
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

            <span aria-hidden="true" className="h-4 w-px shrink-0 bg-stone-200" />
            <button
              aria-label={askTarget === 'books'
                ? `${selectedBook.title} by ${selectedBook.author}. Change book`
                : `${selectedExpert.name}, ${selectedExpert.field}. Change expert`}
              className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left transition-colors duration-150 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isDisabled}
              onClick={() => askTarget === 'books' ? setBookPickerOpen(true) : setExpertPickerOpen(true)}
              type="button"
            >
              {askTarget === 'experts' && (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#315a78] text-[9px] font-bold tracking-[0.04em] text-white">
                  {selectedExpert.initials}
                </span>
              )}
              <span className="min-w-0 truncate text-xs font-semibold text-stone-800">
                {askTarget === 'books' ? selectedBook.title : selectedExpert.name}
              </span>
              <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              </svg>
            </button>

            <span className="flex-1" />
            <button
              aria-expanded={isAskGuideOpen}
              className="min-h-8 shrink-0 rounded-md px-2 text-[11px] font-medium text-stone-500 transition-colors duration-150 hover:bg-stone-100 hover:text-stone-900"
              onClick={() => setAskGuideOpen(value => !value)}
              type="button"
            >
              {isAskGuideOpen ? 'Hide help' : 'What to include?'}
            </button>
          </div>

          <div className="mb-2 flex items-center justify-between gap-3 text-[11px]">
            <span className="font-medium text-stone-500">Context</span>
            {askTarget === 'experts' ? (
              <div aria-label="Expert context" className="flex rounded-md bg-stone-100 p-0.5" role="group">
                {([
                  ['current-tab', 'Current tab'],
                  ['standalone', 'Standalone'],
                ] as const).map(([value, label]) => (
                  <button
                    aria-pressed={askContextMode === value}
                    className={`min-h-7 rounded px-2.5 font-semibold transition-colors duration-150 ${
                      askContextMode === value
                        ? 'bg-white text-[#315a78] shadow-sm'
                        : 'text-stone-500 hover:text-stone-900'
                    }`}
                    disabled={isDisabled}
                    key={value}
                    onClick={() => setAskContextMode(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="rounded-md bg-stone-100 px-2.5 py-1.5 font-semibold text-stone-500" title="Book conversations do not use browser tab content">
                Standalone
              </span>
            )}
          </div>

          {isAskGuideOpen && (
            <aside className="mb-2 rounded-r-md border-l-2 border-[#91aabd] bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-600">
              <strong className="font-semibold text-stone-800">
                {askTarget === 'books' ? selectedBook.guideIntro : selectedExpert.guideIntro}
              </strong>{' '}
              {(askTarget === 'books' ? selectedBook.guideQuestions : selectedExpert.guideQuestions).join(' ')}
            </aside>
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

      <div className={mode === 'ask' ? 'mt-1' : 'mt-3'}>
        {tabStatus === 'detached' && <p className="mb-2 text-xs text-red-700" role="status">Tab connection lost. Refresh the tab to continue.</p>}
        <div className="relative rounded-[11px] border border-stone-300 bg-white transition-[border-color,box-shadow] duration-150 focus-within:border-[#315a78] focus-within:ring-2 focus-within:ring-[#315a78]/10">
          {selectedAction && <ActionChip label={selectedAction.name} onRemove={() => setSelectedAction(undefined)} />}
          <SlashCommandMenu actions={actionResults} activeIndex={actionIndex} onSelect={action => { setSelectedAction(action); setPrompt(''); setActionIndex(0); }} />
          <TextareaAutosize
            aria-label="Prompt"
            autoFocus
            className="block min-h-12 w-full resize-none bg-transparent px-3.5 pb-12 pr-14 pt-3 text-sm leading-6 text-stone-800 outline-none placeholder:text-stone-400"
            disabled={isDisabled}
            maxRows={isAskExpanded ? 12 : 6}
            minRows={mode === 'ask' && isAskExpanded ? 6 : 1}
            onChange={event => setPrompt(event.target.value)}
            onKeyDown={event => {
              if (actionResults.length) {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActionIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + actionResults.length) % actionResults.length); return; }
                if (event.key === 'Escape') { event.preventDefault(); setPrompt(''); return; }
                if (event.key === 'Enter') { event.preventDefault(); setSelectedAction(actionResults[actionIndex] ?? actionResults[0]); setPrompt(''); return; }
              }
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
                    : 'Ask anything, or type / for quick actions'}
            value={prompt}
          />
          <div className="absolute inset-x-3 bottom-2 flex items-center justify-between text-[11px] text-stone-400">
            <span className="flex items-center gap-1">
              <span className="hidden sm:inline">Shift + Enter for a new line</span>
              {mode === 'ask' && (
                <button
                  aria-label={isAskExpanded ? 'Collapse Ask input' : 'Expand Ask input'}
                  className="rounded px-1.5 py-1 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900"
                  onClick={() => setAskExpanded(value => !value)}
                  type="button"
                >
                  {isAskExpanded ? 'Collapse' : 'Expand'}
                </button>
              )}
            </span>
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
      <BookPicker
        isOpen={isBookPickerOpen}
        onClose={() => setBookPickerOpen(false)}
        onSelect={setSelectedBookId}
        selectedBookId={selectedBookId}
      />
      <ExpertPicker
        isOpen={isExpertPickerOpen}
        onClose={() => setExpertPickerOpen(false)}
        onSelect={setSelectedExpertId}
        selectedExpertId={selectedExpertId}
      />
    </form>
  );
};

function actionPrompt(action: ActionDefinition | undefined, instruction: string): string {
  if (!action) return instruction;
  const base = action.id === 'summarize' ? 'Summarize the current page.' : action.id === 'translate' ? 'Translate the current page.' : action.id === 'extract' ? 'Extract structured data from the current page.' : action.id === 'compare' ? 'Compare the selected tabs.' : action.name;
  return instruction.trim() ? `${base}\n\nAdditional instructions: ${instruction.trim()}` : base;
}
