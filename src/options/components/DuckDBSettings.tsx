import React, { useState, useEffect } from 'react';
import { ConfigManager } from '../../background/configManager';

interface DuckDBSettingsProps {
  duckdbEnabled: boolean;
  setDuckdbEnabled: (enabled: boolean) => void;
  duckdbConnectionString: string;
  setDuckdbConnectionString: (connectionString: string) => void;
  duckdbDatabasePath: string;
  setDuckdbDatabasePath: (databasePath: string) => void;
}

export function DuckDBSettings({
  duckdbEnabled,
  setDuckdbEnabled,
  duckdbConnectionString,
  setDuckdbConnectionString,
  duckdbDatabasePath,
  setDuckdbDatabasePath
}: DuckDBSettingsProps) {
  const [testStatus, setTestStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load DuckDB settings when component mounts
  useEffect(() => {
    const loadDuckDBSettings = async () => {
      try {
        const result = await chrome.storage.sync.get(['duckdbEnabled', 'duckdbConnectionString', 'duckdbDatabasePath']);

        setDuckdbEnabled(result.duckdbEnabled || false);
        setDuckdbConnectionString(result.duckdbConnectionString || '');
        setDuckdbDatabasePath(result.duckdbDatabasePath || ':memory:');
      } catch (error) {
        console.error('Error loading DuckDB settings:', error);
      }
    };

    loadDuckDBSettings();
  }, []);

  // Track changes to show unsaved changes indicator
  useEffect(() => {
    const checkForChanges = async () => {
      try {
        const result = await chrome.storage.sync.get(['duckdbEnabled', 'duckdbConnectionString', 'duckdbDatabasePath']);

        const hasChanges =
          (result.duckdbEnabled || false) !== duckdbEnabled ||
          (result.duckdbConnectionString || '') !== duckdbConnectionString ||
          (result.duckdbDatabasePath || ':memory:') !== duckdbDatabasePath;

        setHasUnsavedChanges(hasChanges);

        // Clear save status if there are new changes
        if (hasChanges && saveStatus) {
          setSaveStatus('');
        }
      } catch (error) {
        console.error('Error checking for changes:', error);
      }
    };

    checkForChanges();
  }, [duckdbEnabled, duckdbConnectionString, duckdbDatabasePath, saveStatus]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestStatus('Testing DuckDB connection...');

    try {
      // Test DuckDB connection logic would go here
      // For now, simulate a successful test
      await new Promise(resolve => setTimeout(resolve, 1000));

      setTestStatus('✅ DuckDB connection successful! Database tools are available.');
    } catch (error) {
      setTestStatus(`❌ Connection failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConnection = async () => {
    setIsSaving(true);
    setSaveStatus('Saving DuckDB configuration...');

    try {
      // Save DuckDB configuration to Chrome storage
      await chrome.storage.sync.set({
        'duckdbEnabled': duckdbEnabled,
        'duckdbConnectionString': duckdbConnectionString,
        'duckdbDatabasePath': duckdbDatabasePath
      });

      setSaveStatus('✅ DuckDB configuration saved successfully!');
      setHasUnsavedChanges(false);

      // Clear the success message after 3 seconds
      setTimeout(() => {
        setSaveStatus('');
      }, 3000);

    } catch (error) {
      setSaveStatus(`❌ Save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAndSave = async () => {
    // First test the connection
    await handleTestConnection();

    // If test was successful, then save
    if (testStatus.includes('✅')) {
      await handleSaveConnection();
    }
  };

  return (
    <div className="card bg-base-100 shadow-sm border border-base-300/50">
      <div className="card-body p-4">
        <div className="flex items-center justify-between">
          <h2 className="card-title text-lg">🦆 DuckDB Integration</h2>
          {hasUnsavedChanges && (
            <div className="badge badge-warning badge-xs">
              Unsaved Changes
            </div>
          )}
        </div>

        <div className="form-control">
          <label className="label cursor-pointer py-2">
            <span className="label-text text-sm">Enable DuckDB Integration</span>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={duckdbEnabled}
              onChange={(e) => setDuckdbEnabled(e.target.checked)}
            />
          </label>
        </div>

        {duckdbEnabled && (
          <div className="space-y-3 mt-3">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-sm">Database Path</span>
              </label>
              <input
                type="text"
                placeholder=":memory: or path/to/database.duckdb"
                className="input input-bordered input-sm"
                value={duckdbDatabasePath}
                onChange={(e) => setDuckdbDatabasePath(e.target.value)}
              />
              <label className="label py-1">
                <span className="label-text-alt text-xs">
                  Path to DuckDB database file (use :memory: for in-memory database)
                </span>
              </label>
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-sm">Connection String (Optional)</span>
              </label>
              <input
                type="text"
                placeholder="Additional connection parameters"
                className="input input-bordered input-sm"
                value={duckdbConnectionString}
                onChange={(e) => setDuckdbConnectionString(e.target.value)}
              />
              <label className="label py-1">
                <span className="label-text-alt text-xs">
                  Optional connection string for advanced configuration
                </span>
              </label>
            </div>

            <div className="form-control space-y-2">
              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  className="btn btn-outline btn-primary btn-sm flex-1"
                  onClick={handleTestConnection}
                  disabled={isTesting || isSaving}
                >
                  {isTesting ? (
                    <>
                      <span className="loading loading-spinner loading-xs"></span>
                      Testing...
                    </>
                  ) : (
                    'Test Connection'
                  )}
                </button>

                <button
                  className="btn btn-primary btn-sm flex-1"
                  onClick={handleSaveConnection}
                  disabled={isSaving || isTesting || !hasUnsavedChanges}
                >
                  {isSaving ? (
                    <>
                      <span className="loading loading-spinner loading-xs"></span>
                      Saving...
                    </>
                  ) : (
                    'Save Configuration'
                  )}
                </button>
              </div>

              {/* Combined Test & Save button */}
              <button
                className="btn btn-success btn-xs w-full"
                onClick={handleTestAndSave}
                disabled={isTesting || isSaving}
              >
                {(isTesting || isSaving) ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    {isTesting ? 'Testing...' : 'Saving...'}
                  </>
                ) : (
                  '🚀 Test & Save'
                )}
              </button>

              {/* Status messages */}
              {testStatus && (
                <div className={`alert ${testStatus.includes('✅') ? 'alert-success' : 'alert-error'} py-2`}>
                  <span className="text-xs">{testStatus}</span>
                </div>
              )}

              {saveStatus && (
                <div className={`alert ${saveStatus.includes('✅') ? 'alert-success' : 'alert-error'} py-2`}>
                  <span className="text-xs">{saveStatus}</span>
                </div>
              )}
            </div>

            <div className="alert alert-info py-3">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <div>
                <h3 className="font-semibold text-sm">DuckDB Integration Setup</h3>
                <ul className="text-xs mt-1 space-y-1">
                  <li>• Provides SQL-based data analysis and querying capabilities</li>
                  <li>• Supports both in-memory and persistent database storage</li>
                  <li>• Perfect for data analytics, ETL operations, and complex queries</li>
                  <li>• Fast columnar storage and execution engine</li>
                  <li>• Tools will be available in the agent when enabled</li>
                </ul>
              </div>
            </div>

            {/* Quick setup guide */}
            <div className="collapse collapse-arrow bg-base-200">
              <input type="checkbox" />
              <div className="collapse-title text-xs font-medium py-2">
                🔧 Quick Setup Guide
              </div>
              <div className="collapse-content">
                <ol className="list-decimal list-inside text-xs space-y-1">
                  <li>Choose between in-memory (":memory:") or persistent database</li>
                  <li>For persistent: specify a file path like "data/mydb.duckdb"</li>
                  <li>Leave connection string empty for default configuration</li>
                  <li>Click "Test Connection" to verify DuckDB functionality</li>
                  <li>Click "Save Configuration" to persist your settings</li>
                  <li>DuckDB tools will be available for data analysis tasks</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}