import { faPaperPlane, faXmark } from '@fortawesome/free-solid-svg-icons';
import { 
  faUserTie, 
  faSearch, 
  faBalanceScale, 
  faChartLine, 
  faCalculator, 
  faVial, 
  faCode, 
  faHeartbeat 
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
type RoleType = 'operator' | 'researcher' | 'lawyer' | 'trader' | 'math' | 'qa' | 'code' | 'health';

const roleIcons: Record<RoleType, any> = {
    operator: faUserTie,
    researcher: faSearch,
    lawyer: faBalanceScale,
    trader: faChartLine,
    math: faCalculator,
    qa: faVial,
    code: faCode,
    health: faHeartbeat
  };

export const PromptForm: React.FC<PromptFormProps> = ({
  onSubmit,
  onCancel,
  isProcessing,
  tabStatus
}) => {
  const [prompt, setPrompt] = useState('');
   const [role, setRole] = useState<RoleType>('operator');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isProcessing || tabStatus === 'detached') return;
    console.log("the exec role is ", role);
    onSubmit(prompt, role);
    setPrompt(''); // Clear the prompt after submission
  };

  useEffect(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "copyToPrompt" && msg.text) {
      setPrompt(msg.text);
      }
    });
  }, []);




  return (
  <form onSubmit={handleSubmit} className="mt-4 relative">
  <div className="w-full">
    <div className="relative">
  <select
    className="w-full bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 border-2 border-sky-200 rounded-2xl px-4 py-3 text-sm font-medium text-gray-800 shadow-lg hover:shadow-xl hover:border-sky-300 focus:outline-none focus:ring-3 focus:ring-sky-300 focus:border-sky-400 transition-all duration-300 backdrop-blur-sm appearance-none cursor-pointer mb-3"
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
    {/* <option value="trader" className="bg-white text-gray-800 py-2">📈 Trading Specialist</option> */}
    <option value="math" className="bg-white text-gray-800 py-2">∑ Mathematics Expert</option>
    <option value="code" className="bg-white text-gray-800 py-2">⌨️ Code Developer</option>
    <option value="qa" className="bg-white text-gray-800 py-2">✓ TestCase Writer</option>
    <option value="health" className="bg-white text-gray-800 py-2">⚕️ Medical Consultant</option>
    <option value="wiki" className="bg-white text-gray-800 py-2">📖 AI Wiki</option>
    <option value="munger" className="bg-white text-gray-800 py-2">💎 Charlie Munger (cosplay)</option>
  </select>
  
  {/* 装饰性渐变边框 */}
  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-400 opacity-0 hover:opacity-20 transition-opacity duration-300 pointer-events-none -z-10"></div>
  
  {/* 微光效果 */}
  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none opacity-0 hover:opacity-100"></div>
</div>
    
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
