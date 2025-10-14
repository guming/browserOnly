import { faPaperPlane, faXmark } from '@fortawesome/free-solid-svg-icons';
import {
  faUserTie,
  faSearch,
  faBalanceScale,
  faChartLine,
  faCalculator,
  faVial,
  faCode,
  faHeartbeat,
  faBook
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { MultiTabSelector } from './MultiTabSelector';

interface PromptFormProps {
  onSubmit: (prompt: string, role: string, selectedTabIds?: number[]) => void;
  onCancel: () => void;
  isProcessing: boolean;
  tabStatus: 'attached' | 'detached' | 'unknown' | 'running' | 'idle' | 'error';
}

// 定义模式类型
type ModeType = 'operator' | 'ask';

// 定义角色类型
type RoleType = 'operator' | 'researcher' | 'lawyer' | 'trader' | 'math' | 'qa' | 'code' | 'health' | 'wiki' | 'books' | 'munger' |'notebooklm';

// 定义NotebookLM选项类型
type NotebookLMOption = 'summary' | 'study-guide' | 'faq' | 'mindmap';

// 定义书籍列表
interface Book {
  id: string;
  title: string;
  author: string;
  emoji: string;
  description: string;
}

const availableBooks: Book[] = [
  {
    id: 'happinessBook',
    title: 'Build the Life You Want',
    author: 'Oprah Winfrey',
    emoji: '🏆',
    description: `Ready to begin? Share:
1. Your current situation or specific challenges (e.g., burnt out at work, tense relationships, lack of direction)
2. Your most important goal (e.g., more fulfillment at work, better communication, feeling calmer)`,
  },
  {
    id: 'howToRead',
    title: 'How to Read a Book',
    author: 'Mortimer J. Adler',
    emoji: '📖',
    description: `Ready to improve your reading? Share:
1. Your main reading goal (e.g., study faster, read classics, extract insights for work)
2. Your current reading challenge (e.g., difficulty finishing books, remembering key points)`,
  },
  {
    id: 'thinkingFastAndSlow',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    emoji: '🧠',
    description: `Ready to improve your thinking? Share:
1. What decisions or judgments are you struggling with? (e.g., investment, relationships, career)
2. Do you want to strengthen your intuition or improve your analytical accuracy?`,
  },
  {
    id: 'artOfThinkingClearly',
    title: 'The Art of Thinking Clearly',
    author: 'Rolf Dobelli',
    emoji: '💡',
    description: `Ready to think more clearly? Share:
1. A recent decision or belief that may have been influenced by bias
2. Your primary goal (e.g., rational business choices, better relationships, independent thinking)`,
  },
  {
    id: 'gettingThingsDone',
    title: 'Getting Things Done',
    author: 'David Allen',
    emoji: '✅',
    description: `Ready to get organized? Share:
1. Your current productivity challenge (e.g., overwhelm, procrastination, disorganization)
2. What system or tool you currently use to manage tasks (e.g., Notion, Todoist, pen & paper)`,
  },
  {
    id: 'deepWork',
    title: 'Deep Work',
    author: 'Cal Newport',
    emoji: '🎯',
    description: `Ready to master focus? Share:
1. What type of work or study requires your deepest focus?
2. Your main sources of distraction (e.g., notifications, meetings, social media)`,
  },
  {
    id: 'essentialism',
    title: 'Essentialism: The Disciplined Pursuit of Less',
    author: 'Greg McKeown',
    emoji: '🎪',
    description: `Ready to pursue less but better? Share:
1. What areas of your life feel overloaded or scattered right now?
2. The one or two goals that truly matter most to you in this season of life`,
  },
  {
    id: 'leanStartup',
    title: 'The Lean Startup',
    author: 'Eric Ries',
    emoji: '🚀',
    description: `Ready to build lean? Share:
1. Your startup idea or current challenge (e.g., validating demand, defining MVP)
2. Your primary goal (e.g., faster experimentation, customer validation, product-market fit)`,
  },
  {
    id: 'artOfStrategy',
    title: 'The Art of Strategy',
    author: 'Avinash K. Dixit & Barry J. Nalebuff',
    emoji: '♟️',
    description: `Ready to think strategically? Share:
1. A strategic situation you're facing (e.g., business competition, negotiation, decision conflict)
2. Your desired outcome (e.g., predict moves, strengthen position, design win-win solution)`,
  },
];

const roleIcons: Record<RoleType, any> = {
  operator: faUserTie,
  researcher: faSearch,
  lawyer: faBalanceScale,
  trader: faChartLine,
  notebooklm: faBook,
  math: faCalculator,
  qa: faVial,
  code: faCode,
  health: faHeartbeat,
  wiki: faBook,
  books: faBook,
  munger: faBook,
};

// NotebookLM选项配置
const notebookLMOptions = [
  {
    id: 'summary' as NotebookLMOption,
    title: 'Summary',
    emoji: '📄',
    description: 'Generate a comprehensive summary of the content'
  },
  {
    id: 'study-guide' as NotebookLMOption,
    title: 'Study Guide',
    emoji: '📚',
    description: 'Create a detailed study guide with key points'
  },
  {
    id: 'faq' as NotebookLMOption,
    title: 'FAQ',
    emoji: '❓',
    description: 'Generate frequently asked questions and answers'
  },
  {
    id: 'mindmap' as NotebookLMOption,
    title: 'Mind Map',
    emoji: '🧠',
    description: 'Generate a visual mind map structure of the content'
  }
];

export const PromptForm: React.FC<PromptFormProps> = ({
  onSubmit,
  onCancel,
  isProcessing,
  tabStatus
}) => {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<ModeType>('operator');
  const [role, setRole] = useState<RoleType>('operator');
  const [selectedBook, setSelectedBook] = useState<string>('');
  const [showBookSelection, setShowBookSelection] = useState(false);
  const [selectedNotebookLMOption, setSelectedNotebookLMOption] = useState<NotebookLMOption>('summary');
  const [showNotebookLMOptions, setShowNotebookLMOptions] = useState(false);
  const [showMultiTabSelector, setShowMultiTabSelector] = useState(false);
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);

  // 当模式改变时重置角色
  useEffect(() => {
    if (mode === 'operator') {
      setRole('operator');
    } else if (mode === 'ask') {
      setRole('books');
    }
    // 重置相关状态
    setShowBookSelection(false);
    setShowNotebookLMOptions(false);
    setSelectedBook('');
    setSelectedTabIds([]);
  }, [mode]);

  // 当角色改变时重置相关状态
  useEffect(() => {
    if (role === 'books') {
      setShowBookSelection(true);
      setShowNotebookLMOptions(false);
      if (!selectedBook) {
        setSelectedBook(availableBooks[0].id);
      }
    } else if (role === 'notebooklm') {
      setShowNotebookLMOptions(true);
      setShowBookSelection(false);
      setSelectedBook('');
    } else {
      setShowBookSelection(false);
      setShowNotebookLMOptions(false);
      setSelectedBook('');
    }
  }, [role, selectedBook]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isProcessing || tabStatus === 'detached') return;

    let finalRole = '';
    if (role === 'books' && selectedBook) {
      finalRole = `books-${selectedBook}`;
    } else if (role === 'notebooklm') {
      finalRole = `notebooklm-${selectedNotebookLMOption}`;
    }else{
      finalRole = role;
    }

    // Pass selected tab IDs for research role with multitab analysis
    const tabIds = role === 'researcher' && selectedTabIds.length > 0 ? selectedTabIds : undefined;
    onSubmit(prompt, finalRole, tabIds);
    setPrompt(''); // Clear the prompt after submission
  };

  const handleNotebookLMOptionClick = (option: NotebookLMOption) => {
    setSelectedNotebookLMOption(option);
    // 直接提交，使用选项作为prompt
    const finalRole = `notebooklm-${option}`;
    onSubmit(`#${option}`, finalRole);
  };

  const handleTabsSelected = (tabIds: number[]) => {
    setSelectedTabIds(tabIds);
    setShowMultiTabSelector(false);
  };

  const handleMultiTabAnalysis = () => {
    setShowMultiTabSelector(true);
  };

  useEffect(() => {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg.type === "copyToPrompt" && msg.text) {
        setPrompt(msg.text);
      }
    });
  }, []);

  const getSelectedBookInfo = () => {
    return availableBooks.find(book => book.id === selectedBook);
  };

  const getSelectedNotebookLMOption = () => {
    return notebookLMOptions.find(option => option.id === selectedNotebookLMOption);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 relative">
      <div className="w-full">
        {/* Mode Switch */}
        <div className="mb-3">
          <div className="flex items-center justify-center bg-gray-50 rounded-2xl p-1 border border-gray-200">
            <button
              type="button"
              onClick={() => setMode('operator')}
              className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                mode === 'operator'
                  ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
              disabled={isProcessing || tabStatus === 'detached'}
            >
              <span className="flex items-center justify-center gap-2">
                <span>⚡</span>
                <span>Operator</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode('ask')}
              className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                mode === 'ask'
                  ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
              disabled={isProcessing || tabStatus === 'detached'}
            >
              <span className="flex items-center justify-center gap-2">
                <span>🤔</span>
                <span>Ask</span>
              </span>
            </button>
          </div>
        </div>

        {/* Role Selection */}
        <div className="relative">
          <select
            className={`w-full bg-gradient-to-r ${mode === 'operator' ? 'from-sky-50 via-blue-50 to-indigo-50 border-sky-200' : 'from-emerald-50 via-green-50 to-teal-50 border-emerald-200'} border-2 rounded-2xl px-4 text-sm font-medium text-gray-800 shadow-lg hover:shadow-xl hover:border-${mode === 'operator' ? 'sky' : 'emerald'}-300 focus:outline-none focus:ring-3 focus:ring-${mode === 'operator' ? 'sky' : 'emerald'}-300 focus:border-${mode === 'operator' ? 'sky' : 'emerald'}-400 transition-all duration-300 backdrop-blur-sm appearance-none cursor-pointer ${showBookSelection || showNotebookLMOptions ? 'py-2 mb-1' : 'py-2 mb-2'}`}
            value={role}
            onChange={(e) => setRole(e.target.value as RoleType)}
            disabled={isProcessing || tabStatus === 'detached'}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
              backgroundPosition: 'right 12px center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: '16px'
            }}
          >
            {mode === 'operator' ? (
              <>
                <option value="operator" className="bg-white text-gray-800 py-2">⚡ Browser Operator</option>
                <option value="notebooklm" className="bg-white text-gray-800 py-2">📓 NotebookLM</option>
                <option value="researcher" className="bg-white text-gray-800 py-2">🔎 Research Analyst</option>
                <option value="lawyer" className="bg-white text-gray-800 py-2">⚖️ Legal Advisor</option>
                <option value="math" className="bg-white text-gray-800 py-2">∑ Mathematics Expert</option>
                <option value="code" className="bg-white text-gray-800 py-2">⌨️ Code Developer</option>
                <option value="qa" className="bg-white text-gray-800 py-2">✓ TestCase Writer</option>
                <option value="health" className="bg-white text-gray-800 py-2">⚕️ Medical Consultant</option>
                <option value="wiki" className="bg-white text-gray-800 py-2">📖 Wiki Assistant</option>
              </>
            ) : (
              <>
                <option value="books" className="bg-white text-gray-800 py-2">📚 Ask The Books</option>
                <option value="munger" className="bg-white text-gray-800 py-2">💎 Talk to Charlie Munger</option>
              </>
            )}
          </select>

          <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${mode === 'operator' ? 'from-sky-400 via-blue-400 to-indigo-400' : 'from-emerald-400 via-green-400 to-teal-400'} opacity-0 hover:opacity-20 transition-opacity duration-300 pointer-events-none -z-10`}></div>
        </div>

        {/* NotebookLM选项按钮 - 只在选择notebooklm时显示 */}
        {showNotebookLMOptions && role === 'notebooklm' && (
          <div className="mb-2 transform transition-all duration-200 ease-in-out">
            <div className="grid grid-cols-4 gap-2">
              {notebookLMOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleNotebookLMOptionClick(option.id)}
                  className={`group relative px-2 py-2 rounded-xl text-xs font-medium transition-all duration-200 border focus:outline-none focus:ring-2 focus:ring-offset-1 transform hover:scale-105 backdrop-blur-sm shadow-md hover:shadow-lg ${
                    selectedNotebookLMOption === option.id
                      ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white border-sky-400 shadow-sky-200/50 focus:ring-sky-300'
                      : 'bg-white/90 text-gray-700 border-white/50 hover:bg-white hover:border-sky-200 shadow-gray-200/50 focus:ring-sky-300 hover:text-sky-700'
                  }`}
                  disabled={isProcessing || tabStatus === 'detached'}
                >
                  <div className="relative flex flex-col items-center gap-1">
                    <span className="text-lg transform group-hover:scale-110 transition-transform duration-200">{option.emoji}</span>
                    <span className="font-semibold tracking-tight leading-tight">{option.title}</span>
                  </div>

                  {/* 选中状态指示器 */}
                  {selectedNotebookLMOption === option.id && (
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-white rounded-full shadow-md flex items-center justify-center">
                      <div className="w-1 h-1 bg-sky-500 rounded-full animate-pulse"></div>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* 选中选项的描述 - 更紧凑 */}
            {selectedNotebookLMOption && (
              <div className="mt-2 p-2 bg-sky-50/80 backdrop-blur-sm border border-sky-200/50 rounded-lg shadow-sm">
                <div className="text-xs text-sky-900 font-medium flex items-center gap-2">
                  <span>{getSelectedNotebookLMOption()?.emoji}</span>
                  <span>{getSelectedNotebookLMOption()?.title}</span>
                </div>
                <div className="text-xs text-sky-700 mt-1 leading-tight">
                  {getSelectedNotebookLMOption()?.description}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Research Role Multitab Options - 只在operator模式且选择researcher时显示 */}
        {mode === 'operator' && role === 'researcher' && (
          <div className="mb-2 transform transition-all duration-200 ease-in-out">
            <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-2 border-blue-200 rounded-2xl p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔍</span>
                  <div>
                    <div className="text-sm font-semibold text-blue-900">Multi-Tab Analysis</div>
                    <div className="text-xs text-blue-700">
                      {selectedTabIds.length > 0
                        ? `${selectedTabIds.length} tab${selectedTabIds.length > 1 ? 's' : ''} selected for analysis`
                        : 'Analyze multiple tabs together for comprehensive research'
                      }
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleMultiTabAnalysis}
                  className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl text-xs font-medium shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center gap-1"
                  disabled={isProcessing || tabStatus === 'detached'}
                >
                  <span>📋</span>
                  Select Tabs
                </button>
              </div>

              {selectedTabIds.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 bg-blue-100/50 rounded-lg px-2 py-1">
                    <div className="text-xs text-blue-800 font-medium">
                      Ready to analyze {selectedTabIds.length} selected tab{selectedTabIds.length > 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTabIds([])}
                    className="text-blue-600 hover:text-blue-700 text-xs hover:underline transition-colors duration-200"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 书籍二级选择 - 只在选择books时显示 */}
        {showBookSelection && role === 'books' && (
          <div className="mb-2 transform transition-all duration-300 ease-in-out">
            <div className="relative">
              <select
                className="w-full bg-gradient-to-r from-amber-50 via-orange-50 to-red-50 border-2 border-amber-200 rounded-2xl px-4 py-2 text-sm font-medium text-gray-800 shadow-lg hover:shadow-xl hover:border-amber-300 focus:outline-none focus:ring-3 focus:ring-amber-300 focus:border-amber-400 transition-all duration-300 backdrop-blur-sm appearance-none cursor-pointer"
                value={selectedBook}
                onChange={(e) => setSelectedBook(e.target.value)}
                disabled={isProcessing || tabStatus === 'detached'}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                  backgroundPosition: 'right 12px center',
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: '16px'
                }}
              >
                {availableBooks.map((book) => (
                  <option key={book.id} value={book.id} className="bg-white text-gray-800 py-2">
                    {book.emoji} {book.title} - {book.author}
                  </option>
                ))}
              </select>
              
              {/* 装饰性渐变边框 */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 opacity-0 hover:opacity-20 transition-opacity duration-300 pointer-events-none -z-10"></div>
            </div>
            
            {/* 选中书籍的描述 */}
            {selectedBook && (
              <div className="mt-2 p-3 bg-amber-50/80 backdrop-blur-sm border border-amber-200/50 rounded-xl transform transition-all duration-300 ease-in-out">
                <div className="text-xs text-amber-700 font-medium">
                  {getSelectedBookInfo()?.emoji} {getSelectedBookInfo()?.title}
                </div>
                <div className="text-xs text-amber-600 mt-1">
                  {getSelectedBookInfo()?.description}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* 输入框 */}
        <div className="relative">
          <TextareaAutosize
            className="w-full bg-white/80 backdrop-blur-sm border border-white/50 rounded-2xl px-4 py-3 pr-14 text-gray-700 placeholder-gray-400 shadow-lg resize-none focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent hover:shadow-xl transition-all duration-200"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              // Check if Enter was pressed without Shift key
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // Prevent default behavior (new line)
                handleSubmit(e); // Submit the form
              }
              // Allow Shift+Enter to create a new line (default behavior)
            }}
            placeholder={tabStatus === 'detached'
              ? "Tab connection lost. Please refresh the tab to continue."
              : mode === 'ask'
                ? role === 'books' && selectedBook
                  ? `Ask ${getSelectedBookInfo()?.title} anything...`
                  : role === 'wiki'
                    ? "Ask your Wiki Assistant anything..."
                    : role === 'munger'
                      ? "Chat with Charlie Munger..."
                      : "Ask your question..."
                : role === 'notebooklm'
                  ? `Generate ${getSelectedNotebookLMOption()?.title.toLowerCase()} for your content...`
                  : mode === 'operator' && role === 'researcher' && selectedTabIds.length > 0
                    ? "Enter your research question for multitab analysis..."
                    : "Type your message here..."}
            autoFocus
            disabled={isProcessing || tabStatus === 'detached'}
            minRows={1}
            maxRows={10}
            style={{ 
              resize: 'none',
              minHeight: '48px',
              maxHeight: '300px',
              overflow: 'auto'
            } as any}
          />
          
          {isProcessing ? (
            <button 
              type="button" 
              onClick={onCancel}
              className="absolute bottom-2 right-2 w-10 h-10 bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center justify-center"
              title="Cancel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6m0 0L6 6l12 12" />
              </svg>
            </button>
          ) : (
            <button 
              type="submit" 
              className="absolute bottom-2 right-2 w-10 h-10 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:shadow-lg"
              disabled={!prompt.trim() || tabStatus === 'detached'}
              title={tabStatus === 'detached' ? "Refresh tab to continue" : "Send message"}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* MultiTab Selector Modal */}
      <MultiTabSelector
        isVisible={showMultiTabSelector}
        onTabsSelected={handleTabsSelected}
        onClose={() => setShowMultiTabSelector(false)}
      />
    </form>
  );
};