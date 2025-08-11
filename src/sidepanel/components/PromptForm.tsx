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
        <select
          className="select select-ghost select-xs select-bordered w-auto focus:outline-none focus:ring-0 pl-0"
          value={role}
          onChange={(e) => setRole(e.target.value as RoleType)}
          disabled={isProcessing || tabStatus === 'detached'}
        >
          <option value="operator">🧙🏾‍♂️ Browser Operator</option>
          <option value="researcher">🔍 Research Analyst</option>
          <option value="lawyer">⚖️ Legal Advisor</option>
          {/* <option value="trader">📈 Trading Specialist</option> */}
          <option value="math">🧮 Mathematics Expert</option>
          <option value="code">💻 Code Developer</option>
          <option value="qa">🧪 TestCase Writer</option>
          <option value="health">❤️ Medical Consultant</option>
          <option value="wiki">🌊 AI Wiki </option>
          <option value="munger">🍔 Charlie Munger(cosplay)</option>
        </select>
        <TextareaAutosize
          className="textarea textarea-bordered w-full pr-12"
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
            : "Type a message..."}
          autoFocus
          disabled={isProcessing || tabStatus === 'detached'}
          minRows={1}
          maxRows={10}
          style={{ 
            resize: 'none',
            minHeight: '40px',
            maxHeight: '300px',
            overflow: 'auto'
          } as any}
        />
        {isProcessing ? (
          <button 
            type="button" 
            onClick={onCancel}
            className="btn btn-sm btn-circle btn-error absolute"
            style={{ bottom: '5px', right: '5px' }}
            title="Cancel"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        ) : (
          <button 
            type="submit" 
            className="btn btn-sm btn-circle btn-primary absolute"
            style={{ bottom: '5px', right: '5px' }}
            disabled={!prompt.trim() || tabStatus === 'detached'}
            title={tabStatus === 'detached' ? "Refresh tab to continue" : "Execute"}
          >
            <FontAwesomeIcon icon={faPaperPlane} />
          </button>
        )}
      </div>
    </form>
  );
};
