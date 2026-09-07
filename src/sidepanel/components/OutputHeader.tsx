import { faTrash, faBrain } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React from 'react';

interface OutputHeaderProps {
  onClearHistory: () => void;
  onReflectAndLearn: () => void;
  isProcessing: boolean;
}

export const OutputHeader: React.FC<OutputHeaderProps> = ({
  onClearHistory,
  onReflectAndLearn,
  isProcessing
}) => {
  return (
<div className="flex items-center justify-between border-b border-slate-200 bg-[#f2f5f7] px-4 py-2">
  <div className="text-xl font-semibold text-stone-900">
    Output
  </div>
  <div className="flex items-center gap-3">
    <div className="tooltip tooltip-bottom" data-tip="Reflect and learn from this session">
      <button 
        onClick={onReflectAndLearn}
        className="btn btn-sm border border-stone-300 bg-white text-stone-700 transition-colors duration-150 hover:border-stone-500 hover:bg-stone-50"
        disabled={isProcessing}
      >
        <FontAwesomeIcon icon={faBrain} className="w-4 h-4" />
      </button>
    </div>
    <div className="tooltip tooltip-bottom" data-tip="Clear conversation history and LLM context">
      <button 
        onClick={onClearHistory}
        className="btn btn-sm border border-stone-300 bg-white text-stone-700 transition-colors duration-150 hover:border-stone-500 hover:bg-stone-50"
        disabled={isProcessing}
      >
        <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
      </button>
    </div>
  </div>
</div>
  );
};
