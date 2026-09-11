import React from 'react';

interface ProviderSelectorProps {
  provider: string;
  setProvider: (provider: string) => void;
}

export function ProviderSelector({ provider, setProvider }: ProviderSelectorProps) {
  return (
    <div className="mb-6 border-b border-stone-200 pb-6">
      <label htmlFor="default-provider" className="mb-1 block text-sm font-semibold text-stone-800">
        Default Provider
      </label>
      <p className="mb-3 text-xs leading-5 text-stone-500">
        Used for translation and all other LLM tasks. Select a provider to configure it below.
      </p>
      <select
        id="default-provider"
        className="select select-bordered w-full max-w-md"
        value={provider}
        onChange={(e) => setProvider(e.target.value)}
      >
        <option value="deepseek">DeepSeek</option>
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic</option>
        <option value="gemini">Google Gemini</option>
        <option value="ollama">Ollama</option>
        <option value="openai-compatible">OpenAI Compatible</option>
      </select>
    </div>
  );
}
