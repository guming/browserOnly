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

  // Notion settings
  notionEnabled: boolean;
  setNotionEnabled: (enabled: boolean) => void;
  notionMcpServerUrl: string;
  setNotionMcpServerUrl: (url: string) => void;
  notionBearerToken: string;
  setNotionBearerToken: (token: string) => void;
  notionDatabaseId: string;
  setNotionDatabaseId: (databaseId: string) => void;

  // DuckDB settings
  duckdbEnabled: boolean;
  setDuckdbEnabled: (enabled: boolean) => void;
  duckdbConnectionString: string;
  setDuckdbConnectionString: (connectionString: string) => void;
  duckdbDatabasePath: string;
  setDuckdbDatabasePath: (databasePath: string) => void;
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
        return <ConnectionTab
          notionEnabled={props.notionEnabled}
          setNotionEnabled={props.setNotionEnabled}
          notionBearerToken={props.notionBearerToken}
          setNotionBearerToken={props.setNotionBearerToken}
          notionDatabaseId={props.notionDatabaseId}
          setNotionDatabaseId={props.setNotionDatabaseId}
          duckdbEnabled={props.duckdbEnabled}
          setDuckdbEnabled={props.setDuckdbEnabled}
          duckdbConnectionString={props.duckdbConnectionString}
          setDuckdbConnectionString={props.setDuckdbConnectionString}
          duckdbDatabasePath={props.duckdbDatabasePath}
          setDuckdbDatabasePath={props.setDuckdbDatabasePath}
        />;
      case 'memory':
        return <MemoryTab />;
      default:
        return <GeneralTab />;
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
  {/* 完全移除动态背景和装饰元素 */}
  
  {/* Left Sidebar - 纯色设计 */}
  <div className="w-64 bg-white border-r border-gray-200">
    <div className="p-6">
      {/* 简化的Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-blue-600 flex items-center justify-center">
          <span className="text-2xl">🤖</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">BrowserOnly</h1>
          <div className="text-sm text-blue-600">Configuration</div>
        </div>
      </div>
      
      {/* 简化的垂直导航 */}
      <div className="space-y-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`w-full flex items-center gap-4 px-4 py-3 font-medium ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100 hover:text-gray-900 border border-gray-200'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="text-xl">
              {tab.icon}
            </span>
            <span className="font-semibold">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  </div>

  {/* Right Content Area - 简化卡片设计 */}
  <div className="flex-1 p-6 overflow-auto">
    <div className="bg-white border border-gray-200 h-full overflow-auto">
      <div className="p-8">
        {renderTabContent()}
      </div>
    </div>
  </div>
</div>
  );
}
