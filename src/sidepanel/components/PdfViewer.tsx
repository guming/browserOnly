import React, { useState, useEffect } from 'react';
import { PdfMetadata } from '../utils/pdfUtils';

interface PdfViewerProps {
  pdfMetadata: PdfMetadata;
  onClose?: () => void;
  isExpanded?: boolean;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfMetadata,
  onClose,
  isExpanded = false
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [pdfTitle, setPdfTitle] = useState(pdfMetadata.title);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setPdfTitle(pdfMetadata.title);
  }, [pdfMetadata]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const copyPdfUrl = () => {
    navigator.clipboard.writeText(pdfMetadata.originalUrl);
  };

  const openInNewTab = () => {
    chrome.tabs.create({ url: pdfMetadata.originalUrl });
  };

  const downloadPdf = () => {
    chrome.downloads.download({
      url: pdfMetadata.originalUrl,
      saveAs: true
    });
  };

  return (
    <div className={`bg-white/90 rounded-3xl shadow-lg border border-white/50 overflow-hidden will-change-transform relative ${
      isExpanded ? 'fixed inset-4 z-50' : 'h-full'
    }`}>
      {/* Header - Match SidePanel output header style */}
      <div className="bg-gradient-to-r from-sky-50 to-blue-50 border-b border-sky-100 flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg flex items-center justify-center transition-transform duration-300 hover:scale-105">
            <span className="text-xl">📄</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-bold text-gray-800 truncate">{pdfTitle}</div>
            <div className="text-xs text-sky-600 font-semibold truncate">PDF Document</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* PDF Actions - Match SidePanel button style */}
          <div className="tooltip tooltip-bottom" data-tip="Copy PDF URL">
            <button
              onClick={copyPdfUrl}
              className="btn btn-sm bg-white/80 border border-gray-200 text-gray-700 hover:bg-white hover:border-gray-300 hover:scale-105 shadow-md rounded-xl transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>

          <div className="tooltip tooltip-bottom" data-tip="Open in new tab">
            <button
              onClick={openInNewTab}
              className="btn btn-sm bg-white/80 border border-gray-200 text-gray-700 hover:bg-white hover:border-gray-300 hover:scale-105 shadow-md rounded-xl transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          </div>

          <div className="tooltip tooltip-bottom" data-tip="Download PDF">
            <button
              onClick={downloadPdf}
              className="btn btn-sm bg-white/80 border border-gray-200 text-gray-700 hover:bg-white hover:border-gray-300 hover:scale-105 shadow-md rounded-xl transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          </div>

          <div className="w-px h-6 bg-gray-300 mx-2"></div>

          {onClose && (
            <button
              onClick={onClose}
              className={`btn btn-sm btn-circle ${isExpanded ? 'bg-red-500 hover:bg-red-600 text-white border-0' : 'bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white border-0'} shadow-lg hover:scale-110 transition-all duration-200 z-50 pointer-events-auto`}
              title={isExpanded ? 'Close expanded view' : 'Close PDF viewer'}
            >
              {isExpanded ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* PDF Content - Match SidePanel content area style */}
      <div className="p-6 overflow-auto flex-1 bg-gradient-to-b from-white/50 to-sky-50/30 relative" style={isExpanded ? { height: 'calc(100vh - 200px)', maxHeight: 'calc(100vh - 200px)' } : { maxHeight: 'calc(100% - 60px)' }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white/50 to-sky-50/30 z-10">
            <div className="text-center">
              <div className="w-32 h-32 mx-auto mb-8 rounded-3xl bg-white/90 shadow-2xl border border-white/50 flex items-center justify-center transition-transform duration-300 hover:scale-105">
                <span className="text-6xl">📄</span>
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-4">Loading PDF...</h2>
              <p className="text-gray-600 mb-8 leading-relaxed text-lg">
                Please wait while the document loads
              </p>
              {/* Match SidePanel loading animation */}
              <div className="mt-6 flex justify-center space-x-4">
                <div className="w-2 h-2 bg-sky-400 rounded-full opacity-75 animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full opacity-60 animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full opacity-45 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-white/50 to-sky-50/30 z-10">
            <div className="text-center max-w-sm">
              <div className="w-32 h-32 mx-auto mb-8 rounded-3xl bg-white/90 shadow-2xl border border-white/50 flex items-center justify-center transition-transform duration-300 hover:scale-105">
                <span className="text-6xl">⚠️</span>
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-4">Cannot Load PDF</h2>
              <p className="text-gray-600 mb-8 leading-relaxed text-lg">
                The PDF could not be displayed. This might be due to browser security restrictions.
              </p>
              <div className="space-y-3">
                <button
                  onClick={openInNewTab}
                  className="btn btn-lg bg-gradient-to-r from-sky-500 to-blue-600 border-0 text-white hover:from-sky-600 hover:to-blue-700 shadow-2xl rounded-2xl transition-transform duration-300 hover:scale-105 w-full"
                >
                  <span className="mr-3 text-xl">🔗</span>
                  Open PDF in New Tab
                </button>
                <button
                  onClick={downloadPdf}
                  className="btn btn-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 shadow-xl rounded-2xl transition-transform duration-300 hover:scale-105 w-full"
                >
                  <span className="mr-3 text-xl">📥</span>
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white/90 rounded-2xl shadow-lg border border-white/50 overflow-hidden h-full">
          <iframe
            src={`chrome-extension://${chrome.runtime.id}/pdf-proxy-viewer.html?file=${encodeURIComponent(pdfMetadata.originalUrl)}`}
            className="w-full h-full border-0"
            title={pdfTitle}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            style={{
              height: isExpanded ? 'calc(100vh - 300px)' : '500px',
              minHeight: '400px'
            }}
          />
        </div>
      </div>
    </div>
  );
};