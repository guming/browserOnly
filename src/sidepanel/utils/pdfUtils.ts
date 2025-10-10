/**
 * Utility functions for PDF detection and handling
 */

/**
 * Check if a URL points to a PDF file
 * @param url The URL to check
 * @returns True if the URL is a PDF
 */
export function isPdfUrl(url: string): boolean {
  if (!url) return false;

  // Check file extension
  const urlLower = url.toLowerCase();
  if (urlLower.endsWith('.pdf')) {
    return true;
  }

  // Check if URL contains PDF indicators
  if (urlLower.includes('/pdf/') || urlLower.includes('.pdf?') || urlLower.includes('.pdf#')) {
    return true;
  }

  // Check common PDF viewer URLs
  const pdfViewerPatterns = [
    'chrome://pdf-viewer/',
    'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/', // Chrome PDF Viewer extension
    '/viewer.html', // Common PDF.js pattern
    'pdfjs-', // PDF.js patterns
  ];

  return pdfViewerPatterns.some(pattern => urlLower.includes(pattern));
}

/**
 * Extract the original PDF URL from Chrome's PDF viewer URL
 * @param viewerUrl The Chrome PDF viewer URL
 * @returns The original PDF URL
 */
export function extractPdfUrl(viewerUrl: string): string {
  if (!viewerUrl) return '';

  try {
    // Handle Chrome's PDF viewer URLs
    if (viewerUrl.includes('chrome://pdf-viewer/')) {
      const urlParams = new URLSearchParams(viewerUrl.split('?')[1] || '');
      return urlParams.get('src') || viewerUrl;
    }

    // Handle Chrome extension PDF viewer
    if (viewerUrl.includes('chrome-extension://') && viewerUrl.includes('/content/web/viewer.html')) {
      const urlParams = new URLSearchParams(viewerUrl.split('?')[1] || '');
      const file = urlParams.get('file');
      if (file) {
        return decodeURIComponent(file);
      }
    }

    // If it's already a direct PDF URL, return as is
    if (isPdfUrl(viewerUrl)) {
      return viewerUrl;
    }

    return viewerUrl;
  } catch (error) {
    console.error('Error extracting PDF URL:', error);
    return viewerUrl;
  }
}

/**
 * Get PDF metadata from tab information
 * @param tab Chrome tab object
 * @returns PDF metadata object
 */
export interface PdfMetadata {
  isPdf: boolean;
  originalUrl: string;
  displayUrl: string;
  title: string;
}

export function getPdfMetadata(tab: chrome.tabs.Tab): PdfMetadata {
  const url = tab.url || '';
  const title = tab.title || 'PDF Document';

  if (!isPdfUrl(url)) {
    return {
      isPdf: false,
      originalUrl: url,
      displayUrl: url,
      title: title
    };
  }

  const originalUrl = extractPdfUrl(url);

  return {
    isPdf: true,
    originalUrl: originalUrl,
    displayUrl: url,
    title: title.replace(' - Google Chrome', '').replace(' - PDF', '') || 'PDF Document'
  };
}