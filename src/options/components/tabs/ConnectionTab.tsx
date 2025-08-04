import React, { useState } from 'react';

export function ConnectionTab() {
  const [connectionType, setConnectionType] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [connectionUrl, setConnectionUrl] = useState('');

  return (
    <div className="space-y-6">
      <div className="card bg-base-100 shadow-md">
        <div className="card-body">
          <h2 className="card-title text-xl">🔗 Connection Settings</h2>
          <p className="mb-4">
            Configure connection settings for BrowserOnly.
          </p>
          
          {/* Connection Settings Content */}
          <div className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">Connection Type</span>
              </label>
              <select className="select select-bordered" value={connectionType} onChange={(e) => setConnectionType(e.target.value)}>
                <option value="notion">Notion</option>
                <option value="duckdb">DuckDB</option>
                <option value="calendar">Google Calendar</option>
                <option value="sheet">Google Sheet</option>
              </select>
            </div>

            
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">Endpoint URL</span>
              </label>
              <input
                type="url"
                id="connection-url"
                value={connectionUrl}
                onChange={(e) => setConnectionUrl(e.target.value)}
                placeholder="https://api.example.com"
                className="input input-bordered"
              />
            </div>
            
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">API Key</span>
              </label>
              <input
                id="connection-key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type="password"
                placeholder="Enter your API key"
                className="input input-bordered"
              />
            </div>
          </div>
          {/* Save Button */}
          <div className="card-actions justify-end mt-6">
            <button className="btn btn-primary">
              Save Connection Settings
            </button>
          </div>

        </div>
      </div>
      
    </div>
  );
}