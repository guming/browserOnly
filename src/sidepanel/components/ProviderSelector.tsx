import { faCog, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useState } from 'react';
import { ConfigManager } from '../../background/configManager';
import { TokenTrackingService } from '../../tracking/tokenTrackingService';

interface ProviderOption {
  provider: string;
  displayName: string;
  models: {id: string, name: string}[];
}

interface ProviderSelectorProps {
  isProcessing: boolean;
}

export function ProviderSelector({ isProcessing }: ProviderSelectorProps) {
  const [options, setOptions] = useState<ProviderOption[]>([]);
  const [currentProvider, setCurrentProvider] = useState<string>('');
  const [currentModel, setCurrentModel] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  
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
  
  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const [provider, modelId] = value.split('|');
    
    if (provider && modelId) {
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
  
  if (isLoading || options.length === 0) {
    return null;
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
