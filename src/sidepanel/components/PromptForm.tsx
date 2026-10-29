import React, { useEffect, useMemo, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { BookPicker } from './BookPicker';
import { ExpertPicker } from './ExpertPicker';
import { MultiTabSelector, type TabInfo } from './MultiTabSelector';
import { availableBooks } from './askBooksData';
import { getExpert, type ExpertId } from './expertData';
import { ActionRegistry, ActionResolver, createWorkflowActions, type ActionDefinition } from '../../actions';
import { WorkflowStore } from '../../workflows/WorkflowStore';
import { SlashCommandMenu } from './actions/SlashCommandMenu';
import { ActionChip } from './actions/ActionChip';
import type { ActionInvocation } from '../../actions';

interface PromptFormProps {
  pageActions?: React.ReactNode;
  onSubmit: (prompt: string, role: string, selectedTabIds?: number[], contextMode?: AskContextMode, taskMode?: ModeType) => void;
  onCancel: () => void;
  isProcessing: boolean;
  tabStatus: 'attached' | 'detached' | 'unknown' | 'running' | 'idle' | 'error';
  initialAction?: ActionInvocation;
  onRunDirectAction?: (actionId: string, invocation?: ActionInvocation) => boolean;
}

type ModeType = 'operator' | 'ask';
type AskTarget = 'books' | 'experts';
export type AskContextMode = 'current-tab' | 'standalone';
type OperatorRoleType = 'operator' | 'notebooklm' | 'researcher' | 'health' | 'wiki';
type RoleType = OperatorRoleType | 'books' | ExpertId;
type NotebookLMOption = 'summary' | 'study-guide' | 'faq' | 'mindmap';

const operatorRoleOptions = [
  { value: 'operator', label: 'Browser' },
  { value: 'notebooklm', label: 'NotebookLM' },
  { value: 'researcher', label: 'Research' },
  { value: 'health', label: 'Medical' },
  { value: 'wiki', label: 'Wiki' },
] as const satisfies ReadonlyArray<{ value: OperatorRoleType; label: string }>;

const notebookLMOptions = [
  { id: 'summary' as const, title: 'Summary', description: 'Generate a comprehensive summary of the content' },
  { id: 'study-guide' as const, title: 'Quiz', description: 'Test your understanding of the selected pages' },
  { id: 'faq' as const, title: 'FAQ', description: 'Generate frequently asked questions and answers' },
  { id: 'mindmap' as const, title: 'Mind Map', description: 'Generate a visual mind map structure of the content' },
];

const isOperatorRole = (value: string): value is OperatorRoleType =>
  operatorRoleOptions.some(option => option.value === value);

export const PromptForm: React.FC<PromptFormProps> = ({ pageActions, onSubmit, onCancel, isProcessing, tabStatus, initialAction, onRunDirectAction }) => {
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
  const [registry, setRegistry] = useState(() => new ActionRegistry());
  const [showSlashHint, setShowSlashHint] = useState(false);
  const consumedInvocation = useRef('');
  const actionResults = useMemo(() => prompt.startsWith('/') ? registry.search(prompt, { hasPage: tabStatus !== 'detached', comparableTabCount: selectedTabIds.length }) : [], [prompt, registry, selectedTabIds.length, tabStatus]);
  useEffect(() => { if (initialAction) { const key = `${initialAction.source}:${initialAction.actionId}:${initialAction.windowId}:${initialAction.tabId}:${initialAction.createdAt ?? ''}:${initialAction.selectionText ?? ''}`; if (consumedInvocation.current === key) return; try { const resolution = new ActionResolver(registry).resolve(initialAction); consumedInvocation.current = key; if (resolution.type === 'direct' && onRunDirectAction?.(resolution.definition.id, initialAction)) { chrome.storage.local.set({ browserOnlySlashHint: { focusHintCount: 3, hasCompletedSlashAction: true } }); return; } setSelectedAction(resolution.definition); } catch (error) { console.warn('Unable to resolve action invocation', error); } } }, [initialAction, onRunDirectAction, registry]);
  useEffect(() => { WorkflowStore.getInstance().listWorkflows().then(workflows => { const next = new ActionRegistry(); createWorkflowActions(workflows).forEach(action => next.register(action)); setRegistry(next); }).catch(() => undefined); }, []);

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
    if ((!prompt.trim() && !selectedAction && role !== 'notebooklm') || isDisabled) return;
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
    const tabIds = (role === 'researcher' || role === 'notebooklm') && selectedTabIds.length > 0 ? selectedTabIds : undefined;
    if (mode === 'ask') {
      onSubmit(actionPrompt(selectedAction, prompt), finalRole, tabIds, askTarget === 'books' ? 'standalone' : askContextMode, 'ask');
    } else {
      const instruction = role === 'notebooklm'
        ? `#${selectedNotebookLMOption}${prompt.trim() ? `\n\nUser focus: ${prompt.trim()}` : ''}`
        : actionPrompt(selectedAction, prompt);
      onSubmit(instruction, finalRole, tabIds, undefined, 'operator');
    }
    setPrompt('');
    setSelectedAction(undefined);
    if (selectedAction) chrome.storage.local.set({ browserOnlySlashHint: { focusHintCount: 3, hasCompletedSlashAction: true } });
  };

  const handleTabsSelected = (tabs: TabInfo[]) => {
    const ids = tabs.map(tab => tab.id);
    setSelectedTabIds(ids);
    setShowMultiTabSelector(false);
    if (role === 'researcher' && tabs.length > 0) {
      const urls = tabs.map(tab => `- ${tab.url} (${tab.title})`).join('\n');
      setPrompt(`Please conduct research on the following URLs, focusing on the topics covered by their content.\n\n${urls}`);
    }
  };

  return (
    <form className="relative" onSubmit={handleSubmit}>
      <div className="mb-3 flex items-center gap-2 overflow-x-auto border-b border-stone-200 pb-2">
      <nav aria-label="Mode" className="flex shrink-0 rounded-md bg-stone-100 p-0.5">
        {(['operator', 'ask'] as const).map(item => (
          <button
            aria-current={mode === item ? 'page' : undefined}
            className={`min-h-8 rounded-md px-2 text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.98] motion-reduce:transform-none ${
              mode === item
                ? 'bg-white text-[#315a78] shadow-sm'
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
      {mode === 'operator' && <div className="relative w-36 shrink-0">
        <select aria-label="Assistant role" className="min-h-8 w-full cursor-pointer appearance-none rounded-lg border-0 bg-stone-100 py-1 pl-3 pr-7 text-xs font-semibold text-stone-800 hover:bg-stone-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#315a78] disabled:cursor-not-allowed disabled:opacity-50" disabled={isDisabled} onChange={event => setRole(isOperatorRole(event.target.value) ? event.target.value : 'operator')} value={role}>
          {operatorRoleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <svg aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>}
      {pageActions}
      </div>

      {mode === 'ask' ? (
        <>
          <p className="mb-2 text-xs leading-5 text-stone-600">
            Choose an expert&apos;s thinking framework or a book&apos;s method. Describe your situation and what you want help with.
          </p>
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
              </strong>
              <ul className="mt-1 list-disc pl-4">
                {(askTarget === 'books' ? selectedBook.guideQuestions : selectedExpert.guideQuestions).map(question => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </aside>
          )}
        </>
      ) : (
        <div className="space-y-3">
          {(role === 'notebooklm' || role === 'researcher') && <div className={role === 'notebooklm' ? 'flex items-center gap-2 overflow-x-auto border-b border-stone-200 pb-1' : ''}>
          {role === 'notebooklm' && (
            <div aria-label="NotebookLM output type" className="flex shrink-0 items-center gap-1" role="group">
              <span className="mr-1 shrink-0 text-[11px] font-semibold text-stone-500">Create</span>
              {notebookLMOptions.map(option => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selectedNotebookLMOption === option.id}
                  title={option.description}
                  disabled={isDisabled}
                  onClick={() => setSelectedNotebookLMOption(option.id)}
                  className={`min-h-8 shrink-0 rounded-md px-2 text-xs font-medium transition-colors duration-150 disabled:opacity-50 ${selectedNotebookLMOption === option.id ? 'bg-[#eaf2f7] text-[#315a78]' : 'text-stone-600 hover:bg-stone-100 hover:text-[#315a78]'}`}
                >
                  {option.title}
                </button>
              ))}
            </div>
          )}

          {(role === 'researcher' || role === 'notebooklm') && (
            <section className={role === 'notebooklm' ? 'flex shrink-0 items-center gap-1 border-l border-stone-200 pl-2 text-xs' : 'flex flex-wrap items-center gap-2 text-xs'}>
              <div className="flex items-center gap-1">
                <div className="whitespace-nowrap text-stone-500">
                  {selectedTabIds.length > 0 ? `${selectedTabIds.length} source tabs` : 'Current tab'}
                </div>
                <button
                  className="min-h-8 rounded-md px-2 font-medium text-[#315a78] hover:bg-[#eaf2f7] disabled:opacity-50"
                  disabled={isDisabled}
                  onClick={() => setShowMultiTabSelector(true)}
                  type="button"
                >
                  Change sources
                </button>
              </div>
              {selectedTabIds.length > 0 && (
                <button className="text-xs text-stone-500 hover:text-stone-900" onClick={() => setSelectedTabIds([])} type="button">
                  Use current tab
                </button>
              )}
            </section>
          )}
          </div>}
        </div>
      )}

      <div className={mode === 'ask' ? 'mt-1' : 'mt-3'}>
        {tabStatus === 'detached' && <p className="mb-2 text-xs text-red-700" role="status">Tab connection lost. Refresh the tab to continue.</p>}
        <div className="relative rounded-[11px] border border-stone-300 bg-white transition-[border-color,box-shadow] duration-150 focus-within:border-[#315a78] focus-within:ring-2 focus-within:ring-[#315a78]/10">
          {showSlashHint && !selectedAction && <p className="px-3 pt-2 text-xs text-stone-500">Tip: Type / to choose a quick action</p>}
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
            onFocus={() => { chrome.storage.local.get({ browserOnlySlashHint: { focusHintCount: 0, hasCompletedSlashAction: false } }).then(result => { const state = result?.browserOnlySlashHint ?? { focusHintCount: 0, hasCompletedSlashAction: false }; if (state.hasCompletedSlashAction || state.focusHintCount >= 3) return setShowSlashHint(false); setShowSlashHint(true); chrome.storage.local.set({ browserOnlySlashHint: { ...state, focusHintCount: state.focusHintCount + 1 } }); }).catch(() => undefined); }}
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
              : selectedAction?.id === 'extract'
                ? 'What should I extract? Leave blank to convert the whole page to Markdown.'
              : selectedAction?.id === 'extract-table'
                ? '例如：提取前 5 页的职位名称、地点、职位 ID 和详情链接'
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
              <button className="min-h-8 rounded-md bg-[#315a78] px-3 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#274a64] active:scale-96 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transform-none" disabled={(!prompt.trim() && !selectedAction && role !== 'notebooklm') || tabStatus === 'detached'} type="submit">
                {role === 'notebooklm' ? 'Generate' : 'Send'}
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
  if (!action) {
    const match = instruction.match(/^\/extract(?:[ -]table)(?:\s+|$)([\s\S]*)/i);
    return match ? extractionTablePrompt(match[1]) : instruction;
  }
  if (action.id === 'extract-table') return extractionTablePrompt(instruction);
  if (action.id === 'extract') return instruction.trim()
    ? `Extract the information requested below from the current page. Return the result in the clearest structured format for the request. Do not open links or explore unrelated page structure.\n\nUser request: ${instruction.trim()}`
    : 'Extract the entire current webpage and return it as clean Markdown. Preserve the page title, headings, paragraphs, lists, tables, and actual HTTP(S) links. Do not summarize or omit relevant page content.';
  const base = action.id === 'summarize' ? 'Summarize the current page.' : action.id === 'translate' ? 'Translate the current page.' : action.id === 'compare' ? 'Compare the selected tabs.' : action.name;
  return instruction.trim() ? `${base}\n\nAdditional instructions: ${instruction.trim()}` : base;
}

function extractionTablePrompt(instruction: string): string {
  return `Extract repeated records from the current page using the user's natural-language request below. Infer the requested fields, page count, and output format; do not ask the user to fill a configuration form. Default to the current page if no page count is specified. Preserve current filters. Use actual page controls for pagination, stop at the requested page limit, deduplicate records, and report incomplete results honestly.
For every record, obtain its actual detail URL from the record itself, its descendants, or explicit page data. If necessary, open the record to observe the actual destination and return to the list without submitting or changing data. Keep the record ID as data; never invent a URL from the displayed ID. Render record titles or IDs as clickable Markdown links and include a detail URL column. If a URL cannot be verified, mark it unavailable rather than omit the column. Return a readable table by default.
User request: ${instruction.trim() || 'Extract the visible records with their key fields and verified detail links.'}`;
}
