import React, { useState, useEffect } from 'react';

export function ConnectionTab() {
  const [connectionType, setConnectionType] = useState<ConnectionType>('notion');
  const [apiKey, setApiKey] = useState('');
  const [connectionUrl, setConnectionUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // 定义连接类型
  type ConnectionType = 'notion' | 'duckdb' | 'calendar' | 'sheet';

  // 获取不同连接类型的默认配置
  const getDefaultConfig = (type: ConnectionType) => {
    const configs: Record<ConnectionType, { url: string; placeholder: string }> = {
      notion: {
        url: 'https://api.notion.com/v1',
        placeholder: 'Enter Notion integration token'
      },
      duckdb: {
        url: 'http://localhost:8080',
        placeholder: 'Enter DuckDB connection string'
      },
      calendar: {
        url: 'https://www.googleapis.com/calendar/v3',
        placeholder: 'Enter Google Calendar API key'
      },
      sheet: {
        url: 'https://sheets.googleapis.com/v4',
        placeholder: 'Enter Google Sheets API key'
      }
    };
    return configs[type] || { url: '', placeholder: 'Enter API key' };
  };

  // 处理连接类型切换
  const handleConnectionTypeChange = (newType: ConnectionType) => {
    setConnectionType(newType);
    
    // 根据新的连接类型设置默认URL，清空API Key
    const defaultConfig = getDefaultConfig(newType);
    setConnectionUrl(defaultConfig.url);
    setApiKey('');
    
    // 重置保存状态
    setSaveStatus('idle');
  };

  // 从 Chrome Storage 加载设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await chrome.storage.local.get([
          'connectionType',
          'apiKey', 
          'connectionUrl'
        ]);
        
        if (result.connectionType) {
          const resultType = result.connectionType as ConnectionType;
          setConnectionType(resultType);
          // 如果没有保存的URL，使用默认配置
          if (!result.connectionUrl) {
            const defaultConfig = getDefaultConfig(resultType);
            setConnectionUrl(defaultConfig.url);
          } else {
            setConnectionUrl(result.connectionUrl);
          }
        }
        if (result.apiKey) setApiKey(result.apiKey);
      } catch (error) {
        console.error('Error loading connection settings:', error);
      }
    };

    loadSettings();
  }, []);

  // 保存设置到 Chrome Storage
  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      await chrome.storage.local.set({
        connectionType,
        apiKey,
        connectionUrl
      });
      
      setSaveStatus('success');
      
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
      
    } catch (error) {
      console.error('Error saving connection settings:', error);
      setSaveStatus('error');
      
      setTimeout(() => {
        setSaveStatus('idle');
      }, 5000);
    } finally {
      setIsSaving(false);
    }
  };

  // 获取按钮文本和样式
  const getButtonProps = () => {
    switch (saveStatus) {
      case 'success':
        return {
          text: '✓ Saved Successfully',
          className: 'btn btn-success'
        };
      case 'error':
        return {
          text: '✗ Save Failed',
          className: 'btn btn-error'
        };
      default:
        return {
          text: isSaving ? 'Saving...' : 'Save Connection Settings',
          className: 'btn btn-primary'
        };
    }
  };

  const buttonProps = getButtonProps();
  const currentConfig = getDefaultConfig(connectionType);

  return (
    <div className="space-y-6">
      <div className="card bg-base-100 shadow-md">
        <div className="card-body">
          <h2 className="card-title text-xl">🔗 Connection Settings (coming soon)</h2>
          <p className="mb-4">
            Configure connection settings for BrowserOnly.
          </p>
          
          <div className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">Connection Type</span>
              </label>
              <select 
                className="select select-bordered" 
                value={connectionType} 
                onChange={(e) => handleConnectionTypeChange(e.target.value as ConnectionType)}
                disabled={isSaving}
              >
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
                placeholder={`Default: ${currentConfig.url}`}
                className="input input-bordered"
                disabled={isSaving}
              />
              <label className="label">
                <span className="label-text-alt text-gray-500">
                  Default for {connectionType}: {currentConfig.url}
                </span>
              </label>
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
                placeholder={currentConfig.placeholder}
                className="input input-bordered"
                disabled={isSaving}
              />
            </div>
          </div>
          
          <div className="card-actions justify-end mt-6">
            <button 
              className={buttonProps.className}
              onClick={handleSave}
              disabled={isSaving || saveStatus !== 'idle'}
            >
              {isSaving && <span className="loading loading-spinner loading-xs mr-2"></span>}
              {buttonProps.text}
            </button>
          </div>
          
          {saveStatus === 'error' && (
            <div className="alert alert-error mt-4">
              <span>Failed to save settings. Please try again.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}