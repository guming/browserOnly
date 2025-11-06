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
import { MultiTabSelector, type TabInfo } from './MultiTabSelector';
import { DuckDBService, DuckDBLoadStatus, type TableInfo } from '../../tracking/duckdbService';

interface PromptFormProps {
  onSubmit: (prompt: string, role: string, selectedTabIds?: number[]) => void;
  onCancel: () => void;
  isProcessing: boolean;
  tabStatus: 'attached' | 'detached' | 'unknown' | 'running' | 'idle' | 'error';
}

// 定义模式类型
type ModeType = 'operator' | 'ask' | 'dataAnalyze';

// 定义角色类型
type RoleType = 'operator' | 'researcher' | 'lawyer' | 'trader' | 'math' | 'qa' | 'code' | 'health' | 'wiki' | 'books' | 'munger' |'notebooklm' | 'dataAnalyst' | 'dataScientist' | 'statistician';

// 定义NotebookLM选项类型
type NotebookLMOption = 'summary' | 'study-guide' | 'faq' | 'mindmap';

// 定义书籍列表
interface Book {
  id: string;
  title: string;
  author: string;
  emoji: string;
  description: string;
  category: string;
}

// 定义书籍分类
interface BookCategory {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

const bookCategories: BookCategory[] = [
  {
    id: 'thinking',
    name: 'Thinking & Decision Making',
    emoji: '🧠',
    description: 'Master cognitive psychology and make better decisions'
  },
  {
    id: 'productivity',
    name: 'Productivity & Habits',
    emoji: '⚡',
    description: 'Build effective habits and boost personal productivity'
  },
  {
    id: 'business',
    name: 'Business & Strategy',
    emoji: '🚀',
    description: 'Learn entrepreneurship and strategic thinking'
  },
  {
    id: 'growth',
    name: 'Personal Growth',
    emoji: '🌟',
    description: 'Enhance happiness and learning skills'
  }
];

const availableBooks: Book[] = [
  // 🌟 Personal Growth
  {
    id: 'happinessBook',
    title: 'Build the Life You Want',
    author: 'Oprah Winfrey',
    emoji: '🏆',
    category: 'growth',
    description: `Ready to begin? Share:
1. Your current situation or specific challenges (e.g., burnt out at work, tense relationships, lack of direction)
2. Your most important goal (e.g., more fulfillment at work, better communication, feeling calmer)`,
  },
  {
    id: 'howToRead',
    title: 'How to Read a Book',
    author: 'Mortimer J. Adler',
    emoji: '📖',
    category: 'growth',
    description: `Ready to improve your reading? Share:
1. Your main reading goal (e.g., study faster, read classics, extract insights for work)
2. Your current reading challenge (e.g., difficulty finishing books, remembering key points)`,
  },

  // 🧠 Thinking & Decision Making
  {
    id: 'thinkingFastAndSlow',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    emoji: '🧠',
    category: 'thinking',
    description: `Ready to improve your thinking? Share:
1. What decisions or judgments are you struggling with? (e.g., investment, relationships, career)
2. Do you want to strengthen your intuition or improve your analytical accuracy?`,
  },
  {
    id: 'artOfThinkingClearly',
    title: 'The Art of Thinking Clearly',
    author: 'Rolf Dobelli',
    emoji: '💡',
    category: 'thinking',
    description: `Ready to think more clearly? Share:
1. A recent decision or belief that may have been influenced by bias
2. Your primary goal (e.g., rational business choices, better relationships, independent thinking)`,
  },

  // ⚡ Productivity & Habits
  {
    id: 'gettingThingsDone',
    title: 'Getting Things Done',
    author: 'David Allen',
    emoji: '✅',
    category: 'productivity',
    description: `Ready to get organized? Share:
1. Your current productivity challenge (e.g., overwhelm, procrastination, disorganization)
2. What system or tool you currently use to manage tasks (e.g., Notion, Todoist, pen & paper)`,
  },
  {
    id: 'deepWork',
    title: 'Deep Work',
    author: 'Cal Newport',
    emoji: '🎯',
    category: 'productivity',
    description: `Ready to master focus? Share:
1. What type of work or study requires your deepest focus?
2. Your main sources of distraction (e.g., notifications, meetings, social media)`,
  },
  {
    id: 'essentialism',
    title: 'Essentialism: The Disciplined Pursuit of Less',
    author: 'Greg McKeown',
    emoji: '🎪',
    category: 'productivity',
    description: `Ready to pursue less but better? Share:
1. What areas of your life feel overloaded or scattered right now?
2. The one or two goals that truly matter most to you in this season of life`,
  },
  {
    id: 'atomicHabits',
    title: 'Atomic Habits',
    author: 'James Clear',
    emoji: '⚡',
    category: 'productivity',
    description: `Ready to build better habits? Share:
1. A specific habit you want to build or break (e.g., exercising daily, reducing screen time, journaling)
2. Your primary motivation or identity goal (e.g., "I want to be healthier", "I want to be more focused")`,
  },

  // 🚀 Business & Strategy
  {
    id: 'leanStartup',
    title: 'The Lean Startup',
    author: 'Eric Ries',
    emoji: '🚀',
    category: 'business',
    description: `Ready to build lean? Share:
1. Your startup idea or current challenge (e.g., validating demand, defining MVP)
2. Your primary goal (e.g., faster experimentation, customer validation, product-market fit)`,
  },
  {
    id: 'artOfStrategy',
    title: 'The Art of Strategy',
    author: 'Avinash K. Dixit & Barry J. Nalebuff',
    emoji: '♟️',
    category: 'business',
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
  dataAnalyst: faChartLine,
  dataScientist: faCalculator,
  statistician: faChartLine,
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
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showBookSelection, setShowBookSelection] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookSearchQuery, setBookSearchQuery] = useState('');
  const [selectedNotebookLMOption, setSelectedNotebookLMOption] = useState<NotebookLMOption>('summary');
  const [showNotebookLMOptions, setShowNotebookLMOptions] = useState(false);
  const [showMultiTabSelector, setShowMultiTabSelector] = useState(false);
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<TabInfo[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [loadedTables, setLoadedTables] = useState<TableInfo[]>([]);
  const [duckdb] = useState(() => DuckDBService.getInstance());
  const [duckdbLoadStatus, setDuckdbLoadStatus] = useState<DuckDBLoadStatus>(DuckDBLoadStatus.NotInitialized);
  const [duckdbProgress, setDuckdbProgress] = useState<{ loaded: number; total: number; percentage: number } | null>(null);

  // 当模式改变时重置角色
  useEffect(() => {
    if (mode === 'operator') {
      setRole('operator');
    } else if (mode === 'ask') {
      setRole('books');
    } else if (mode === 'dataAnalyze') {
      setRole('dataAnalyst');

      // Initialize DuckDB when switching to Data Analyze mode
      const initDuckDB = async () => {
        if (duckdb.getLoadStatus() === DuckDBLoadStatus.NotInitialized) {
          try {
            // Set progress callback
            duckdb.setProgressCallback((loaded, total, percentage) => {
              setDuckdbProgress({ loaded, total, percentage });
            });

            // Update status to Downloading
            setDuckdbLoadStatus(DuckDBLoadStatus.Downloading);

            // Initialize DuckDB
            await duckdb.init();

            // Update status to Ready
            setDuckdbLoadStatus(DuckDBLoadStatus.Ready);
            setDuckdbProgress(null);

            console.log('DuckDB initialized successfully');
          } catch (error) {
            console.error('Failed to initialize DuckDB:', error);
            setDuckdbLoadStatus(DuckDBLoadStatus.Error);
            setDuckdbProgress(null);
          }
        } else {
          // Sync status with service
          setDuckdbLoadStatus(duckdb.getLoadStatus());
        }
      };

      initDuckDB();
    }
    // 重置相关状态
    setShowBookSelection(false);
    setShowNotebookLMOptions(false);
    setSelectedBook('');
    setSelectedTabIds([]);
  }, [mode, duckdb]);

  // 当角色改变时重置相关状态
  useEffect(() => {
    if (role === 'books') {
      setShowBookSelection(true);
      setShowNotebookLMOptions(false);
      if (!selectedBook) {
        // Initialize with first book in default category (growth)
        const booksInDefaultCategory = availableBooks.filter(book => book.category === 'growth');
        if (booksInDefaultCategory.length > 0) {
          setSelectedBook(booksInDefaultCategory[0].id);
        }
      }
      // Don't auto-open modal - let user click to open
    } else if (role === 'notebooklm') {
      setShowNotebookLMOptions(true);
      setShowBookSelection(false);
      setSelectedBook('');
      setShowBookModal(false);
    } else {
      setShowBookSelection(false);
      setShowNotebookLMOptions(false);
      setSelectedBook('');
      setShowBookModal(false);
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

  const handleTabsSelected = (tabs: TabInfo[]) => {
    setSelectedTabs(tabs);
    setSelectedTabIds(tabs.map(tab => tab.id));
    setShowMultiTabSelector(false);

    // Auto-insert URLs into textarea
    if (tabs.length > 0) {
      const prefixText = 'Please conduct research on the following URLs, focusing on the topics covered by their content.\n\n';
      const urlsList = tabs.map(tab => `- ${tab.url} (${tab.title})`).join('\n');
      setPrompt(prefixText + urlsList);
    }
  };

  const handleMultiTabAnalysis = () => {
    setShowMultiTabSelector(true);
  };

  const parseCSV = (text: string): string => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return '';

    // Format as markdown table
    const rows = lines.map(line => line.split(',').map(cell => cell.trim()));
    let result = '**Data Preview:**\n\n';

    // Header
    result += '| ' + rows[0].join(' | ') + ' |\n';
    result += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';

    // Data rows (limit to first 10 rows)
    const dataRows = rows.slice(1, Math.min(11, rows.length));
    dataRows.forEach(row => {
      result += '| ' + row.join(' | ') + ' |\n';
    });

    if (rows.length > 11) {
      result += `\n... and ${rows.length - 11} more rows\n`;
    }

    result += `\n**Total Rows:** ${rows.length - 1}\n`;
    result += `**Columns:** ${rows[0].length}\n`;

    return result;
  };

  const processFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const extension = file.name.split('.').pop()?.toLowerCase();

          let processed = '';

          switch (extension) {
            case 'csv':
              processed = parseCSV(content);
              break;
            case 'json':
              try {
                const jsonData = JSON.parse(content);
                processed = `**JSON Data:**\n\n\`\`\`json\n${JSON.stringify(jsonData, null, 2)}\n\`\`\`\n`;
              } catch (err) {
                processed = `**Raw JSON Content:**\n\n${content}\n`;
              }
              break;
            case 'txt':
              processed = `**Text File Content:**\n\n${content}\n`;
              break;
            case 'xlsx':
            case 'xls':
              processed = `**Excel File Detected:**\n\nPlease convert your Excel file to CSV format for better processing.\nYou can do this by opening the file in Excel and using "Save As" -> "CSV".\n`;
              break;
            default:
              processed = `**File Content:**\n\n${content}\n`;
          }

          resolve(processed);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const fileArray = Array.from(files);
      setUploadedFiles(fileArray);

      // DuckDB should already be initialized (happens when switching to dataAnalyze mode)
      if (!duckdb.isReady()) {
        alert('⚠️ Data Analysis engine is not ready. Please wait for initialization to complete.');
        return;
      }

      // Load files into DuckDB
      try {
        const tableNames: string[] = [];

        for (const file of fileArray) {
          const extension = file.name.split('.').pop()?.toLowerCase();

          // Read file content
          const content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
          });

          // Store in DuckDB based on file type
          let tableName: string;
          if (extension === 'csv') {
            tableName = await duckdb.createTableFromCSV(file.name, content);
            tableNames.push(tableName);
          } else if (extension === 'json') {
            tableName = await duckdb.createTableFromJSON(file.name, content);
            tableNames.push(tableName);
          } else {
            console.warn(`Skipping file ${file.name} - unsupported format for DuckDB`);
          }
        }

        // Refresh table list
        const tables = await duckdb.listTables();
        setLoadedTables(tables);

        // Generate prompt with table information
        if (tableNames.length > 0) {
          let promptText = `Data loaded successfully! The following tables are now available for analysis:\n\n`;

          for (const tableName of tableNames) {
            const tableInfo = await duckdb.getTableInfo(tableName);
            if (tableInfo) {
              promptText += `📊 **${tableName}**\n`;
              promptText += `   - Rows: ${tableInfo.rowCount}\n`;
              promptText += `   - Columns: ${tableInfo.columns.map(c => c.name).join(', ')}\n\n`;
            }
          }

          promptText += `You can query this data using SQL. For example:\n`;
          promptText += `- SELECT * FROM ${tableNames[0]} LIMIT 10\n`;
          promptText += `- SELECT COUNT(*) FROM ${tableNames[0]}\n\n`;
          promptText += `What would you like to know about this data?`;

          setPrompt(promptText);
        }
      } catch (error) {
        console.error('Error loading files into DuckDB:', error);
        alert(`Error loading files: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  const handleRemoveFile = async (index: number) => {
    const file = uploadedFiles[index];
    if (file) {
      // Remove table from DuckDB
      try {
        const tableName = duckdb['sanitizeTableName']?.(file.name) ||
                         file.name.replace(/\.(csv|json|txt|xlsx|xls)$/i, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
        await duckdb.dropTable(tableName);

        // Refresh table list
        const tables = await duckdb.listTables();
        setLoadedTables(tables);
      } catch (error) {
        console.error('Error removing table:', error);
      }
    }

    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    // Clear prompt if no files left
    if (uploadedFiles.length === 1) {
      setPrompt('');
    }
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

  const getBooksByCategory = (categoryId: string) => {
    if (categoryId === 'all') {
      return availableBooks;
    }
    return availableBooks.filter(book => book.category === categoryId);
  };

  const getCategoryInfo = (categoryId: string) => {
    return bookCategories.find(cat => cat.id === categoryId);
  };

  // Filter books by search query and category
  const getFilteredBooks = () => {
    let books = getBooksByCategory(selectedCategory);

    if (bookSearchQuery.trim()) {
      const query = bookSearchQuery.toLowerCase();
      books = books.filter(book =>
        book.title.toLowerCase().includes(query) ||
        book.author.toLowerCase().includes(query)
      );
    }

    return books;
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 relative">
      <div className="w-full">
        {/* Mode Switch - Compact & Friendly */}
        <div className="mb-3">
          <div className="flex items-center justify-center bg-gray-50 rounded-xl p-0.5 border border-gray-200 gap-0.5">
            <button
              type="button"
              onClick={() => setMode('operator')}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                mode === 'operator'
                  ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md scale-[1.02]'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100/80'
              }`}
              disabled={isProcessing || tabStatus === 'detached'}
            >
              <span className="flex items-center justify-center gap-1">
                <span className="text-sm">⚡</span>
                <span>Operator</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode('ask')}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                mode === 'ask'
                  ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md scale-[1.02]'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100/80'
              }`}
              disabled={isProcessing || tabStatus === 'detached'}
            >
              <span className="flex items-center justify-center gap-1">
                <span className="text-sm">🤔</span>
                <span>Ask</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMode('dataAnalyze')}
              className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                mode === 'dataAnalyze'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-md scale-[1.02]'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100/80'
              }`}
              disabled={isProcessing || tabStatus === 'detached'}
            >
              <span className="flex items-center justify-center gap-1">
                <span className="text-sm">📊</span>
                <span>Data Analyze</span>
              </span>
            </button>
          </div>
        </div>

        {/* Role Selection - Hidden in Data Analyze mode */}
        {mode !== 'dataAnalyze' && (
          <div className="relative">
            <select
              className={`w-full bg-gradient-to-r ${
                mode === 'operator'
                  ? 'from-sky-50 via-blue-50 to-indigo-50 border-sky-200'
                  : 'from-emerald-50 via-green-50 to-teal-50 border-emerald-200'
              } border-2 rounded-2xl px-4 text-sm font-medium text-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 backdrop-blur-sm appearance-none cursor-pointer ${showBookSelection || showNotebookLMOptions ? 'py-2 mb-1' : 'py-2 mb-2'}`}
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

            <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${
              mode === 'operator'
                ? 'from-sky-400 via-blue-400 to-indigo-400'
                : 'from-emerald-400 via-green-400 to-teal-400'
            } opacity-0 hover:opacity-20 transition-opacity duration-300 pointer-events-none -z-10`}></div>
          </div>
        )}

        {/* DuckDB Loading Status - Only in Data Analyze mode */}
        {mode === 'dataAnalyze' && duckdbLoadStatus === DuckDBLoadStatus.Downloading && (
          <div className="mb-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-2xl p-4 shadow-lg">
            <div className="flex flex-col items-center gap-3">
              {/* Loading Icon */}
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center text-2xl">
                  📦
                </div>
              </div>

              {/* Status Text */}
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800 mb-1">
                  初始化数据分析引擎
                </p>
                <p className="text-xs text-gray-600">
                  从CDN下载 DuckDB WASM (~32MB)
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  需要稳定的网络连接
                </p>
              </div>

              {/* Progress Bar */}
              {duckdbProgress && (
                <div className="w-full">
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                    <span>{(duckdbProgress.loaded / 1024 / 1024).toFixed(1)} MB</span>
                    <span>{duckdbProgress.percentage}%</span>
                    <span>{(duckdbProgress.total / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                  <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-300 ease-out"
                      style={{ width: `${duckdbProgress.percentage}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* DuckDB Error Status */}
        {mode === 'dataAnalyze' && duckdbLoadStatus === DuckDBLoadStatus.Error && (
          <div className="mb-3 bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 rounded-2xl p-4 shadow-lg">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="text-4xl">⚠️</div>
              <div>
                <p className="text-sm font-semibold text-red-800 mb-1">
                  数据分析引擎加载失败
                </p>
                <p className="text-xs text-red-600 mb-1">
                  {duckdb.getErrorMessage() || '无法加载 DuckDB WASM'}
                </p>
                <p className="text-xs text-gray-600 mb-2">
                  请检查网络连接，该功能需要从CDN下载约32MB文件
                </p>
                <button
                  onClick={() => {
                    setDuckdbLoadStatus(DuckDBLoadStatus.NotInitialized);
                    setDuckdbProgress(null);
                    // Trigger re-init by simulating mode change
                    const currentMode = mode;
                    setMode('operator');
                    setTimeout(() => setMode(currentMode as ModeType), 0);
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  重试
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload Data Button - Only in Data Analyze mode and when DuckDB is ready */}
        {mode === 'dataAnalyze' && duckdbLoadStatus === DuckDBLoadStatus.Ready && (
          <div className="mb-2">
            <input
              type="file"
              id="file-upload"
              multiple
              accept=".csv,.xlsx,.xls,.json,.txt"
              onChange={handleFileUpload}
              className="hidden"
              disabled={isProcessing || tabStatus === 'detached'}
            />
            <label
              htmlFor="file-upload"
              className={`block w-full bg-gradient-to-r from-purple-50 via-pink-50 to-rose-50 border-2 border-purple-200 rounded-2xl px-4 py-3 text-center text-sm font-medium text-gray-800 shadow-lg hover:shadow-xl hover:border-purple-300 transition-all duration-300 cursor-pointer ${
                isProcessing || tabStatus === 'detached' ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-lg">📤</span>
                <span>Upload Data</span>
                <span className="text-xs text-gray-500">(CSV, Excel, JSON, TXT)</span>
              </span>
            </label>

            {/* Display uploaded files */}
            {uploadedFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-sm">📄</span>
                      <span className="text-sm text-gray-700 truncate">{file.name}</span>
                      <span className="text-xs text-gray-500">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(index)}
                      className="text-red-500 hover:text-red-700 p-1"
                      title="Remove file"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Display loaded tables */}
            {loadedTables.length > 0 && (
              <div className="mt-3 bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <span>🗄️</span>
                    <span>Loaded Tables ({loadedTables.length})</span>
                  </h3>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {loadedTables.map((table, index) => (
                    <div
                      key={index}
                      className="bg-white border border-purple-100 rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800">{table.name}</span>
                        <span className="text-xs text-gray-500">{table.rowCount} rows</span>
                      </div>
                      <div className="text-xs text-gray-600">
                        <span className="font-medium">Columns:</span>{' '}
                        {table.columns.slice(0, 3).map(c => c.name).join(', ')}
                        {table.columns.length > 3 && ` +${table.columns.length - 3} more`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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

        {/* 书籍选择按钮 - 只在选择books时显示 */}
        {showBookSelection && role === 'books' && (
          <div className="mb-2 transform transition-all duration-200 ease-in-out">
            <button
              type="button"
              onClick={() => setShowBookModal(true)}
              className="w-full bg-gradient-to-r from-amber-50 via-orange-50 to-red-50 border-2 border-amber-200 rounded-2xl p-3 hover:border-amber-300 hover:shadow-lg transition-all duration-200 text-left"
              disabled={isProcessing || tabStatus === 'detached'}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-2xl flex-shrink-0">{selectedBook ? getSelectedBookInfo()?.emoji : '📚'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-amber-700 font-medium">
                      {selectedBook ? getCategoryInfo(getSelectedBookInfo()?.category || '')?.name : 'Select a Book'}
                    </div>
                    <div className="text-sm font-semibold text-gray-800 truncate">
                      {selectedBook ? getSelectedBookInfo()?.title : 'Choose from 10 books'}
                    </div>
                    {selectedBook && (
                      <div className="text-xs text-gray-600 truncate">
                        {getSelectedBookInfo()?.author}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-amber-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>

            {/* Selected Book Description - Display on main page */}
            {selectedBook && getSelectedBookInfo() && (
              <div className="mt-2 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-3 shadow-sm">
                <div className="text-xs text-gray-700 leading-relaxed space-y-1.5 max-h-32 overflow-y-auto">
                  {getSelectedBookInfo()?.description.split('\n').map((line, idx) => (
                    <p key={idx} className={idx === 0 ? 'font-medium text-amber-900' : ''}>
                      {line}
                    </p>
                  ))}
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
        initialSelectedTabIds={selectedTabIds}
      />

      {/* Book Selection Modal */}
      {showBookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowBookModal(false);
              setBookSearchQuery('');
            }}
          />

          {/* Compact Modal Content */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[600px] overflow-hidden animate-slideUp">
            {/* Compact Header */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📚</span>
                <h2 className="text-lg font-bold text-white">Select a Book</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBookModal(false);
                  setBookSearchQuery('');
                }}
                className="text-white hover:bg-white/20 rounded-full p-1.5 transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Filter and Search */}
            <div className="p-3 border-b border-gray-200 space-y-2">
              {/* Category Filter Dropdown */}
              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 pr-8 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 appearance-none cursor-pointer"
                >
                  <option value="all">📚 All Categories ({availableBooks.length} books)</option>
                  {bookCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.emoji} {category.name} ({getBooksByCategory(category.id).length} books)
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Search Input */}
              <div className="relative">
                <input
                  type="text"
                  value={bookSearchQuery}
                  onChange={(e) => setBookSearchQuery(e.target.value)}
                  placeholder="Search by title or author..."
                  className="w-full px-3 py-2 pr-9 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Compact Books List */}
            <div className="overflow-y-auto max-h-[400px]">
              {getFilteredBooks().length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <div className="text-4xl mb-2">📚</div>
                  <p className="text-sm">No books found</p>
                  <p className="text-xs mt-1">Try adjusting your filters</p>
                </div>
              ) : (
                <div className="p-2">
                  {getFilteredBooks().map((book) => (
                    <button
                      key={book.id}
                      type="button"
                      onClick={() => {
                        setSelectedBook(book.id);
                        setShowBookModal(false);
                        setBookSearchQuery('');
                      }}
                      className={`w-full text-left p-3 mb-2 rounded-lg border transition-all duration-200 ${
                        selectedBook === book.id
                          ? 'bg-amber-50 border-amber-400 shadow-md'
                          : 'bg-white border-gray-200 hover:border-amber-300 hover:bg-amber-50/50 hover:shadow'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl flex-shrink-0">{book.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-gray-900 truncate">
                            {book.title}
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            by {book.author}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-xs">{getCategoryInfo(book.category)?.emoji}</span>
                            <span className="text-xs text-gray-500">{getCategoryInfo(book.category)?.name}</span>
                          </div>
                        </div>
                        {selectedBook === book.id && (
                          <div className="flex-shrink-0 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </form>
  );
};