import { faCog, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useRef, useState } from 'react';
import { ConfigManager } from '../../background/configManager';
import { TokenTrackingService } from '../../tracking/tokenTrackingService';

interface ProviderOption {
  provider: string;
  displayName: string;
  models: {id: string, name: string}[];
}

interface ProviderSelectorProps {
  isProcessing: boolean;
  compact?: boolean;
}

export function ProviderSelector({ isProcessing, compact = false }: ProviderSelectorProps) {
  const [options, setOptions] = useState<ProviderOption[]>([]);
  const [currentProvider, setCurrentProvider] = useState<string>('');
  const [currentModel, setCurrentModel] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isModelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isModelMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!modelMenuRef.current?.contains(event.target as Node)) setModelMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModelMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isModelMenuOpen]);
  
  // Function to load provider options
  const loadOptions = async () => {
    setIsLoading(true);
    const configManager = ConfigManager.getInstance();
    
    // Get current config
    const config = await configManager.getProviderConfig();
    setCurrentProvider(config.provider);
    setCurrentModel(config.apiModelId || '');
    
    // Get configured providers
    const providers = await configManager.getConfiguredProviders();
    
    // Build options
    const providerOptions: ProviderOption[] = [];
    
    for (const provider of providers) {
      const models = await configManager.getModelsForProvider(provider);
      
      providerOptions.push({
        provider,
        displayName: formatProviderName(provider),
        models,
      });
    }
    
    setOptions(providerOptions);
    setIsLoading(false);
  };
  
  // Load options when component mounts
  useEffect(() => {
    loadOptions();
  }, []);
  
  // Listen for provider configuration changes
  useEffect(() => {
    const handleMessage = (message: any) => {
      if (message.action === 'providerConfigChanged') {
        console.log('Provider configuration changed, refreshing options');
        loadOptions();
      }
    };
    
    // Add the message listener
    chrome.runtime.onMessage.addListener(handleMessage);
    
    // Clean up the listener when the component unmounts
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);
  
  const formatProviderName = (provider: string) => {
    switch (provider) {
      case 'anthropic': return 'Anthropic';
      case 'openai': return 'OpenAI';
      case 'gemini': return 'Google';
      case 'ollama': return 'Ollama';
      case 'openai-compatible': return 'OpenAI Compatible';
      default: return provider;
    }
  };
  
  const selectModel = async (provider: string, modelId: string) => {
    if (provider && modelId) {
      setModelMenuOpen(false);
      setCurrentProvider(provider);
      setCurrentModel(modelId);
      
      // Update config
      const configManager = ConfigManager.getInstance();
      await configManager.updateProviderAndModel(provider, modelId);
      
      // Update token tracking service with new provider and model
      const tokenTracker = TokenTrackingService.getInstance();
      tokenTracker.updateProviderAndModel(provider, modelId);
      
      // Clear message history to ensure a clean state with the new provider
      try {
        await chrome.runtime.sendMessage({
          action: 'clearHistory'
        });
        
        // Show a message to the user
        chrome.runtime.sendMessage({
          action: 'updateOutput',
          content: {
            type: 'system',
            content: `Switched to ${formatProviderName(provider)} model: ${modelId}`
          }
        });
      } catch (error) {
        console.error('Error clearing history:', error);
      }
      
      // Reload the page to apply changes
      window.location.reload();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [provider, modelId] = e.target.value.split('|');
    void selectModel(provider, modelId);
  };
  
  if (isLoading || options.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          aria-label="Open Settings"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-600 transition-colors duration-150 hover:border-stone-500 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => chrome.runtime.openOptionsPage()}
          title="Open Settings"
          disabled={isProcessing}
        >
          <FontAwesomeIcon icon={faCog} className="text-xs" />
        </button>
        <div className="relative min-w-0" ref={modelMenuRef}>
          <button type="button" aria-label="Model" aria-expanded={isModelMenuOpen} aria-haspopup="listbox" disabled={isProcessing} onClick={() => setModelMenuOpen(value => !value)} className="flex h-7 max-w-[210px] min-w-0 items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2 text-xs font-medium text-stone-700 hover:border-stone-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#315a78] disabled:opacity-50">
            <span className="truncate">{options.find(option => option.provider === currentProvider)?.models.find(model => model.id === currentModel)?.name || currentModel}</span>
            {currentProvider === 'ollama' && <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Local</span>}
            <span aria-hidden="true" className="shrink-0 text-stone-400">⌄</span>
          </button>
          {isModelMenuOpen && <div role="listbox" aria-label="Available models" className="absolute bottom-full left-0 z-50 mb-1 max-h-64 min-w-48 overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
            {options.flatMap(option => option.models.map(model => <button type="button" role="option" aria-selected={option.provider === currentProvider && model.id === currentModel} key={`${option.provider}|${model.id}`} onClick={() => void selectModel(option.provider, model.id)} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-stone-700 hover:bg-stone-100 aria-selected:bg-[#eaf2f7]">
              <span className="min-w-0 flex-1 truncate">{model.name}</span>
              {option.provider === 'ollama' && <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Local</span>}
            </button>))}
          </div>}
        </div>
      </div>
    );
  }
  
  // Function to open options page in a new tab
  const openOptionsPage = () => {
    chrome.runtime.openOptionsPage();
  };
  
  // Function to open help documentation
  const openHelpPage = () => {
    window.open('https://github.com/guming/BrowserOnly/', '_blank');
  };

  return (
    <div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
    <button
      className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-600 transition-colors duration-150 hover:border-stone-500 hover:text-stone-900"
      onClick={openOptionsPage}
      title="Open Settings"
      disabled={isProcessing}
    >
      <FontAwesomeIcon icon={faCog} className="text-sm" />
    </button>
    
    <select
      className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 outline-none transition-colors duration-150 hover:border-stone-500 focus:border-[#315a78] focus:ring-2 focus:ring-[#315a78]/10"
      value={`${currentProvider}|${currentModel}`}
      onChange={handleChange}
      disabled={isProcessing}
      style={{ minWidth: '200px' }}
    >
      {options.map(option => (
        option.models.map(model => (
          <option
            key={`${option.provider}|${model.id}`}
            value={`${option.provider}|${model.id}`}
            className="bg-white text-gray-700"
          >
            {option.displayName} - {model.name}
          </option>
        ))
      ))}
    </select>
  </div>
  
  <button
    className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-600 transition-colors duration-150 hover:border-stone-500 hover:text-stone-900"
    onClick={openHelpPage}
    title="Open Help"
    disabled={isProcessing}
  >
    <FontAwesomeIcon icon={faCircleInfo} className="text-sm" />
  </button>
</div>
  );
}
