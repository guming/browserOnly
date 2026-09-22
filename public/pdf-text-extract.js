// PDF Text Extraction with Markdown Rendering
// This script adds text extraction functionality to PDF.js viewer

(function() {
  'use strict';

  let extractedText = '';
  let isTextPanelOpen = false;
  let lastFocusedElement = null;
  let extractionCompleted = false;

  // Create a global namespace for sharing data between scripts
  window.PDFTextExtractor = window.PDFTextExtractor || {};

  // Expose getters for extracted text
  window.PDFTextExtractor.getExtractedText = function() {
    return extractedText;
  };

  window.PDFTextExtractor.hasExtractedText = function() {
    return hasReadableText(extractedText);
  };

  window.PDFTextExtractor.triggerExtraction = function() {
    if (!extractionCompleted) {
      return extractAllText();
    }
    return Promise.resolve(extractedText);
  };

  // Initialize when PDF.js is ready
  document.addEventListener('DOMContentLoaded', function() {
    initializeTextExtraction();
  });

  function initializeTextExtraction() {
    // Wait for PDFViewerApplication to be ready
    if (typeof PDFViewerApplication === 'undefined') {
      setTimeout(initializeTextExtraction, 100);
      return;
    }

    // Listen for document loaded event
    PDFViewerApplication.eventBus.on('documentloaded', function() {
      console.log('[Text Extract] PDF document loaded, extraction available');
    });

    // Setup button click handler
    const extractButton = document.getElementById('extractTextButton');
    if (extractButton) {
      extractButton.addEventListener('click', toggleTextPanel);
    }

    // Setup copy buttons
    document.getElementById('copyTextBtn')?.addEventListener('click', copyAsText);
    document.getElementById('copyMarkdownBtn')?.addEventListener('click', copyAsMarkdown);
    document.getElementById('closeTextPanelBtn')?.addEventListener('click', closeTextPanel);

    document.getElementById('textPanelBackdrop')?.addEventListener('click', closeTextPanel);
    document.getElementById('copyMenuToggle')?.addEventListener('click', toggleCopyMenu);
    document.addEventListener('keydown', handleGlobalKeydown);
    document.addEventListener('click', handleDocumentClick);

    // Load saved state
    const savedState = localStorage.getItem('pdfTextPanelOpen');
    if (savedState === 'true') {
      openTextPanel(false);
    }
  }

  async function toggleTextPanel() {
    if (isTextPanelOpen) {
      closeTextPanel();
    } else {
      openTextPanel();
    }
  }

  function openTextPanel(shouldFocus = true) {
    const panel = document.getElementById('textExtractionPanel');
    const button = document.getElementById('extractTextButton');
    const backdrop = document.getElementById('textPanelBackdrop');

    if (!panel) return;

    if (!isTextPanelOpen && document.activeElement && document.activeElement !== document.body) {
      lastFocusedElement = document.activeElement;
    }
    panel.classList.add('open');
    panel.removeAttribute('hidden');
    button?.classList.add('active');
    button?.setAttribute('aria-expanded', 'true');
    button?.setAttribute('title', 'Close reading assistant');
    backdrop?.removeAttribute('hidden');
    document.body.classList.add('text-panel-open');
    isTextPanelOpen = true;
    localStorage.setItem('pdfTextPanelOpen', 'true');

    if (shouldFocus) {
      window.requestAnimationFrame(() => document.getElementById('closeTextPanelBtn')?.focus());
    }

    // Extract text if not already done
    if (!extractedText) {
      extractAllText();
    }
  }

  function closeTextPanel() {
    const panel = document.getElementById('textExtractionPanel');
    const button = document.getElementById('extractTextButton');
    const backdrop = document.getElementById('textPanelBackdrop');
    const copyMenu = document.getElementById('copyMenu');
    const copyMenuToggle = document.getElementById('copyMenuToggle');

    if (!panel) return;

    panel.classList.remove('open');
    panel.setAttribute('hidden', 'hidden');
    button?.classList.remove('active');
    button?.setAttribute('aria-expanded', 'false');
    button?.setAttribute('title', 'Open reading assistant');
    backdrop?.setAttribute('hidden', 'hidden');
    copyMenu?.setAttribute('hidden', 'hidden');
    copyMenuToggle?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('text-panel-open');
    isTextPanelOpen = false;
    localStorage.setItem('pdfTextPanelOpen', 'false');

    if (lastFocusedElement instanceof HTMLElement && document.contains(lastFocusedElement)) {
      lastFocusedElement.focus();
    } else {
      button?.focus();
    }
  }

  function handleGlobalKeydown(event) {
    if (!isTextPanelOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeTextPanel();
      return;
    }

    if (event.key !== 'Tab') return;

    const panel = document.getElementById('textExtractionPanel');
    if (!panel) return;

    const focusable = Array.from(panel.querySelectorAll('button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'))
      .filter(element => !element.hasAttribute('hidden') && element.getClientRects().length > 0);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function toggleCopyMenu() {
    const menu = document.getElementById('copyMenu');
    const toggle = document.getElementById('copyMenuToggle');
    if (!menu || !toggle) return;

    const isOpen = !menu.hasAttribute('hidden');
    if (isOpen) {
      menu.setAttribute('hidden', 'hidden');
      toggle.setAttribute('aria-expanded', 'false');
    } else {
      menu.removeAttribute('hidden');
      toggle.setAttribute('aria-expanded', 'true');
      document.getElementById('copyMarkdownBtn')?.focus();
    }
  }

  function handleDocumentClick(event) {
    const wrapper = document.querySelector('.copy-menu-wrapper');
    const menu = document.getElementById('copyMenu');
    const toggle = document.getElementById('copyMenuToggle');
    if (!wrapper || !menu || !toggle || wrapper.contains(event.target)) return;

    menu.setAttribute('hidden', 'hidden');
    toggle.setAttribute('aria-expanded', 'false');
  }

  async function extractAllText() {
    const contentDiv = document.getElementById('extractedContent');
    const loadingDiv = document.getElementById('extractionLoading');
    const paperContainer = document.querySelector('.paper-container');
    const emptyState = document.getElementById('extractionEmptyState');

    if (!PDFViewerApplication.pdfDocument) {
      showError('No PDF document loaded');
      return;
    }

    try {
      loadingDiv.style.display = 'flex';
      contentDiv.innerHTML = '';
      emptyState?.setAttribute('hidden', 'hidden');
      paperContainer?.setAttribute('hidden', 'hidden');

      const numPages = PDFViewerApplication.pdfDocument.numPages;

      // First pass: collect all text items from all pages to identify headers/footers
      const allPagesData = [];
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await PDFViewerApplication.pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent();

        allPagesData.push({
          pageNum,
          textContent,
          pageHeight: viewport.height,
          pageWidth: viewport.width
        });

        const progress = Math.round((pageNum / numPages) * 50);
        document.getElementById('extractionProgress').textContent = `Analyzing page ${pageNum} of ${numPages} (${progress}%)`;
      }

      // Identify repetitive elements (headers/footers)
      const repetitiveElements = identifyRepetitiveElements(allPagesData);

      // Second pass: extract and filter text with paragraph detection
      let fullText = '';

      for (let i = 0; i < allPagesData.length; i++) {
        const { pageNum, textContent, pageHeight, pageWidth } = allPagesData[i];

        // Add page header
        fullText += `\n\n## Page ${pageNum}\n\n`;

        // Extract text with filtering and paragraph detection
        const pageText = extractPageText(textContent, pageHeight, pageWidth, repetitiveElements);
        fullText += pageText;

        const progress = 50 + Math.round((i + 1) / numPages * 50);
        document.getElementById('extractionProgress').textContent = `Extracting page ${pageNum} of ${numPages} (${progress}%)`;
      }

      extractedText = fullText;
      extractionCompleted = true;
      if (hasReadableText(extractedText)) {
        renderMarkdown(extractedText);
      } else {
        emptyState?.removeAttribute('hidden');
      }
      paperContainer?.removeAttribute('hidden');
      loadingDiv.style.display = 'none';

      return fullText;

    } catch (error) {
      console.error('[Text Extract] Error:', error);
      showError('Failed to extract text: ' + error.message);
      loadingDiv.style.display = 'none';
      extractionCompleted = false;
      throw error;
    }
  }

  function hasReadableText(text) {
    return Boolean(text && text.replace(/## Page \d+/g, '').trim());
  }

  function identifyRepetitiveElements(allPagesData) {
    const repetitiveElements = new Set();
    const textPositionMap = new Map();

    // Collect text that appears at similar positions across pages
    allPagesData.forEach(({ textContent, pageHeight }) => {
      textContent.items.forEach(item => {
        const text = item.str.trim();
        const y = item.transform[5];
        const normalizedY = y / pageHeight; // Normalize position (0-1)

        // Skip empty text
        if (!text || text.length === 0) return;

        // Check if it's in header/footer region (top 10% or bottom 10%)
        const isHeaderRegion = normalizedY > 0.9;
        const isFooterRegion = normalizedY < 0.1;

        if (isHeaderRegion || isFooterRegion) {
          const key = `${text}:${normalizedY.toFixed(2)}`;
          textPositionMap.set(key, (textPositionMap.get(key) || 0) + 1);
        }
      });
    });

    // Mark text that appears on multiple pages as repetitive
    const threshold = Math.max(2, Math.floor(allPagesData.length * 0.3)); // At least 30% of pages
    textPositionMap.forEach((count, key) => {
      if (count >= threshold) {
        const [text] = key.split(':');
        repetitiveElements.add(text);
      }
    });

    // Also filter common page number patterns
    allPagesData.forEach(({ textContent }) => {
      textContent.items.forEach(item => {
        const text = item.str.trim();
        if (isPageNumber(text)) {
          repetitiveElements.add(text);
        }
      });
    });

    return repetitiveElements;
  }

  function isPageNumber(text) {
    // Match common page number patterns
    return /^[\d\s\-–—]+$/.test(text) || // Just digits and dashes
           /^Page\s+\d+$/i.test(text) ||  // "Page N"
           /^\d+\s*of\s*\d+$/i.test(text) || // "N of M"
           /^\[\d+\]$/.test(text);        // [N]
  }

  function extractPageText(textContent, pageHeight, pageWidth, repetitiveElements) {
    let pageText = '';
    let currentParagraph = '';
    let lastY = null;
    let lastHeight = null;
    let lastX = null;

    textContent.items.forEach((item, index) => {
      const text = item.str.trim();
      const y = item.transform[5];
      const x = item.transform[4];
      const height = item.height || 12;
      const normalizedY = y / pageHeight;

      // Skip if empty
      if (!text || text.length === 0) return;

      // Filter out repetitive elements (headers/footers/page numbers)
      if (repetitiveElements.has(text)) {
        return;
      }

      // Filter out header/footer regions
      if (normalizedY > 0.9 || normalizedY < 0.1) {
        return;
      }

      // Detect paragraph breaks
      if (lastY !== null) {
        const yDiff = Math.abs(y - lastY);
        const xDiff = lastX !== null ? Math.abs(x - lastX) : 0;

        // Large vertical gap = paragraph break
        if (yDiff > height * 1.5) {
          if (currentParagraph.trim()) {
            pageText += currentParagraph.trim() + '\n\n';
            currentParagraph = '';
          }
        }
        // Small vertical change = same line or next line in same paragraph
        else if (yDiff > 2) {
          // Check if it's a new line within the same paragraph
          if (currentParagraph && !currentParagraph.endsWith(' ')) {
            currentParagraph += ' ';
          }
        }
        // Same line, add space if needed
        else if (xDiff > height * 0.5) {
          if (currentParagraph && !currentParagraph.endsWith(' ')) {
            currentParagraph += ' ';
          }
        }
      }

      currentParagraph += text;
      lastY = y;
      lastX = x;
      lastHeight = height;
    });

    // Add remaining paragraph
    if (currentParagraph.trim()) {
      pageText += currentParagraph.trim() + '\n\n';
    }

    return pageText;
  }

  function renderMarkdown(text) {
    const contentDiv = document.getElementById('extractedContent');

    try {
      // Use marked.js if available
      if (typeof marked !== 'undefined') {
        marked.setOptions({
          breaks: true,
          gfm: true,
          headerIds: false,
          mangle: false
        });
        contentDiv.innerHTML = marked.parse(text);
      } else {
        // Fallback to plain text
        contentDiv.innerHTML = '<pre>' + escapeHtml(text) + '</pre>';
      }
    } catch (error) {
      console.error('[Text Extract] Markdown render error:', error);
      contentDiv.innerHTML = '<pre>' + escapeHtml(text) + '</pre>';
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showError(message) {
    const contentDiv = document.getElementById('extractedContent');
    const paperContainer = document.querySelector('.paper-container');
    const emptyState = document.getElementById('extractionEmptyState');
    const loadingDiv = document.getElementById('extractionLoading');
    emptyState?.setAttribute('hidden', 'hidden');
    paperContainer?.removeAttribute('hidden');
    if (loadingDiv) loadingDiv.style.display = 'none';
    contentDiv.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
  }

  async function copyAsText() {
    if (!extractionCompleted) {
      await extractAllText();
    }

    if (!hasReadableText(extractedText)) {
      showToast('No readable text found', true);
      return;
    }

    try {
      // Remove markdown formatting for plain text
      const plainText = extractedText
        .replace(/^#+\s+/gm, '') // Remove headers
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.+?)\*/g, '$1') // Remove italic
        .trim();

      await navigator.clipboard.writeText(plainText);
      showToast('Text copied to clipboard');
    } catch (error) {
      console.error('[Text Extract] Copy error:', error);
      showToast('Failed to copy text', true);
    }
  }

  async function copyAsMarkdown() {
    if (!extractionCompleted) {
      await extractAllText();
    }

    if (!hasReadableText(extractedText)) {
      showToast('No readable text found', true);
      return;
    }

    try {
      await navigator.clipboard.writeText(extractedText);
      showToast('Markdown copied to clipboard');
    } catch (error) {
      console.error('[Text Extract] Copy error:', error);
      showToast('Failed to copy markdown', true);
    }
  }

  function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification' + (isError ? ' error' : '');
    toast.textContent = message;
    toast.setAttribute('role', isError ? 'alert' : 'status');
    toast.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

})();
