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
<div className="flex justify-between items-center p-4">
  <div className="text-xl font-bold text-gray-800">
    Output
  </div>
  <div className="flex items-center gap-3">
    <div className="tooltip tooltip-bottom" data-tip="Reflect and learn from this session">
      <button 
        onClick={onReflectAndLearn}
        className="btn btn-sm bg-gradient-to-r from-sky-500 to-blue-600 border-0 text-white hover:from-sky-600 hover:to-blue-700 shadow-lg rounded-xl transform hover:scale-105 transition-all duration-200"
        disabled={isProcessing}
      >
        <FontAwesomeIcon icon={faBrain} className="w-4 h-4" />
      </button>
    </div>
    <div className="tooltip tooltip-bottom" data-tip="Clear conversation history and LLM context">
      <button 
        onClick={onClearHistory}
        className="btn btn-sm bg-white/70 backdrop-blur-sm border border-gray-200 text-gray-700 hover:bg-white/90 hover:border-gray-300 shadow-md rounded-xl transform hover:scale-105 transition-all duration-200"
        disabled={isProcessing}
      >
        <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
      </button>
    </div>
  </div>
</div>
  );
};
