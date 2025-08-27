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
type RoleType = 'operator' | 'researcher' | 'lawyer' | 'trader' | 'math' | 'qa' | 'code' | 'health' | 'wiki' | 'books' | 'munger';

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
    id: 'rich_dad_poor_dad',
    title: 'Rich Dad Poor Dad',
    author: 'Robert Kiyosaki',
    emoji: '💰',
    description: 'Personal finance and investing wisdom'
  },
  {
    id: 'thinking_fast_slow',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    emoji: '🧠',
    description: 'Behavioral economics and decision making'
  },
  {
    id: 'atomic_habits',
    title: 'Atomic Habits',
    author: 'James Clear',
    emoji: '⚡',
    description: 'Building good habits and breaking bad ones'
  },
  {
    id: 'deep_work',
    title: 'Deep Work',
    author: 'Cal Newport',
    emoji: '🎯',
    description: 'Focused success in a distracted world'
  },
  {
    id: 'psychology_money',
    title: 'The Psychology of Money',
    author: 'Morgan Housel',
    emoji: '🧮',
    description: 'Timeless lessons on wealth and happiness'
  },
  {
    id: 'sapiens',
    title: 'Sapiens',
    author: 'Yuval Noah Harari',
    emoji: '🌍',
    description: 'A brief history of humankind'
  },
  {
    id: 'Build the Life You Want',
    title: 'Build the Life You Want',
    author: 'Oprah Winfrey',
    emoji: '🏆',
    description: 'Personal and professional effectiveness'
  },
  {
    id: 'lean_startup',
    title: 'The Lean Startup',
    author: 'Eric Ries',
    emoji: '🚀',
    description: 'Innovation and entrepreneurship'
  }
];

const roleIcons: Record<RoleType, any> = {
  operator: faUserTie,
  researcher: faSearch,
  lawyer: faBalanceScale,
  trader: faChartLine,
  math: faCalculator,
  qa: faVial,
  code: faCode,
  health: faHeartbeat,
  wiki: faBook,
  books: faBook,
  munger: faBook
};

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

  // 当角色改变时重置书籍选择
  useEffect(() => {
    if (role === 'books') {
      setShowBookSelection(true);
      if (!selectedBook) {
        setSelectedBook(availableBooks[0].id);
      }
    } else {
      setShowBookSelection(false);
      setSelectedBook('');
    }
  }, [role, selectedBook]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isProcessing || tabStatus === 'detached') return;
    
    // 如果是书籍模式，将书籍信息附加到角色信息中
    const finalRole = role === 'books' ? `books:${selectedBook}` : role;
    
    onSubmit(prompt, finalRole);
    setPrompt(''); // Clear the prompt after submission
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

  return (
    <form onSubmit={handleSubmit} className="mt-4 relative">
      <div className="w-full">
        {/* 主要角色选择 */}
        <div className="relative">
          <select
            className={`w-full bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 border-2 border-sky-200 rounded-2xl px-4 text-sm font-medium text-gray-800 shadow-lg hover:shadow-xl hover:border-sky-300 focus:outline-none focus:ring-3 focus:ring-sky-300 focus:border-sky-400 transition-all duration-300 backdrop-blur-sm appearance-none cursor-pointer ${showBookSelection ? 'py-2 mb-2' : 'py-3 mb-3'}`}
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
            <option value="researcher" className="bg-white text-gray-800 py-2">🔎 Research Analyst</option>
            <option value="lawyer" className="bg-white text-gray-800 py-2">⚖️ Legal Advisor</option>
            <option value="math" className="bg-white text-gray-800 py-2">∑ Mathematics Expert</option>
            <option value="code" className="bg-white text-gray-800 py-2">⌨️ Code Developer</option>
            <option value="qa" className="bg-white text-gray-800 py-2">✓ TestCase Writer</option>
            <option value="health" className="bg-white text-gray-800 py-2">⚕️ Medical Consultant</option>
            <option value="wiki" className="bg-white text-gray-800 py-2">📖 Ask Wiki</option>
            <option value="books" className="bg-white text-gray-800 py-2">📚 Ask the Books</option>
            <option value="munger" className="bg-white text-gray-800 py-2">💎 Talk to Charlie Munger</option>
          </select>
          
          {/* 装饰性渐变边框 */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-400 opacity-0 hover:opacity-20 transition-opacity duration-300 pointer-events-none -z-10"></div>
        </div>

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