import React, { useState, useEffect } from 'react';
import { PdfMetadata } from '../utils/pdfUtils';

interface PdfViewerProps {
  pdfMetadata: PdfMetadata;
  onClose?: () => void;
  isExpanded?: boolean;
}

const PdfIcon = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6.75 3.5h7.1L18.5 8v12.5h-11.75V3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M13.75 3.75V8.25h4.5M9.25 12.25h6.5M9.25 15.5h4.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M8 8.25V6.5A2.5 2.5 0 0 1 10.5 4h7A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5h-1.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <rect x="4" y="8" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

const ExternalLinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M14 4h6v6M20 4l-9 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 13.5v4A2.5 2.5 0 0 1 15.5 20h-9A2.5 2.5 0 0 1 4 17.5v-9A2.5 2.5 0 0 1 6.5 6h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 4v10M8.5 10.5 12 14l3.5-3.5M5 18.5h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfMetadata,
  onClose,
  isExpanded = false
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [pdfTitle, setPdfTitle] = useState(pdfMetadata.title);
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [reloadNonce, setReloadNonce] = useState(0);

  const pdfSource = (() => {
    try {
      return new URL(pdfMetadata.originalUrl).hostname;
    } catch {
      return 'PDF document';
    }
  })();

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setPdfTitle(pdfMetadata.title);
    setCopyFeedback('idle');
    setReloadNonce(0);
  }, [pdfMetadata]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const copyPdfUrl = async () => {
    try {
      await navigator.clipboard.writeText(pdfMetadata.originalUrl);
      setCopyFeedback('copied');
      window.setTimeout(() => setCopyFeedback('idle'), 1800);
    } catch {
      setCopyFeedback('failed');
      window.setTimeout(() => setCopyFeedback('idle'), 1800);
    }
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

  const retryPdf = () => {
    setHasError(false);
    setIsLoading(true);
    setReloadNonce(current => current + 1);
  };

  return (
    <div className={`pdf-viewer-surface relative flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#d9dee3] bg-[#f7f8f9] text-[#292f33] shadow-[0_1px_3px_rgb(25_49_66_/_0.10)] ${
      isExpanded ? 'fixed inset-4 z-50 max-h-[calc(100vh-2rem)]' : 'h-full'
    }`}>
      <div className="flex min-h-[58px] shrink-0 items-center justify-between gap-3 border-b border-[#d9dee3] bg-white px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#edf3f7] text-[#315a78]">
            <PdfIcon />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-5 text-[#292f33]" title={pdfTitle}>{pdfTitle}</div>
            <div className="mt-0.5 truncate text-[11px] font-medium text-[#6b747c]">{pdfSource}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <div className="tooltip tooltip-bottom" data-tip={copyFeedback === 'copied' ? 'Copied' : copyFeedback === 'failed' ? 'Copy failed' : 'Copy PDF URL'}>
            <button
              onClick={copyPdfUrl}
              aria-label="Copy PDF URL"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#d9dee3] bg-white text-[#6b747c] transition-colors duration-150 hover:border-[#315a78] hover:bg-[#f7f8f9] hover:text-[#315a78] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#315a78] active:scale-95"
            >
              <CopyIcon />
            </button>
          </div>

          <div className="tooltip tooltip-bottom" data-tip="Open in new tab">
            <button
              onClick={openInNewTab}
              aria-label="Open PDF in new tab"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#d9dee3] bg-white text-[#6b747c] transition-colors duration-150 hover:border-[#315a78] hover:bg-[#f7f8f9] hover:text-[#315a78] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#315a78] active:scale-95"
            >
              <ExternalLinkIcon />
            </button>
          </div>

          <div className="tooltip tooltip-bottom" data-tip="Download PDF">
            <button
              onClick={downloadPdf}
              aria-label="Download PDF"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#d9dee3] bg-white text-[#6b747c] transition-colors duration-150 hover:border-[#315a78] hover:bg-[#f7f8f9] hover:text-[#315a78] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#315a78] active:scale-95"
            >
              <DownloadIcon />
            </button>
          </div>

          <div className="mx-1.5 h-6 w-px bg-[#d9dee3]"></div>

          {onClose && (
            <button
              onClick={onClose}
              aria-label={isExpanded ? 'Close expanded view' : 'Close PDF viewer'}
              className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#d9dee3] bg-white text-[#6b747c] transition-colors duration-150 hover:border-[#315a78] hover:bg-[#f7f8f9] hover:text-[#315a78] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#315a78] active:scale-95"
              title={isExpanded ? 'Close expanded view' : 'Close PDF viewer'}
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#f1f3f4] p-3">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f1f3f4]/95">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-white text-[#315a78] shadow-[0_1px_3px_rgb(25_49_66_/_0.10)]">
                <PdfIcon className="h-6 w-6" />
              </div>
              <h2 className="text-sm font-semibold text-[#292f33]">Loading PDF</h2>
              <p className="mt-1 text-xs leading-relaxed text-[#6b747c]">
                Preparing the document for reading
              </p>
              <div className="mx-auto mt-4 h-1 w-24 overflow-hidden rounded-full bg-[#d9dee3]"><div className="h-full w-1/2 animate-pulse rounded-full bg-[#315a78]"></div></div>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f1f3f4]/95 p-6">
            <div className="max-w-sm text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-white text-[#a33f3f] shadow-[0_1px_3px_rgb(25_49_66_/_0.10)]">
                <PdfIcon className="h-6 w-6" />
              </div>
              <h2 className="text-sm font-semibold text-[#292f33]">We couldn't load this PDF</h2>
              <p className="mt-1 text-xs leading-relaxed text-[#6b747c]">
                Check the source or try loading the document again.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  onClick={retryPdf}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[#315a78] px-4 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#274a64] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315a78] active:scale-[0.98]"
                >
                  Try again
                </button>
                <button
                  onClick={openInNewTab}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-[#d9dee3] bg-white px-4 text-xs font-semibold text-[#6b747c] transition-colors duration-150 hover:border-[#315a78] hover:bg-[#f7f8f9] hover:text-[#315a78] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315a78] active:scale-[0.98]"
                >
                  Open in new tab
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-[#d9dee3] bg-white">
          <iframe
            key={reloadNonce}
            src={`chrome-extension://${chrome.runtime.id}/pdf-proxy-viewer.html?file=${encodeURIComponent(pdfMetadata.originalUrl)}`}
            className="w-full h-full border-0"
            title={pdfTitle}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        </div>
      </div>
    </div>
  );
};
