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

interface PromptFormProps {
  onSubmit: (prompt: string, role: string) => void;
  onCancel: () => void;
  isProcessing: boolean;
  tabStatus: 'attached' | 'detached' | 'unknown' | 'running' | 'idle' | 'error';
}

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
    id: 'Build the Life You Want',
    title: 'Build the Life You Want',
    author: 'Oprah Winfrey',
    emoji: '🏆',
    description: `Are you ready to begin? Please answer the following two questions so we can start immediately:  

1. To help me understand you better, please describe your **current situation or specific challenges** in detail (e.g., feeling burnt out at work, tense family relationships, or a lack of life direction).  
2. What is the **most important and specific goal** you hope to achieve using this methodology? (e.g., finding more fulfillment at work, improving communication with your partner, or simply feeling calmer and happier in daily life).  
`,
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
  const [role, setRole] = useState<RoleType>('operator');
  const [selectedBook, setSelectedBook] = useState<string>('');
  const [showBookSelection, setShowBookSelection] = useState(false);
  const [selectedNotebookLMOption, setSelectedNotebookLMOption] = useState<NotebookLMOption>('summary');
  const [showNotebookLMOptions, setShowNotebookLMOptions] = useState(false);

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
    if (role === 'books') {
      finalRole = `books`;
    } else if (role === 'notebooklm') {
      finalRole = `notebooklm-${selectedNotebookLMOption}`;
    }else{
      finalRole = role;
    }
    
    onSubmit(prompt, finalRole);
    setPrompt(''); // Clear the prompt after submission
  };

  const handleNotebookLMOptionClick = (option: NotebookLMOption) => {
    setSelectedNotebookLMOption(option);
    // 直接提交，使用选项作为prompt
    const finalRole = `notebooklm-${option}`;
    onSubmit(`#${option}`, finalRole);
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
    <form onSubmit={handleSubmit} className="mt-4 relative">
      <div className="w-full">
        {/* 主要角色选择 */}
        <div className="relative">
          <select
            className={`w-full bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 border-2 border-sky-200 rounded-2xl px-4 text-sm font-medium text-gray-800 shadow-lg hover:shadow-xl hover:border-sky-300 focus:outline-none focus:ring-3 focus:ring-sky-300 focus:border-sky-400 transition-all duration-300 backdrop-blur-sm appearance-none cursor-pointer ${showBookSelection || showNotebookLMOptions ? 'py-2 mb-2' : 'py-3 mb-3'}`}
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
            <option value="operator" className="bg-white text-gray-800 py-2">⚡ Browser Operator</option>
            <option value="notebooklm" className="bg-white text-gray-800 py-2">📓 NotebookLM</option>
            <option value="researcher" className="bg-white text-gray-800 py-2">🔎 Research Analyst</option>
            <option value="lawyer" className="bg-white text-gray-800 py-2">⚖️ Legal Advisor</option>
            <option value="math" className="bg-white text-gray-800 py-2">∑ Mathematics Expert</option>
            <option value="code" className="bg-white text-gray-800 py-2">⌨️ Code Developer</option>
            <option value="qa" className="bg-white text-gray-800 py-2">✓ TestCase Writer</option>
            <option value="health" className="bg-white text-gray-800 py-2">⚕️ Medical Consultant</option>
            <option value="wiki" className="bg-white text-gray-800 py-2">📖 Ask Wiki</option>
            <option value="books" className="bg-white text-gray-800 py-2">📚 Ask The Books</option>
            <option value="munger" className="bg-white text-gray-800 py-2">💎 Talk to Charlie Munger</option>
          </select>
          
          {/* 装饰性渐变边框 */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-400 opacity-0 hover:opacity-20 transition-opacity duration-300 pointer-events-none -z-10"></div>
        </div>

        {/* NotebookLM选项按钮 - 只在选择notebooklm时显示 */}
        {showNotebookLMOptions && role === 'notebooklm' && (
          <div className="mb-3 transform transition-all duration-200 ease-in-out">
            <div className="grid grid-cols-2 gap-2">
              {notebookLMOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleNotebookLMOptionClick(option.id)}
                  className={`px-4 py-3 rounded-full text-sm font-medium transition-all duration-200 border focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                    selectedNotebookLMOption === option.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md hover:bg-blue-700'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400 shadow-sm'
                  }`}
                  disabled={isProcessing || tabStatus === 'detached'}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-base">{option.emoji}</span>
                    <span>{option.title}</span>
                  </div>
                </button>
              ))}
            </div>
            
            {/* 选中选项的描述 */}
            {selectedNotebookLMOption && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm text-blue-900 font-medium flex items-center gap-2">
                  <span>{getSelectedNotebookLMOption()?.emoji}</span>
                  <span>{getSelectedNotebookLMOption()?.title}</span>
                </div>
                <div className="text-sm text-blue-700 mt-1">
                  {getSelectedNotebookLMOption()?.description}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 书籍二级选择 - 只在选择books时显示 */}
        {showBookSelection && role === 'books' && (
          <div className="mb-3 transform transition-all duration-300 ease-in-out">
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
              : role === 'books' && selectedBook
                ? `Ask ${getSelectedBookInfo()?.title} anything...`
                : role === 'notebooklm'
                  ? `Generate ${getSelectedNotebookLMOption()?.title.toLowerCase()} for your content...`
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
    </form>
  );
};