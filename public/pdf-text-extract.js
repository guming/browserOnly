// PDF Text Extraction with Markdown Rendering
// This script adds text extraction functionality to PDF.js viewer

(function() {
  'use strict';

  let extractedText = '';
  let isTextPanelOpen = false;

  // Create a global namespace for sharing data between scripts
  window.PDFTextExtractor = window.PDFTextExtractor || {};

  // Expose getters for extracted text
  window.PDFTextExtractor.getExtractedText = function() {
    return extractedText;
  };

  window.PDFTextExtractor.hasExtractedText = function() {
    return extractedText && extractedText.length > 0;
  };

  window.PDFTextExtractor.triggerExtraction = function() {
    if (!extractedText) {
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

    // Load saved state
    const savedState = localStorage.getItem('pdfTextPanelOpen');
    if (savedState === 'true') {
      openTextPanel();
    }
  }

  async function toggleTextPanel() {
    if (isTextPanelOpen) {
      closeTextPanel();
    } else {
      openTextPanel();
    }
  }

  function openTextPanel() {
    const panel = document.getElementById('textExtractionPanel');
    const button = document.getElementById('extractTextButton');

    if (!panel) return;

    panel.classList.add('open');
    button?.classList.add('active');
    document.body.classList.add('text-panel-open');
    isTextPanelOpen = true;
    localStorage.setItem('pdfTextPanelOpen', 'true');

    // Extract text if not already done
    if (!extractedText) {
      extractAllText();
    }
  }

  function closeTextPanel() {
    const panel = document.getElementById('textExtractionPanel');
    const button = document.getElementById('extractTextButton');

    if (!panel) return;

    panel.classList.remove('open');
    button?.classList.remove('active');
    document.body.classList.remove('text-panel-open');
    isTextPanelOpen = false;
    localStorage.setItem('pdfTextPanelOpen', 'false');
  }

  async function extractAllText() {
    const contentDiv = document.getElementById('extractedContent');
    const loadingDiv = document.getElementById('extractionLoading');

    if (!PDFViewerApplication.pdfDocument) {
      showError('No PDF document loaded');
      return;
    }

    try {
      loadingDiv.style.display = 'flex';
      contentDiv.innerHTML = '';

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
        document.getElementById('extractionProgress').textContent = `Analyzing pages ${pageNum}/${numPages} (${progress}%)`;
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
        document.getElementById('extractionProgress').textContent = `Extracting page ${pageNum}/${numPages} (${progress}%)`;
      }

      extractedText = fullText;
      renderMarkdown(extractedText);
      loadingDiv.style.display = 'none';

      return fullText;

    } catch (error) {
      console.error('[Text Extract] Error:', error);
      showError('Failed to extract text: ' + error.message);
      loadingDiv.style.display = 'none';
      throw error;
    }
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
    contentDiv.innerHTML = `<div class="error-message">${escapeHtml(message)}</div>`;
  }

  async function copyAsText() {
    if (!extractedText) {
      await extractAllText();
    }

    try {
      // Remove markdown formatting for plain text
      const plainText = extractedText
        .replace(/^#+\s+/gm, '') // Remove headers
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.+?)\*/g, '$1') // Remove italic
        .trim();

      await navigator.clipboard.writeText(plainText);
      showToast('Text copied to clipboard!');
    } catch (error) {
      console.error('[Text Extract] Copy error:', error);
      showToast('Failed to copy text', true);
    }
  }

  async function copyAsMarkdown() {
    if (!extractedText) {
      await extractAllText();
    }

    try {
      await navigator.clipboard.writeText(extractedText);
      showToast('Markdown copied to clipboard!');
    } catch (error) {
      console.error('[Text Extract] Copy error:', error);
      showToast('Failed to copy markdown', true);
    }
  }

  function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification' + (isError ? ' error' : '');
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

})();
