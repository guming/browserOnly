import React from 'react';
import { Model } from './ModelList';
import { OllamaModel } from './OllamaModelList';
import { ProviderSelector } from './ProviderSelector';
import { ProviderSettings } from './ProviderSettings';
import { SaveButton } from './SaveButton';

interface LLMProviderConfigProps {
  // Provider selection
  provider: string;
  setProvider: (provider: string) => void;
  
  // Anthropic settings
  anthropicApiKey: string;
  setAnthropicApiKey: (key: string) => void;
  anthropicBaseUrl: string;
  setAnthropicBaseUrl: (url: string) => void;
  thinkingBudgetTokens: number;
  setThinkingBudgetTokens: (tokens: number) => void;
  
  // OpenAI settings
  openaiApiKey: string;
  setOpenaiApiKey: (key: string) => void;
  openaiBaseUrl: string;
  setOpenaiBaseUrl: (url: string) => void;

  // Deepseek settings
  deepseekApiKey: string;
  setDeepseekApiKey: (key: string) => void;
  deepseekBaseUrl: string;
  setDeepseekBaseUrl: (url: string) => void;
  
  // Gemini settings
  geminiApiKey: string;
  setGeminiApiKey: (key: string) => void;
  geminiBaseUrl: string;
  setGeminiBaseUrl: (url: string) => void;
  
  // Ollama settings
  ollamaApiKey: string;
  setOllamaApiKey: (key: string) => void;
  ollamaBaseUrl: string;
  setOllamaBaseUrl: (url: string) => void;
  ollamaModelId: string;
  setOllamaModelId: (id: string) => void;
  ollamaCustomModels: OllamaModel[];
  setOllamaCustomModels: (models: OllamaModel[]) => void;
  newOllamaModel: { id: string; name: string; contextWindow: number };
  setNewOllamaModel: React.Dispatch<React.SetStateAction<{ id: string; name: string; contextWindow: number }>>;
  handleAddOllamaModel: () => void;
  handleRemoveOllamaModel: (id: string) => void;
  handleEditOllamaModel: (idx: number, field: string, value: any) => void;
  
  // OpenAI-compatible settings
  openaiCompatibleApiKey: string;
  setOpenaiCompatibleApiKey: (key: string) => void;
  openaiCompatibleBaseUrl: string;
  setOpenaiCompatibleBaseUrl: (url: string) => void;
  openaiCompatibleModelId: string;
  setOpenaiCompatibleModelId: (id: string) => void;
  openaiCompatibleModels: Model[];
  setOpenaiCompatibleModels: (models: Model[]) => void;
  newModel: { id: string; name: string; isReasoningModel: boolean };
  setNewModel: React.Dispatch<React.SetStateAction<{ id: string; name: string; isReasoningModel: boolean }>>;
  
  // Save functionality
  isSaving: boolean;
  saveStatus: string;
  handleSave: () => void;
  
  // Model operations
  handleAddModel: () => void;
  handleRemoveModel: (id: string) => void;
  handleEditModel: (idx: number, field: string, value: any) => void;
}

export function LLMProviderConfig({
  // Provider selection
  provider,
  setProvider,
  
  // Anthropic settings
  anthropicApiKey,
  setAnthropicApiKey,
  anthropicBaseUrl,
  setAnthropicBaseUrl,
  thinkingBudgetTokens,
  setThinkingBudgetTokens,
  
  // OpenAI settings
  openaiApiKey,
  setOpenaiApiKey,
  openaiBaseUrl,
  setOpenaiBaseUrl,
  // DeepSeek settings
  deepseekApiKey,
  setDeepseekApiKey,
  deepseekBaseUrl,
  setDeepseekBaseUrl,

  // Gemini settings
  geminiApiKey,
  setGeminiApiKey,
  geminiBaseUrl,
  setGeminiBaseUrl,
  
  // Ollama settings
  ollamaApiKey,
  setOllamaApiKey,
  ollamaBaseUrl,
  setOllamaBaseUrl,
  ollamaModelId,
  setOllamaModelId,
  ollamaCustomModels,
  setOllamaCustomModels,
  newOllamaModel,
  setNewOllamaModel,
  handleAddOllamaModel,
  handleRemoveOllamaModel,
  handleEditOllamaModel,
  
  // OpenAI-compatible settings
  openaiCompatibleApiKey,
  setOpenaiCompatibleApiKey,
  openaiCompatibleBaseUrl,
  setOpenaiCompatibleBaseUrl,
  openaiCompatibleModelId,
  setOpenaiCompatibleModelId,
  openaiCompatibleModels,
  setOpenaiCompatibleModels,
  newModel,
  setNewModel,
  
  // Save functionality
  isSaving,
  saveStatus,
  handleSave,
  
  // Model operations
  handleAddModel,
  handleRemoveModel,
  handleEditModel
}: LLMProviderConfigProps) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-lg border border-white/50 mb-6 overflow-hidden hover:shadow-xl transition-all duration-300">
  <div className="bg-gradient-to-r from-sky-50 to-blue-50 border-b border-sky-100 px-6 py-4">
    <h2 className="text-2xl font-bold text-gray-800 flex items-center">
      <span className="mr-3 text-3xl">🤖</span>
      LLM Provider Configuration
    </h2>
  </div>
  
  <div className="p-6 space-y-6">
    {/* Introduction Section */}
    <div className="bg-gradient-to-r from-indigo-50/50 to-purple-50/50 rounded-2xl p-4 border border-indigo-100/50">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-1">
          <div className="w-8 h-8 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <div>
          <p className="text-gray-700 leading-relaxed">
            Configure your preferred <span className="font-semibold text-indigo-700">LLM provider</span> and API settings. 
            Your API keys are stored securely in your browser's local storage and never leave your device.
          </p>
          <div className="mt-2 flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="text-sm text-gray-600">Secure</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span className="text-sm text-gray-600">Local Storage</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
              <span className="text-sm text-gray-600">No Data Sharing</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Provider Selector Section */}
    <div className="bg-gradient-to-r from-emerald-50/50 to-teal-50/50 rounded-2xl p-4 border border-emerald-100/50">
      <h3 className="text-lg font-semibold text-emerald-700 mb-3 flex items-center">
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
        Choose Provider
      </h3>
      <div className="bg-white/70 backdrop-blur-sm rounded-xl p-3 border border-white/50">
        <ProviderSelector provider={provider} setProvider={setProvider} />
      </div>
    </div>
    
    {/* Provider Settings Section */}
    <div className="bg-gradient-to-r from-sky-50/50 to-cyan-50/50 rounded-2xl p-4 border border-sky-100/50">
      <h3 className="text-lg font-semibold text-sky-700 mb-3 flex items-center">
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Configuration Settings
      </h3>
      <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-white/50">
        <ProviderSettings
          provider={provider}
          // Anthropic
          anthropicApiKey={anthropicApiKey}
          setAnthropicApiKey={setAnthropicApiKey}
          anthropicBaseUrl={anthropicBaseUrl}
          setAnthropicBaseUrl={setAnthropicBaseUrl}
          thinkingBudgetTokens={thinkingBudgetTokens}
          setThinkingBudgetTokens={setThinkingBudgetTokens}
          // OpenAI
          openaiApiKey={openaiApiKey}
          setOpenaiApiKey={setOpenaiApiKey}
          openaiBaseUrl={openaiBaseUrl}
          setOpenaiBaseUrl={setOpenaiBaseUrl}
          // Deepseek
          deepseekApiKey={deepseekApiKey}
          setDeepseekApiKey={setDeepseekApiKey}
          deepseekBaseUrl={deepseekBaseUrl}
          setDeepseekBaseUrl={setDeepseekBaseUrl}
          // Gemini
          geminiApiKey={geminiApiKey}
          setGeminiApiKey={setGeminiApiKey}
          geminiBaseUrl={geminiBaseUrl}
          setGeminiBaseUrl={setGeminiBaseUrl}
          // Ollama
          ollamaApiKey={ollamaApiKey}
          setOllamaApiKey={setOllamaApiKey}
          ollamaBaseUrl={ollamaBaseUrl}
          setOllamaBaseUrl={setOllamaBaseUrl}
          ollamaModelId={ollamaModelId}
          setOllamaModelId={setOllamaModelId}
          ollamaCustomModels={ollamaCustomModels}
          setOllamaCustomModels={setOllamaCustomModels}
          newOllamaModel={newOllamaModel}
          setNewOllamaModel={setNewOllamaModel}
          handleAddOllamaModel={handleAddOllamaModel}
          handleRemoveOllamaModel={handleRemoveOllamaModel}
          handleEditOllamaModel={handleEditOllamaModel}
          // OpenAI-compatible
          openaiCompatibleApiKey={openaiCompatibleApiKey}
          setOpenaiCompatibleApiKey={setOpenaiCompatibleApiKey}
          openaiCompatibleBaseUrl={openaiCompatibleBaseUrl}
          setOpenaiCompatibleBaseUrl={setOpenaiCompatibleBaseUrl}
          openaiCompatibleModelId={openaiCompatibleModelId}
          setOpenaiCompatibleModelId={setOpenaiCompatibleModelId}
          openaiCompatibleModels={openaiCompatibleModels}
          setOpenaiCompatibleModels={setOpenaiCompatibleModels}
          newModel={newModel}
          setNewModel={setNewModel}
          handleAddModel={handleAddModel}
          handleRemoveModel={handleRemoveModel}
          handleEditModel={handleEditModel}
        />
      </div>
    </div>
    
    {/* Save Button Section */}
    <div className="bg-gradient-to-r from-green-50/50 to-emerald-50/50 rounded-2xl p-4 border border-green-100/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-green-700">Save Configuration</h3>
            <p className="text-sm text-green-600">Apply your settings and start using the extension</p>
          </div>
        </div>
        <div className="ml-4">
          <SaveButton 
            isSaving={isSaving}
            saveStatus={saveStatus}
            handleSave={handleSave}
            isDisabled={
              (provider === 'anthropic' && !anthropicApiKey.trim()) ||
              (provider === 'openai' && !openaiApiKey.trim()) ||
              (provider === 'deepseek' && !deepseekApiKey.trim()) ||
              (provider === 'gemini' && !geminiApiKey.trim())
            }
          />
        </div>
      </div>
    </div>
  </div>
</div>
  );
}
