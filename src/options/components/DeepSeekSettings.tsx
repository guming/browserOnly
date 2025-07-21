import React from 'react';

interface DeepSeekSettingsProps {
  deepseekApiKey: string;
  setDeepseekApiKey: (key: string) => void;
  deepseekBaseUrl: string;
  setDeepseekBaseUrl: (url: string) => void;
}

export function DeepSeekSettings({
  deepseekApiKey,
  setDeepseekApiKey,
  deepseekBaseUrl,
  setDeepseekBaseUrl
}: DeepSeekSettingsProps) {
  return (
    <div className="border rounded-lg p-4 mb-4">
      <h3 className="font-bold mb-2">DeepSeek Settings</h3>
      
      <div className="form-control mb-4">
        <label htmlFor="deepseek-api-key" className="label">
          <span className="label-text">API Key:</span>
        </label>
        <input
          type="password"
          id="deepseek-api-key"
          value={deepseekApiKey}
          onChange={(e) => setDeepseekApiKey(e.target.value)}
          placeholder="Enter your DeepSeek API key"
          className="input input-bordered w-full"
        />
      </div>
      
      <div className="form-control mb-4">
        <label htmlFor="deepseek-base-url" className="label">
          <span className="label-text">Base URL (optional):</span>
        </label>
        <input
          type="text"
          id="deepseek-base-url"
          value={deepseekBaseUrl}
          onChange={(e) => setDeepseekBaseUrl(e.target.value)}
          placeholder="Custom base URL (leave empty for default)"
          className="input input-bordered w-full"
        />
      </div>
    </div>
  );
}