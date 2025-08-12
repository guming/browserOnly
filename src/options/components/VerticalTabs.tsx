import React, { useState } from 'react';
import { GeneralTab } from './tabs/GeneralTab';
import { ProvidersTab } from './tabs/ProvidersTab';
import { MemoryTab } from './tabs/MemoryTab';
import { ConnectionTab } from './tabs/ConnectionTab';
import { Model } from './ModelList';
import { OllamaModel } from './OllamaModelList';

interface VerticalTabsProps {
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

  // DeepSeek settings
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
  
  // Pricing data
  getModelPricingData: () => any[];
}

export function VerticalTabs(props: VerticalTabsProps) {
  const [activeTab, setActiveTab] = useState('general');

  const tabs = [
    { id: 'general', label: 'General', icon: '🏠' },
    { id: 'providers', label: 'LLM Configuration', icon: '🤖' },
    { id: 'connection', label: 'Connection', icon: '🔗' },
    { id: 'memory', label: 'Memory', icon: '🧠' },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralTab />;
      case 'providers':
        return (
          <ProvidersTab
            provider={props.provider}
            setProvider={props.setProvider}
            anthropicApiKey={props.anthropicApiKey}
            setAnthropicApiKey={props.setAnthropicApiKey}
            anthropicBaseUrl={props.anthropicBaseUrl}
            setAnthropicBaseUrl={props.setAnthropicBaseUrl}
            thinkingBudgetTokens={props.thinkingBudgetTokens}
            setThinkingBudgetTokens={props.setThinkingBudgetTokens}
            openaiApiKey={props.openaiApiKey}
            setOpenaiApiKey={props.setOpenaiApiKey}
            openaiBaseUrl={props.openaiBaseUrl}
            setOpenaiBaseUrl={props.setOpenaiBaseUrl}
            deepseekApiKey={props.deepseekApiKey}
            setDeepseekApiKey={props.setDeepseekApiKey}
            deepseekBaseUrl={props.deepseekBaseUrl}
            setDeepseekBaseUrl={props.setDeepseekBaseUrl}
            geminiApiKey={props.geminiApiKey}
            setGeminiApiKey={props.setGeminiApiKey}
            geminiBaseUrl={props.geminiBaseUrl}
            setGeminiBaseUrl={props.setGeminiBaseUrl}
            ollamaApiKey={props.ollamaApiKey}
            setOllamaApiKey={props.setOllamaApiKey}
            ollamaBaseUrl={props.ollamaBaseUrl}
            setOllamaBaseUrl={props.setOllamaBaseUrl}
            ollamaModelId={props.ollamaModelId}
            setOllamaModelId={props.setOllamaModelId}
            ollamaCustomModels={props.ollamaCustomModels}
            setOllamaCustomModels={props.setOllamaCustomModels}
            newOllamaModel={props.newOllamaModel}
            setNewOllamaModel={props.setNewOllamaModel}
            handleAddOllamaModel={props.handleAddOllamaModel}
            handleRemoveOllamaModel={props.handleRemoveOllamaModel}
            handleEditOllamaModel={props.handleEditOllamaModel}
            openaiCompatibleApiKey={props.openaiCompatibleApiKey}
            setOpenaiCompatibleApiKey={props.setOpenaiCompatibleApiKey}
            openaiCompatibleBaseUrl={props.openaiCompatibleBaseUrl}
            setOpenaiCompatibleBaseUrl={props.setOpenaiCompatibleBaseUrl}
            openaiCompatibleModelId={props.openaiCompatibleModelId}
            setOpenaiCompatibleModelId={props.setOpenaiCompatibleModelId}
            openaiCompatibleModels={props.openaiCompatibleModels}
            setOpenaiCompatibleModels={props.setOpenaiCompatibleModels}
            newModel={props.newModel}
            setNewModel={props.setNewModel}
            isSaving={props.isSaving}
            saveStatus={props.saveStatus}
            handleSave={props.handleSave}
            handleAddModel={props.handleAddModel}
            handleRemoveModel={props.handleRemoveModel}
            handleEditModel={props.handleEditModel}
            getModelPricingData={props.getModelPricingData}
          />
        );
      case 'connection':
        return <ConnectionTab />;
      case 'memory':
        return <MemoryTab />;
      default:
        return <GeneralTab />;
    }
  };

  return (
    <div className="flex min-h-screen relative overflow-hidden bg-gradient-to-br from-sky-50 to-blue-100">
  {/* Bright Animated Background */}
  <div className="absolute inset-0 bg-gradient-to-br from-sky-300 via-blue-300 to-indigo-300 opacity-40 transition-all duration-1000">
    <div className="absolute inset-0 bg-gradient-to-t from-white/30 to-transparent"></div>
    {/* Floating shapes for visual interest */}
    <div className="absolute top-10 left-10 w-32 h-32 bg-white/20 rounded-full blur-xl animate-pulse"></div>
    <div className="absolute bottom-20 right-10 w-24 h-24 bg-sky-200/30 rounded-full blur-lg animate-bounce"></div>
    <div className="absolute top-1/3 right-1/4 w-16 h-16 bg-blue-200/20 rounded-full blur-md animate-ping"></div>
  </div>

  {/* Left Sidebar - Modern Glassmorphism */}
  <div className="relative z-10 w-64 bg-white/80 backdrop-blur-sm shadow-2xl border-r border-white/50">
    <div className="p-6">
      {/* Modern Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg flex items-center justify-center transform hover:scale-105 transition-transform duration-200">
          <span className="text-2xl">🤖</span>
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-800 tracking-tight">BrowserOnly</h1>
          <div className="text-xs text-sky-600 font-semibold">Configuration</div>
        </div>
      </div>
      
      {/* Modern Vertical Navigation */}
      <div className="space-y-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl font-medium transition-all duration-300 transform hover:scale-[1.02] ${
              activeTab === tab.id 
                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/25' 
                : 'bg-white/50 backdrop-blur-sm text-gray-700 hover:bg-white/70 hover:text-gray-900 shadow-md border border-white/30'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className={`text-xl ${activeTab === tab.id ? 'animate-pulse' : ''}`}>
              {tab.icon}
            </span>
            <span className="font-semibold">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  </div>

  {/* Right Content Area - Modern Card Design */}
  <div className="relative z-10 flex-1 p-6 overflow-auto">
    <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/50 h-full overflow-auto">
      <div className="p-8">
        {renderTabContent()}
      </div>
    </div>
  </div>

  {/* Bright Floating Elements */}
  <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
    <div className="absolute top-16 left-80 w-3 h-3 bg-sky-400/60 rounded-full animate-bounce"></div>
    <div className="absolute top-32 right-24 w-2 h-2 bg-blue-400/50 rounded-full animate-ping"></div>
    <div className="absolute bottom-32 left-80 w-4 h-4 bg-indigo-300/40 rounded-full animate-pulse"></div>
    <div className="absolute bottom-16 right-16 w-2.5 h-2.5 bg-sky-300/60 rounded-full animate-bounce" style={{animationDelay: '1s'}}></div>
  </div>
</div>
  );
}
