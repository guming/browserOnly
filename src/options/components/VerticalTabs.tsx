import React, { useState } from 'react';
import { GeneralTab } from './tabs/GeneralTab';
import { ProvidersTab } from './tabs/ProvidersTab';
import { MemoryTab } from './tabs/MemoryTab';
import { ConnectionTab } from './tabs/ConnectionTab';
import { FeaturesTab } from './tabs/FeaturesTab';
import { Model } from './ModelList';
import { OllamaModel } from './OllamaModelList';

interface VerticalTabsProps {
  // Provider selection
  provider: string;
  setProvider: (provider: string) => void;
  translationProvider: string;
  setTranslationProvider: (provider: string) => void;
  
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

  // PDF Viewer settings
  pdfInterceptorEnabled: boolean;
  setPdfInterceptorEnabled: (enabled: boolean) => void;
}

export function VerticalTabs(props: VerticalTabsProps) {
  const [activeTab, setActiveTab] = useState('general');

  const tabs = [
    { id: 'general', label: 'General', icon: '01' },
    { id: 'providers', label: 'LLM Configuration', icon: '02' },
    { id: 'features', label: 'Features', icon: '03' },
    { id: 'connection', label: 'Connection', icon: '04' },
    { id: 'memory', label: 'Memory', icon: '05' },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralTab onOpenConfiguration={() => setActiveTab('providers')} />;
      case 'providers':
        return (
          <ProvidersTab
            provider={props.provider}
            setProvider={props.setProvider}
            translationProvider={props.translationProvider}
            setTranslationProvider={props.setTranslationProvider}
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
      case 'features':
        return <FeaturesTab
          pdfInterceptorEnabled={props.pdfInterceptorEnabled}
          setPdfInterceptorEnabled={props.setPdfInterceptorEnabled}
        />;
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
    <div className="options-page flex min-h-screen bg-[#eef1f3] text-stone-900">
  {/* 完全移除动态背景和装饰元素 */}
  
  {/* Left Sidebar - 纯色设计 */}
  <div className="options-sidebar w-64 shrink-0 border-r border-stone-200 bg-[#f4f6f7]">
    <div className="p-6">
      {/* 简化的Header */}
      <div className="mb-12 flex items-center gap-3">
        <div className="brand-mark flex h-10 w-10 items-center justify-center rounded-lg bg-[#315a78] text-white">
          <span aria-hidden="true">B</span>
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-stone-900">BrowserOnly</h1>
          <div className="text-xs text-stone-500">Extension settings</div>
        </div>
      </div>
      
      {/* 简化的垂直导航 */}
      <div className="space-y-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`settings-nav-item flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-[#315a78] text-white shadow-sm'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="nav-index">
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  </div>

  {/* Right Content Area - 简化卡片设计 */}
  <div className="options-content min-w-0 flex-1 overflow-auto p-4 sm:p-8">
    <div className="h-full overflow-auto rounded-xl border border-stone-200 bg-white">
      <div className="mx-auto max-w-5xl p-6 sm:p-12">
        {renderTabContent()}
      </div>
    </div>
  </div>
</div>
  );
}
