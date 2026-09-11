import React from 'react';
import { OllamaModelList, OllamaModel } from './OllamaModelList';
import { DEFAULT_OLLAMA_BASE_URL } from '../../models/providers/ollama';

interface OllamaSettingsProps {
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
}

export function OllamaSettings({
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
  handleEditOllamaModel
}: OllamaSettingsProps) {
  const [isDiscovering, setIsDiscovering] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState('');

  const discoverModels = async () => {
    setIsDiscovering(true);
    setConnectionStatus('');
    try {
      const response = await fetch(`${(ollamaBaseUrl || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, '')}/api/tags`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as { models?: Array<{ name: string }> };
      const discovered = (data.models || []).map(model => ({
        id: model.name,
        name: model.name,
        contextWindow: 32768,
      }));
      const merged = [...ollamaCustomModels];
      discovered.forEach(model => {
        if (!merged.some(existing => existing.id === model.id)) merged.push(model);
      });
      setOllamaCustomModels(merged);
      if (!ollamaModelId && merged[0]) setOllamaModelId(merged[0].id);
      await chrome.storage.sync.set({ ollamaCustomModels: merged });
      if (!ollamaModelId && merged[0]) await chrome.storage.sync.set({ ollamaModelId: merged[0].id });
      await chrome.runtime.sendMessage({ action: 'providerConfigChanged' }).catch(() => undefined);
      if (discovered.length === 0) setConnectionStatus('Connected, but no local models were found.');
      else setConnectionStatus(`Connected. Found ${discovered.length} local model${discovered.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setConnectionStatus(`Unable to connect to Ollama. Check that it is running and allows this extension origin.`);
    } finally {
      setIsDiscovering(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 mb-4">
      <h3 className="font-bold mb-2">Ollama Settings</h3>
      
      <div className="form-control mb-4">
        <label htmlFor="ollama-api-key" className="label">
          <span className="label-text">API Key (optional):</span>
        </label>
        <input
          type="password"
          id="ollama-api-key"
          value={ollamaApiKey}
          onChange={(e) => setOllamaApiKey(e.target.value)}
          placeholder="Enter your Ollama API key if required"
          className="input input-bordered w-full"
        />
        <label className="label">
          <span className="label-text-alt">Ollama typically doesn't require an API key</span>
        </label>
      </div>
      
      <div className="form-control mb-4">
        <label htmlFor="ollama-base-url" className="label">
          <span className="label-text">Base URL:</span>
        </label>
        <input
          type="text"
          id="ollama-base-url"
          value={ollamaBaseUrl}
          onChange={(e) => {
            const newValue = e.target.value;
            setOllamaBaseUrl(newValue);
            // Save the base URL immediately to trigger the provider selector update
            chrome.storage.sync.set({ ollamaBaseUrl: newValue });
          }}
          placeholder={DEFAULT_OLLAMA_BASE_URL}
          className="input input-bordered w-full"
        />
        <span className="label-text-alt">
          Local default: <code>{DEFAULT_OLLAMA_BASE_URL}</code>. Ollama must allow this extension origin through <code>OLLAMA_ORIGINS</code>.
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-outline btn-sm" onClick={discoverModels} disabled={isDiscovering}>
          {isDiscovering ? <span className="loading loading-spinner loading-xs" /> : null}
          {isDiscovering ? 'Checking Ollama...' : 'Detect Local Models'}
        </button>
        {connectionStatus && <span className="text-xs text-stone-500">{connectionStatus}</span>}
      </div>
      
      {ollamaCustomModels.length === 0 && (
        <div className="alert alert-info mb-4">
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <span>You need to add at least one Ollama model below before you can use Ollama as a provider.</span>
          </div>
        </div>
      )}
      
      <OllamaModelList
        models={ollamaCustomModels}
        setModels={setOllamaCustomModels}
        newModel={newOllamaModel}
        setNewModel={setNewOllamaModel}
        handleAddModel={handleAddOllamaModel}
        handleRemoveModel={handleRemoveOllamaModel}
        handleEditModel={handleEditOllamaModel}
      />
    </div>
  );
}
