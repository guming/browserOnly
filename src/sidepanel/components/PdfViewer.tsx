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
    <div className={`relative overflow-hidden rounded-xl border border-stone-200 bg-white ${
      isExpanded ? 'fixed inset-4 z-50' : 'h-full'
    }`}>
      {/* Header - Match SidePanel output header style */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-[#f2f5f7] px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md border border-stone-300 bg-white">
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate text-xl font-semibold text-stone-900">{pdfTitle}</div>
            <div className="truncate text-xs font-medium text-stone-500">PDF Document</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* PDF Actions - Match SidePanel button style */}
          <div className="tooltip tooltip-bottom" data-tip="Copy PDF URL">
            <button
              onClick={copyPdfUrl}
              className="btn btn-sm border border-stone-300 bg-white text-stone-700 transition-colors duration-150 hover:border-stone-500 hover:bg-stone-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>

          <div className="tooltip tooltip-bottom" data-tip="Open in new tab">
            <button
              onClick={openInNewTab}
              className="btn btn-sm border border-stone-300 bg-white text-stone-700 transition-colors duration-150 hover:border-stone-500 hover:bg-stone-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          </div>

          <div className="tooltip tooltip-bottom" data-tip="Download PDF">
            <button
              onClick={downloadPdf}
              className="btn btn-sm border border-stone-300 bg-white text-stone-700 transition-colors duration-150 hover:border-stone-500 hover:bg-stone-50"
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
              className="btn btn-sm btn-circle z-50 border border-stone-300 bg-white text-stone-700 transition-colors duration-150 hover:border-stone-500 hover:bg-stone-50 pointer-events-auto"
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
      <div className="relative flex-1 overflow-auto bg-[#fafbfc] p-6" style={isExpanded ? { height: 'calc(100vh - 200px)', maxHeight: 'calc(100vh - 200px)' } : { maxHeight: 'calc(100% - 60px)' }}>
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f5f4f0]">
            <div className="text-center">
              <div className="w-32 h-32 mx-auto mb-8 rounded-3xl bg-white/90 shadow-2xl border border-white/50 flex items-center justify-center transition-transform duration-300 hover:scale-105">
              </div>
              <h2 className="mb-4 text-2xl font-semibold text-stone-900">Loading PDF...</h2>
              <p className="mb-8 text-base leading-relaxed text-stone-600">
                Please wait while the document loads
              </p>
              {/* Match SidePanel loading animation */}
              <div className="mt-6 flex justify-center space-x-4">
              </div>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f5f4f0]">
            <div className="text-center max-w-sm">
              <div className="w-32 h-32 mx-auto mb-8 rounded-3xl bg-white/90 shadow-2xl border border-white/50 flex items-center justify-center transition-transform duration-300 hover:scale-105">
              </div>
              <h2 className="mb-4 text-2xl font-semibold text-stone-900">Cannot Load PDF</h2>
              <p className="mb-8 text-base leading-relaxed text-stone-600">
                The PDF could not be displayed. This might be due to browser security restrictions.
              </p>
              <div className="space-y-3">
                <button
                  onClick={openInNewTab}
                  className="btn btn-lg w-full rounded-lg border-0 bg-[#315a78] text-white transition-colors duration-150 hover:bg-[#274a64]"
                >
                  Open PDF in New Tab
                </button>
                <button
                  onClick={downloadPdf}
                  className="btn btn-lg w-full rounded-lg border border-stone-300 bg-white text-stone-700 transition-colors duration-150 hover:border-stone-500 hover:bg-stone-50"
                >
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="h-full overflow-hidden rounded-lg border border-stone-200 bg-white">
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
