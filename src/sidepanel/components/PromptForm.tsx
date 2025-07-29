import { faCircleUser, faGamepad, faPaperPlane, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

interface PromptFormProps {
  onSubmit: (prompt: string, role: string) => void;
  onCancel: () => void;
  isProcessing: boolean;
  tabStatus: 'attached' | 'detached' | 'unknown' | 'running' | 'idle' | 'error';
}

export const PromptForm: React.FC<PromptFormProps> = ({
  onSubmit,
  onCancel,
  isProcessing,
  tabStatus
}) => {
  const [prompt, setPrompt] = useState('');
  const [role, setRole] = useState('operator');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isProcessing || tabStatus === 'detached') return;
    console.log("role is ", role);
    onSubmit(prompt, role);
    setPrompt(''); // Clear the prompt after submission
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 relative">
      <div className="w-full">
        <FontAwesomeIcon icon={faCircleUser} className="text-gray-500 hover:text-gray-700" />
        <select
          className="select select-ghost select-xs select-bordered w-auto focus:outline-none focus:ring-0 pl-0"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={isProcessing || tabStatus === 'detached'}
        >
          <option value="operator">Operator</option>
          <option value="researcher">Researcher</option>
          <option value="lawyer">Lawyer</option>
          <option value="trader">Trader</option>
          <option value="math">Math Assistant</option>
          <option value="qa">TestCase Writer</option>
          <option value="code">Code</option>
          <option value="health">Health Assistant</option>
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
