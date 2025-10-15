// PDF AI Assistant
// Adds AI-powered chat functionality to PDF viewer

(function() {
  'use strict';

  // State
  let chatHistory = [];
  let isAiProcessing = false;
  let currentPageNumber = 1;

  // System prompt for PDF assistant
  const PDF_ASSISTANT_SYSTEM_PROMPT = `You are a helpful PDF assistant. Your role is to help users understand and analyze PDF documents.

You can:
- Summarize pages or entire documents
- Answer questions about the content
- Explain complex concepts
- Find specific information
- Provide insights and analysis

When summarizing, be concise but comprehensive. When answering questions, cite specific parts of the document when possible.

The user will provide you with PDF text content, and you should help them understand it better.`;

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    initializeAiAssistant();
  });

  function initializeAiAssistant() {
    // Wait for PDFViewerApplication to be ready
    if (typeof PDFViewerApplication === 'undefined') {
      setTimeout(initializeAiAssistant, 100);
      return;
    }

    console.log('[AI Assistant] Initializing...');

    // Setup tab switching
    setupTabSwitching();

    // Setup AI assistant event listeners
    setupAiEventListeners();

    // Listen for page changes
    PDFViewerApplication.eventBus.on('pagechanging', function(evt) {
      currentPageNumber = evt.pageNumber;
    });

    console.log('[AI Assistant] Initialized successfully');
  }

  function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', function() {
        const targetTab = this.dataset.tab;

        // Remove active class from all tabs and contents
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        // Add active class to clicked tab and corresponding content
        this.classList.add('active');
        const targetContent = document.getElementById(targetTab + 'Tab');
        if (targetContent) {
          targetContent.classList.add('active');
        }

        console.log('[AI Assistant] Switched to tab:', targetTab);
      });
    });
  }

  function setupAiEventListeners() {
    // Send message button
    const sendBtn = document.getElementById('aiSendBtn');
    const chatInput = document.getElementById('aiChatInput');

    if (sendBtn) {
      sendBtn.addEventListener('click', handleSendMessage);
    }

    // Enter key to send (Shift+Enter for new line)
    if (chatInput) {
      chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSendMessage();
        }
      });
    }

    // Summarize current page button
    const summarizePageBtn = document.getElementById('summarizePageBtn');
    if (summarizePageBtn) {
      summarizePageBtn.addEventListener('click', handleSummarizePage);
    }

    // Summarize all button
    const summarizeAllBtn = document.getElementById('summarizeAllBtn');
    if (summarizeAllBtn) {
      summarizeAllBtn.addEventListener('click', handleSummarizeAll);
    }

    // Clear chat button
    const clearChatBtn = document.getElementById('clearChatBtn');
    if (clearChatBtn) {
      clearChatBtn.addEventListener('click', handleClearChat);
    }
  }

  async function handleSendMessage() {
    const chatInput = document.getElementById('aiChatInput');
    const message = chatInput.value.trim();

    if (!message || isAiProcessing) {
      return;
    }

    // Clear input
    chatInput.value = '';

    // Add user message to chat
    addMessageToChat('user', message);

    // Send to AI with context
    await sendToAi(message);
  }

  async function handleSummarizePage() {
    console.log('[PDF AI Assistant] handleSummarizePage called for page:', currentPageNumber);

    if (isAiProcessing) {
      console.log('[PDF AI Assistant] Already processing, ignoring request');
      return;
    }

    try {
      // Ensure text is extracted first
      console.log('[PDF AI Assistant] Checking if text is extracted...');
      if (!window.PDFTextExtractor || !window.PDFTextExtractor.hasExtractedText()) {
        console.log('[PDF AI Assistant] Text not extracted yet, triggering extraction...');
        showToast('Extracting text from PDF...', false);
        await window.PDFTextExtractor.triggerExtraction();
        console.log('[PDF AI Assistant] Text extraction completed');
      } else {
        console.log('[PDF AI Assistant] Text already extracted, using cached version');
      }

      const fullText = window.PDFTextExtractor.getExtractedText();
      console.log('[PDF AI Assistant] Full text length:', fullText?.length);

      if (!fullText || fullText.trim().length === 0) {
        console.log('[PDF AI Assistant] Error: No text found in PDF');
        showToast('No text found in PDF', true);
        return;
      }

      // Extract text for the current page from the full extracted text
      const pageMarker = `## Page ${currentPageNumber}`;
      const nextPageMarker = `## Page ${currentPageNumber + 1}`;

      console.log('[PDF AI Assistant] Looking for page markers:', { pageMarker, nextPageMarker });

      const pageStartIndex = fullText.indexOf(pageMarker);
      if (pageStartIndex === -1) {
        console.log('[PDF AI Assistant] Error: Could not find page marker in text');
        showToast('Could not find current page in extracted text', true);
        return;
      }

      const nextPageIndex = fullText.indexOf(nextPageMarker, pageStartIndex);
      const pageText = nextPageIndex === -1
        ? fullText.substring(pageStartIndex)
        : fullText.substring(pageStartIndex, nextPageIndex);

      console.log('[PDF AI Assistant] Extracted page text:', {
        pageStartIndex,
        nextPageIndex,
        pageTextLength: pageText.length,
        preview: pageText.substring(0, 100) + '...'
      });

      if (!pageText || pageText.trim().length === 0) {
        console.log('[PDF AI Assistant] Error: No text found on this page');
        showToast('No text found on this page', true);
        return;
      }

      const prompt = `Please summarize the following text from page ${currentPageNumber}:\n\n${pageText}`;
      console.log('[PDF AI Assistant] Sending summarization request for page', currentPageNumber);
      await sendToAi(prompt, `Summarize Page ${currentPageNumber}`);
    } catch (error) {
      console.error('[PDF AI Assistant] Error summarizing page:', error);
      console.error('[PDF AI Assistant] Error stack:', error.stack);
      showToast('Failed to summarize page', true);
    }
  }

  async function handleSummarizeAll() {
    console.log('[PDF AI Assistant] handleSummarizeAll called');

    if (isAiProcessing) {
      console.log('[PDF AI Assistant] Already processing, ignoring request');
      return;
    }

    try {
      showLoading(true);

      // Ensure text is extracted first
      console.log('[PDF AI Assistant] Checking if text is extracted...');
      if (!window.PDFTextExtractor || !window.PDFTextExtractor.hasExtractedText()) {
        console.log('[PDF AI Assistant] Text not extracted yet, triggering extraction...');
        showToast('Extracting text from PDF...', false);
        await window.PDFTextExtractor.triggerExtraction();
        console.log('[PDF AI Assistant] Text extraction completed');
      } else {
        console.log('[PDF AI Assistant] Text already extracted, using cached version');
      }

      const fullText = window.PDFTextExtractor.getExtractedText();
      console.log('[PDF AI Assistant] Full text length:', fullText?.length);

      if (!fullText || fullText.trim().length === 0) {
        console.log('[PDF AI Assistant] Error: No text found in the document');
        showToast('No text found in the document', true);
        showLoading(false);
        return;
      }

      const prompt = `Please provide a comprehensive summary of this entire document:\n\n${fullText}`;
      console.log('[PDF AI Assistant] Sending summarization request for entire document');
      console.log('[PDF AI Assistant] Prompt length:', prompt.length);
      await sendToAi(prompt, 'Summarize Entire Document');
    } catch (error) {
      console.error('[PDF AI Assistant] Error summarizing document:', error);
      console.error('[PDF AI Assistant] Error stack:', error.stack);
      showToast('Failed to summarize document', true);
      showLoading(false);
    }
  }

  function handleClearChat() {
    if (confirm('Are you sure you want to clear the chat history?')) {
      chatHistory = [];
      const messagesContainer = document.getElementById('aiChatMessages');
      if (messagesContainer) {
        // Keep only the welcome message
        messagesContainer.innerHTML = `
          <div class="ai-welcome-message">
            <div class="ai-message assistant">
              <div class="ai-message-content">
                👋 Hello! I'm your PDF AI Assistant. I can help you:
                <ul>
                  <li>Summarize pages or the entire document</li>
                  <li>Answer questions about the content</li>
                  <li>Explain complex concepts</li>
                  <li>Find specific information</li>
                </ul>
                Try clicking "Summarize This Page" or ask me a question!
              </div>
            </div>
          </div>
        `;
      }
      showToast('Chat cleared');
    }
  }

  async function sendToAi(prompt, displayPrompt = null) {
    console.log('[PDF AI Assistant] sendToAi called:', {
      promptLength: prompt.length,
      displayPrompt: displayPrompt,
      historyLength: chatHistory.length,
      isProcessing: isAiProcessing
    });

    try {
      isAiProcessing = true;
      showLoading(true);
      updateSendButton(true);

      // Show user message if displayPrompt is provided
      if (displayPrompt) {
        console.log('[PDF AI Assistant] Adding user message to chat:', displayPrompt);
        addMessageToChat('user', displayPrompt);
      }

      // Send message to background script to communicate with SimpleChatAgent
      console.log('[PDF AI Assistant] Sending message to background script...');
      const messagePayload = {
        action: 'pdfAiChat',
        message: prompt,
        systemPrompt: PDF_ASSISTANT_SYSTEM_PROMPT,
        chatHistory: chatHistory
      };
      console.log('[PDF AI Assistant] Message payload:', {
        action: messagePayload.action,
        messageLength: messagePayload.message.length,
        systemPromptLength: messagePayload.systemPrompt.length,
        historyLength: messagePayload.chatHistory.length
      });

      const startTime = Date.now();
      const response = await chrome.runtime.sendMessage(messagePayload);
      const duration = Date.now() - startTime;

      console.log('[PDF AI Assistant] Received response from background:', {
        success: response?.success,
        hasResponse: !!response?.response,
        responseLength: response?.response?.length,
        duration: `${duration}ms`,
        error: response?.error
      });

      if (response && response.success) {
        console.log('[PDF AI Assistant] Adding assistant response to chat');
        addMessageToChat('assistant', response.response);
        chatHistory.push(
          { role: 'user', content: prompt },
          { role: 'assistant', content: response.response }
        );
        console.log('[PDF AI Assistant] Chat history updated. Total messages:', chatHistory.length);
      } else {
        console.error('[PDF AI Assistant] Response error:', response?.error);
        throw new Error(response?.error || 'Failed to get AI response');
      }

    } catch (error) {
      console.error('[PDF AI Assistant] Error caught:', error);
      console.error('[PDF AI Assistant] Error stack:', error.stack);
      addMessageToChat('assistant', '❌ Sorry, I encountered an error. Please make sure the extension is properly configured with an API key.');
      showToast('AI request failed', true);
    } finally {
      console.log('[PDF AI Assistant] sendToAi completed, cleaning up...');
      isAiProcessing = false;
      showLoading(false);
      updateSendButton(false);
    }
  }


  function addMessageToChat(role, content) {
    if (typeof document === 'undefined') {
      console.error('[PDF AI Assistant] Cannot add message: document not available');
      return;
    }

    const messagesContainer = document.getElementById('aiChatMessages');
    if (!messagesContainer) {
      console.warn('[PDF AI Assistant] Messages container not found');
      return;
    }

    try {
      const messageDiv = document.createElement('div');
      messageDiv.className = `ai-message ${role}`;

      const contentDiv = document.createElement('div');
      contentDiv.className = 'ai-message-content';

      // Support markdown-like formatting
      const formattedContent = formatMessage(content);
      contentDiv.innerHTML = formattedContent;

      messageDiv.appendChild(contentDiv);
      messagesContainer.appendChild(messageDiv);

      // Scroll to bottom
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
      console.error('[PDF AI Assistant] Error adding message to chat:', error);
    }
  }

  function formatMessage(text) {
    // Basic markdown-like formatting
    let formatted = text;

    // Escape HTML first
    formatted = escapeHtml(formatted);

    // Convert **bold** to <strong>
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Convert *italic* to <em>
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Convert line breaks to <br>
    formatted = formatted.replace(/\n/g, '<br>');

    // Convert numbered lists
    formatted = formatted.replace(/^(\d+)\.\s(.+?)(<br>|$)/gm, '<li>$2</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)+/g, '<ol>$&</ol>');

    // Convert bullet points
    formatted = formatted.replace(/^[-•]\s(.+?)(<br>|$)/gm, '<li>$1</li>');
    formatted = formatted.replace(/(<li>.*<\/li>)+/g, '<ul>$&</ul>');

    return formatted;
  }

  function escapeHtml(text) {
    if (!text) return '';

    // Safely escape HTML without using document.createElement
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };

    return String(text).replace(/[&<>"']/g, function(char) {
      return map[char];
    });
  }

  function showLoading(show) {
    const loadingIndicator = document.getElementById('aiLoadingIndicator');
    if (loadingIndicator) {
      if (show) {
        loadingIndicator.classList.remove('hidden');
      } else {
        loadingIndicator.classList.add('hidden');
      }
    }
  }

  function updateSendButton(disabled) {
    const sendBtn = document.getElementById('aiSendBtn');
    if (sendBtn) {
      sendBtn.disabled = disabled;
    }
  }

  function showToast(message, isError = false) {
    if (typeof document === 'undefined' || !document.body) {
      console.warn('[PDF AI Assistant] Cannot show toast: document not available');
      return;
    }

    try {
      const toast = document.createElement('div');
      toast.className = 'toast-notification' + (isError ? ' error' : '');
      toast.textContent = message;
      document.body.appendChild(toast);

      setTimeout(() => toast.classList.add('show'), 10);
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 2000);
    } catch (error) {
      console.error('[PDF AI Assistant] Error showing toast:', error);
    }
  }

  // Export for testing
  window.PDFAiAssistant = {
    addMessageToChat,
    sendToAi: sendToAi,
    clearChat: handleClearChat
  };

})();
