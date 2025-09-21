import React, { useState, useEffect } from 'react';
import { ConfigManager } from '../../background/configManager';

interface NotionSettingsProps {
  notionEnabled: boolean;
  setNotionEnabled: (enabled: boolean) => void;
  notionBearerToken: string;
  setNotionBearerToken: (token: string) => void;
  notionDatabaseId: string;
  setNotionDatabaseId: (databaseId: string) => void;
}

export function NotionSettings({
  notionEnabled,
  setNotionEnabled,
  notionBearerToken,
  setNotionBearerToken,
  notionDatabaseId,
  setNotionDatabaseId
}: NotionSettingsProps) {
  const [testStatus, setTestStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [availableDatabases, setAvailableDatabases] = useState<Array<{id: string, title: string}>>([]);
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);

  // Load Notion settings when component mounts
  useEffect(() => {
    const loadNotionSettings = async () => {
      const configManager = ConfigManager.getInstance();
      const notionConfig = await configManager.getNotionConfig();

      setNotionEnabled(notionConfig.enabled);
      setNotionBearerToken(notionConfig.bearerToken);

      // Load database ID from Chrome storage
      try {
        const result = await chrome.storage.sync.get(['notionDatabaseId']);
        if (result.notionDatabaseId) {
          setNotionDatabaseId(result.notionDatabaseId);
        }
      } catch (error) {
        console.error('Error loading database ID:', error);
      }
    };

    loadNotionSettings();
  }, []);

  // Track changes to show unsaved changes indicator
  useEffect(() => {
    const checkForChanges = async () => {
      const configManager = ConfigManager.getInstance();
      const currentConfig = await configManager.getNotionConfig();

      // Check database ID from storage
      let currentDatabaseId = '';
      try {
        const result = await chrome.storage.sync.get(['notionDatabaseId']);
        currentDatabaseId = result.notionDatabaseId || '';
      } catch (error) {
        console.error('Error checking database ID:', error);
      }

      const hasChanges =
        currentConfig.enabled !== notionEnabled ||
        currentConfig.bearerToken !== notionBearerToken ||
        currentDatabaseId !== notionDatabaseId;

      setHasUnsavedChanges(hasChanges);

      // Clear save status if there are new changes
      if (hasChanges && saveStatus) {
        setSaveStatus('');
      }
    };

    checkForChanges();
  }, [notionEnabled, notionBearerToken, notionDatabaseId, saveStatus]);

  // Load available databases from Notion
  const loadAvailableDatabases = async () => {
    if (!notionBearerToken) return;

    setIsLoadingDatabases(true);
    try {
      const { NotionSDKClient } = await import('../../agent/notionClient');
      const client = new NotionSDKClient({
        auth: notionBearerToken,
      });

      const response = await client.search({
        filter: {
          property: 'object',
          value: 'database'
        },
        page_size: 50
      });

      const databases = response.results
        .filter((item: any) => item.object === 'database')
        .map((db: any) => ({
          id: db.id,
          title: db.title?.[0]?.plain_text || 'Untitled Database'
        }));

      setAvailableDatabases(databases);
    } catch (error) {
      console.error('Error loading databases:', error);
      setTestStatus(`⚠️ Could not load databases: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoadingDatabases(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestStatus('Testing connection...');

    try {
      // Create a test client to verify connection
      const { NotionSDKClient } = await import('../../agent/notionClient');
      const client = new NotionSDKClient({
        auth: notionBearerToken,
      });

      await client.testConnection();

      setTestStatus('✅ Connection successful! Notion tools are available.');

      // Load databases after successful connection test
      await loadAvailableDatabases();
    } catch (error) {
      setTestStatus(`❌ Connection failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConnection = async () => {
    setIsSaving(true);
    setSaveStatus('Saving configuration...');

    try {
      const configManager = ConfigManager.getInstance();

      // Save the configuration
      await configManager.saveNotionConfig({
        enabled: notionEnabled,
        bearerToken: notionBearerToken
      });

      // Save database ID to Chrome storage
      await chrome.storage.sync.set({
        'notionDatabaseId': notionDatabaseId
      });

      setSaveStatus('✅ Configuration saved successfully!');
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
          <h2 className="card-title text-lg">📝 Notion Integration</h2>
          {hasUnsavedChanges && (
            <div className="badge badge-warning badge-xs">
              Unsaved Changes
            </div>
          )}
        </div>
        
        <div className="form-control">
          <label className="label cursor-pointer py-2">
            <span className="label-text text-sm">Enable Notion Integration</span>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={notionEnabled}
              onChange={(e) => setNotionEnabled(e.target.checked)}
            />
          </label>
        </div>

        {notionEnabled && (
          <div className="space-y-3 mt-3">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-sm">Bearer Token</span>
              </label>
              <input
                type="password"
                placeholder="Your Notion API token"
                className="input input-bordered input-sm"
                value={notionBearerToken}
                onChange={(e) => setNotionBearerToken(e.target.value)}
              />
              <label className="label py-1">
                <span className="label-text-alt text-xs">
                  Authentication token for Notion API integration
                </span>
              </label>
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-sm">Default Database</span>
              </label>

              {availableDatabases.length > 0 ? (
                <select
                  className="select select-bordered select-sm w-full"
                  value={notionDatabaseId}
                  onChange={(e) => setNotionDatabaseId(e.target.value)}
                >
                  <option value="">Select a database...</option>
                  {availableDatabases.map((db) => (
                    <option key={db.id} value={db.id}>
                      📄 {db.title}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Database ID (test connection to load databases)"
                    className="input input-bordered input-sm flex-1"
                    value={notionDatabaseId}
                    onChange={(e) => setNotionDatabaseId(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    onClick={loadAvailableDatabases}
                    disabled={isLoadingDatabases || !notionBearerToken}
                  >
                    {isLoadingDatabases ? (
                      <span className="loading loading-spinner loading-xs"></span>
                    ) : (
                      '🔄'
                    )}
                  </button>
                </div>
              )}

              <label className="label py-1">
                <span className="label-text-alt text-xs">
                  Default database for LLM content sync (optional)
                </span>
              </label>
            </div>

            <div className="form-control space-y-2">
              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  className="btn btn-outline btn-primary btn-sm flex-1"
                  onClick={handleTestConnection}
                  disabled={isTesting || isSaving || !notionBearerToken}
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
                disabled={isTesting || isSaving || !notionBearerToken}
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
                <h3 className="font-semibold text-sm">Notion Integration Setup</h3>
                <ul className="text-xs mt-1 space-y-1">
                  <li>• Provides tools for creating/updating pages, querying databases</li>
                  <li>• Default database enables easy LLM content sync</li>
                  <li>• Test connection to verify server accessibility and load databases</li>
                  <li>• Save configuration to persist your settings</li>
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
                  <li>Go to <a href="https://www.notion.com/my-integrations" target="_blank" rel="noopener noreferrer" className="link link-primary">Notion Integrations</a></li>
                  <li>Click "Create new integration"</li>
                  <li>Give it a name and select your workspace</li>
                  <li>Copy the "Internal Integration Token" (starts with ntn_)</li>
                  <li>Paste it in the Bearer Token field above</li>
                  <li>Click "Test Connection" to verify and load available databases</li>
                  <li>Select a default database for LLM content sync (optional)</li>
                  <li>Click "Save Configuration" to persist your settings</li>
                  <li>Share your databases/pages with the integration</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}