import React from 'react';

interface ProviderSelectorProps {
  provider: string;
  setProvider: (provider: string) => void;
}

export function ProviderSelector({ provider, setProvider }: ProviderSelectorProps) {
  return (
    <div className="mb-6">
  <label className="block text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
    <span className="w-2 h-2 bg-gradient-to-r from-sky-500 to-blue-600 rounded-full"></span>
    LLM Provider
  </label>
  
  <div className="relative">
    <select
      className="w-full bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 border-2 border-sky-200 rounded-2xl px-4 py-3 text-sm font-medium text-gray-800 shadow-lg hover:shadow-xl hover:border-sky-300 focus:outline-none focus:ring-3 focus:ring-sky-300 focus:border-sky-400 transition-all duration-300 backdrop-blur-sm appearance-none cursor-pointer"
      value={provider}
      onChange={(e) => setProvider(e.target.value)}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
        backgroundPosition: 'right 12px center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: '16px'
      }}
    >
      <option value="deepseek" className="bg-white text-gray-800 py-2">🔍 DeepSeek</option>
      <option value="openai" className="bg-white text-gray-800 py-2">⚡ OpenAI (GPT)</option>
      <option value="anthropic" className="bg-white text-gray-800 py-2">🧠 Anthropic (Claude)</option>
      <option value="gemini" className="bg-white text-gray-800 py-2">💎 Google (Gemini)</option>
      <option value="ollama" className="bg-white text-gray-800 py-2">🦙 Ollama</option>
      <option value="openai-compatible" className="bg-white text-gray-800 py-2">🔧 OpenAI Compatible</option>
    </select>
    
    {/* 装饰性渐变边框 */}
    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-400 opacity-0 hover:opacity-20 transition-opacity duration-300 pointer-events-none -z-10"></div>
    
    {/* 微光效果 */}
    <div className="absolute top-0 left-0 w-full h-full rounded-2xl bg-gradient-to-r from-transparent via-white/20 to-transparent transform -skew-x-12 -translate-x-full opacity-0 transition-all duration-700 pointer-events-none"></div>
  </div>
</div>
  );
}
