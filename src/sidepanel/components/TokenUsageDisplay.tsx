import { faArrowUp, faArrowDown } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useEffect, useState } from 'react';
import { ConfigManager, ProviderConfig } from '../../background/configManager';
import { TokenTrackingService, TokenUsage } from '../../tracking/tokenTrackingService';

// Helper function to format token counts
const formatTokenCount = (count: number): string => {
  if (count < 1000) {
    return count.toString();
  }
  return (count / 1000).toFixed(1) + 'k';
};

export function TokenUsageDisplay({ compact = false }: { compact?: boolean }) {
  const [usage, setUsage] = useState<TokenUsage>({ inputTokens: 0, outputTokens: 0, cost: 0 });
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Get instances
    const tokenTracker = TokenTrackingService.getInstance();
    const configManager = ConfigManager.getInstance();

    // Get initial usage
    const initialUsage = tokenTracker.getUsage();
    setUsage(initialUsage);

    // Subscribe to local updates
    const unsubscribe = tokenTracker.subscribe(() => {
      const updatedUsage = tokenTracker.getUsage();
      setUsage(updatedUsage);
    });

    // Get provider configuration and update token tracker
    configManager.getProviderConfig().then(config => {
      setProviderConfig(config);
      // Update token tracker with current provider and model
      tokenTracker.updateProviderAndModel(config.provider, config.apiModelId || '');
    });

    // Listen for messages from the background script
    const messageListener = (message: any) => {
      if (message.action === 'tokenUsageUpdated' && message.content) {
        setUsage(message.content);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Request current usage from background script
    chrome.runtime.sendMessage({ action: 'getTokenUsage' });

    return () => {
      unsubscribe();
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  // const totalTokens = usage.inputTokens + usage.outputTokens;

  // Format provider name for display
  // const formatProviderName = (provider: string) => {
  //   switch (provider) {
  //     case 'anthropic': return 'Anthropic';
  //     case 'openai': return 'OpenAI';
  //     case 'gemini': return 'Google';
  //     case 'ollama': return 'Ollama';
  //     default: return provider;
  //   }
  // };

  // // Format model name for display
  // const formatModelName = (modelId: string) => {
  //   // Extract the model name from the model ID
  //   if (modelId.includes('claude')) {
  //     // For Claude models, extract the version and variant
  //     const match = modelId.match(/claude-(\d+\.\d+)-(\w+)/);
  //     if (match) {
  //       return `Claude ${match[1]} ${match[2].charAt(0).toUpperCase() + match[2].slice(1)}`;
  //     }
  //     return modelId;
  //   } else if (modelId.includes('gpt')) {
  //     // For GPT models, capitalize and format
  //     return modelId.toUpperCase().replace(/-/g, ' ');
  //   } else if (modelId.includes('gemini')) {
  //     // For Gemini models, capitalize and format
  //     const parts = modelId.split('-');
  //     return `Gemini ${parts[1]} ${parts[2].charAt(0).toUpperCase() + parts[2].slice(1)}`;
  //   } else if (modelId.includes('llama')) {
  //     // For Llama models, capitalize and format
  //     return `Llama ${modelId.replace('llama', '')}`;
  //   } else if (modelId.includes('Qwen')) {
  //     // For Qwen models, format nicely
  //     return modelId.replace('-Instruct', '');
  //   }
  //   return modelId;
  // };

  if (compact) {
    return (
      <div className="relative shrink-0"><button type="button" onClick={() => setShowDetails(value => !value)} className="rounded-md px-1.5 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-100" title="View token and cost details">
        ${usage.cost.toFixed(4)} · {formatTokenCount(usage.inputTokens + usage.outputTokens)} tokens
      </button>{showDetails && <div className="absolute bottom-full right-0 z-[80] mb-2 w-48 rounded-lg border border-stone-200 bg-white p-3 text-xs text-stone-700 shadow-lg"><div className="mb-2 font-semibold text-stone-900">Usage details</div><div className="flex justify-between"><span>Input</span><span>{formatTokenCount(usage.inputTokens)}</span></div><div className="mt-1 flex justify-between"><span>Output</span><span>{formatTokenCount(usage.outputTokens)}</span></div><div className="mt-1 flex justify-between"><span>Model</span><span className="max-w-[100px] truncate">{providerConfig?.apiModelId || 'Current model'}</span></div><div className="mt-2 flex justify-between border-t border-stone-100 pt-2 font-semibold"><span>Estimated cost</span><span>${usage.cost.toFixed(6)}</span></div></div>}</div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-stone-200 bg-[#eeeee9] p-3 text-xs text-stone-700">
      <div className="flex justify-between items-center">
        <span className="font-medium">Token Usage:</span>
        <span><FontAwesomeIcon icon={faArrowUp} /> {formatTokenCount(usage.inputTokens)} <FontAwesomeIcon icon={faArrowDown} /> {formatTokenCount(usage.outputTokens)}</span>
      </div>
      <div className="flex justify-between mt-1">
        <span className="font-medium">Estimated Cost:</span>
        <span>${usage.cost.toFixed(6)}</span>
      </div>
    </div>
  );
}
