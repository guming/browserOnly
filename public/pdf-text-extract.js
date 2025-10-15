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
      let fullText = '';

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await PDFViewerApplication.pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Add page header
        fullText += `\n\n## Page ${pageNum}\n\n`;

        // Extract text items
        let currentLine = '';
        let lastY = null;

        textContent.items.forEach((item, index) => {
          const text = item.str;
          const y = item.transform[5];

          // Detect new line by Y position change
          if (lastY !== null && Math.abs(y - lastY) > 5) {
            if (currentLine.trim()) {
              fullText += currentLine.trim() + '\n';
            }
            currentLine = '';
          }

          currentLine += text;
          if (item.hasEOL || index === textContent.items.length - 1) {
            if (currentLine.trim()) {
              fullText += currentLine.trim() + '\n';
            }
            currentLine = '';
          }

          lastY = y;
        });

        // Update progress
        const progress = Math.round((pageNum / numPages) * 100);
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
