/**
 * PDF URL Interceptor Content Script
 * Detects PDF URLs and redirects them to the custom PDF.js viewer
 */

import { isPdfUrl, extractPdfUrl } from '../sidepanel/utils/pdfUtils';

// Configuration
const PDF_VIEWER_PATH = 'pdf-viewer.html';
const INTERCEPTOR_ENABLED_KEY = 'pdf-interceptor-enabled';

// State
let isInterceptorEnabled = true;
let originalUrl = '';

/**
 * Check if PDF interception is enabled
 */
async function checkInterceptionEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.sync.get([INTERCEPTOR_ENABLED_KEY], (result) => {
      const enabled = result[INTERCEPTOR_ENABLED_KEY] !== false; // Default to enabled
      console.log('[PDF Interceptor] Checking storage:', INTERCEPTOR_ENABLED_KEY, '=', result[INTERCEPTOR_ENABLED_KEY], 'enabled:', enabled);
      resolve(enabled);
    });
  });
}

/**
 * Initialize the PDF interceptor
 */
async function initializePdfInterceptor() {
  // Check if interception is enabled
  isInterceptorEnabled = await checkInterceptionEnabled();

  if (!isInterceptorEnabled) {
    console.log('[PDF Interceptor] PDF interception is disabled');
    return;
  }

  // Get current URL
  const currentUrl = window.location.href;

  // Check if this is already our PDF viewer
  if (currentUrl.includes(PDF_VIEWER_PATH)) {
    console.log('[PDF Interceptor] Already in PDF viewer, skipping interception');
    return;
  }

  // Check if current URL is a PDF
  if (isPdfUrl(currentUrl)) {
    console.log('[PDF Interceptor] PDF URL detected:', currentUrl);
    interceptPdfUrl(currentUrl);
  } else {
    // Monitor for PDF links and navigation
    monitorPdfLinks();
    monitorNavigation();
  }
}

/**
 * Intercept PDF URL and redirect to custom viewer
 */
function interceptPdfUrl(pdfUrl: string) {
  originalUrl = extractPdfUrl(pdfUrl);
  const viewerUrl = createPdfViewerUrl(originalUrl);

  console.log('[PDF Interceptor] Redirecting to custom PDF viewer:', viewerUrl);

  // Replace current page with PDF viewer
  window.location.replace(viewerUrl);
}

/**
 * Create PDF viewer URL with proper parameters
 */
function createPdfViewerUrl(pdfUrl: string): string {
  const extensionId = chrome.runtime.id;
  const viewerUrl = `chrome-extension://${extensionId}/${PDF_VIEWER_PATH}`;
  const encodedPdfUrl = encodeURIComponent(pdfUrl);

  return `${viewerUrl}?file=${encodedPdfUrl}`;
}

/**
 * Monitor for PDF links in the page
 */
function monitorPdfLinks() {
  // Add click listeners to all PDF links
  const pdfLinks = document.querySelectorAll('a[href$=".pdf"], a[href*=".pdf?"], a[href*=".pdf#"]');

  pdfLinks.forEach((link) => {
    if (link instanceof HTMLAnchorElement) {
      link.addEventListener('click', (event) => {
        if (isInterceptorEnabled && isPdfUrl(link.href)) {
          event.preventDefault();
          console.log('[PDF Interceptor] PDF link clicked:', link.href);
          interceptPdfUrl(link.href);
        }
      });
    }
  });

  // Monitor for dynamically added PDF links
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          const newPdfLinks = node.querySelectorAll('a[href$=".pdf"], a[href*=".pdf?"], a[href*=".pdf#"]');

          newPdfLinks.forEach((link) => {
            if (link instanceof HTMLAnchorElement) {
              link.addEventListener('click', (event) => {
                if (isInterceptorEnabled && isPdfUrl(link.href)) {
                  event.preventDefault();
                  console.log('[PDF Interceptor] Dynamic PDF link clicked:', link.href);
                  interceptPdfUrl(link.href);
                }
              });
            }
          });
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Monitor for navigation to PDF URLs
 */
function monitorNavigation() {
  // Listen for popstate events (back/forward navigation)
  window.addEventListener('popstate', async () => {
    const currentUrl = window.location.href;

    if (isInterceptorEnabled && isPdfUrl(currentUrl)) {
      console.log('[PDF Interceptor] Navigation to PDF URL detected:', currentUrl);
      interceptPdfUrl(currentUrl);
    }
  });

  // Monitor for programmatic navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(state, title, url) {
    const result = originalPushState.apply(history, [state, title, url]);

    if (url && isInterceptorEnabled && isPdfUrl(url.toString())) {
      console.log('[PDF Interceptor] pushState to PDF URL detected:', url);
      setTimeout(() => interceptPdfUrl(url.toString()), 0);
    }

    return result;
  };

  history.replaceState = function(state, title, url) {
    const result = originalReplaceState.apply(history, [state, title, url]);

    if (url && isInterceptorEnabled && isPdfUrl(url.toString())) {
      console.log('[PDF Interceptor] replaceState to PDF URL detected:', url);
      setTimeout(() => interceptPdfUrl(url.toString()), 0);
    }

    return result;
  };
}

/**
 * Handle settings changes from extension
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'togglePdfInterception') {
    isInterceptorEnabled = message.enabled;
    console.log('[PDF Interceptor] Interception', isInterceptorEnabled ? 'enabled' : 'disabled');
    sendResponse({ success: true });
  }

  if (message.action === 'checkPdfUrl') {
    const currentUrl = window.location.href;
    const isPdf = isPdfUrl(currentUrl);

    sendResponse({
      isPdf,
      url: currentUrl,
      originalUrl: isPdf ? extractPdfUrl(currentUrl) : null
    });
  }
});

/**
 * Listen for storage changes to update interception setting
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes[INTERCEPTOR_ENABLED_KEY]) {
    const newValue = changes[INTERCEPTOR_ENABLED_KEY].newValue;
    isInterceptorEnabled = newValue !== false;
    console.log('[PDF Interceptor] Setting changed, interception is now', isInterceptorEnabled ? 'enabled' : 'disabled');
  }
});

/**
 * Initialize when DOM is ready
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePdfInterceptor);
} else {
  initializePdfInterceptor();
}

// Also initialize immediately in case we missed DOMContentLoaded
initializePdfInterceptor();

export {};