import { useState, useEffect } from 'react';

interface PdfViewerSettingsProps {
  pdfInterceptorEnabled: boolean;
  setPdfInterceptorEnabled: (enabled: boolean) => void;
}

const INTERCEPTOR_ENABLED_KEY = 'pdf-interceptor-enabled';

export function PdfViewerSettings({
  pdfInterceptorEnabled,
  setPdfInterceptorEnabled
}: PdfViewerSettingsProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  // Load current setting from chrome.storage.sync on mount
  useEffect(() => {
    chrome.storage.sync.get([INTERCEPTOR_ENABLED_KEY], (result) => {
      const enabled = result[INTERCEPTOR_ENABLED_KEY] !== false;
      setPdfInterceptorEnabled(enabled);
    });
  }, [setPdfInterceptorEnabled]);

  // Handle save to chrome.storage.sync
  const handleSave = () => {
    setIsSaving(true);
    setSaveStatus('');

    chrome.storage.sync.set({
      [INTERCEPTOR_ENABLED_KEY]: pdfInterceptorEnabled
    }, () => {
      setIsSaving(false);
      setSaveStatus('PDF viewer settings saved successfully!');

      // Clear status message after 3 seconds
      setTimeout(() => {
        setSaveStatus('');
      }, 3000);
    });
  };

  return (
    <div className="card bg-base-100 shadow-md">
      <div className="card-body">
        <h2 className="card-title text-xl">📄 PDF Viewer</h2>
        <p className="text-sm text-base-content/70 mb-4">
          Enable custom PDF viewer with text extraction and markdown rendering capabilities
        </p>

        <div className="form-control">
          <label className="label cursor-pointer justify-start gap-4">
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={pdfInterceptorEnabled}
              onChange={(e) => setPdfInterceptorEnabled(e.target.checked)}
            />
            <div className="flex flex-col">
              <span className="label-text font-medium">Enable PDF Viewer</span>
              <span className="label-text-alt text-base-content/60 mt-1">
                When enabled, PDF files will open in the custom viewer with text extraction features.
                Disable to use browser's default PDF viewer.
              </span>
            </div>
          </label>
        </div>

        {pdfInterceptorEnabled && (
          <div className="alert alert-info mt-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div>
              <p className="text-sm">
                <strong>Features:</strong> Extract text with markdown formatting, copy as plain text or markdown,
                beautiful paper-style rendering
              </p>
            </div>
          </div>
        )}

        {/* Save button and status */}
        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn btn-primary"
          >
            {isSaving ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </button>

          {saveStatus && (
            <div className="text-sm text-success font-medium flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {saveStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
