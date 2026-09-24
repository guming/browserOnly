// PDF AI Assistant
// Provides document-grounded chat, learning guides, open questions, and quizzes.

(function() {
  'use strict';

  let chatHistory = [];
  let isAiProcessing = false;
  let currentPageNumber = 1;
  let learningGuideCache = null;
  let learningMode = 'chat';
  let openQuestion = null;
  let quizState = null;

  const PDF_ASSISTANT_SYSTEM_PROMPT = `
You are a careful PDF reading mentor. Base every factual claim on the supplied document.
Help the user understand the document, explain difficult concepts, test understanding, and identify limitations.
Do not invent sections, page references, evidence, or conclusions. If the document does not support an answer, say so.
Respond in the language used by the user. Prefer concise, specific explanations over generic study advice.
`;

  document.addEventListener('DOMContentLoaded', initializeAiAssistant);

  function initializeAiAssistant() {
    if (typeof PDFViewerApplication === 'undefined') {
      setTimeout(initializeAiAssistant, 100);
      return;
    }

    setupTabSwitching();
    setupAiEventListeners();
    PDFViewerApplication.eventBus.on('pagechanging', event => {
      currentPageNumber = event.pageNumber;
    });
  }

  function setupTabSwitching() {
    const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
    const tabContents = Array.from(document.querySelectorAll('.tab-content'));

    tabButtons.forEach(button => {
      button.addEventListener('click', function() {
        const targetTab = this.dataset.tab;
        tabButtons.forEach(tab => {
          tab.classList.remove('active');
          tab.setAttribute('aria-selected', 'false');
          tab.setAttribute('tabindex', '-1');
        });
        tabContents.forEach(content => {
          content.classList.remove('active');
          content.setAttribute('hidden', 'hidden');
        });

        this.classList.add('active');
        this.setAttribute('aria-selected', 'true');
        this.setAttribute('tabindex', '0');
        const targetContent = document.getElementById(`${targetTab}Tab`);
        targetContent?.classList.add('active');
        targetContent?.removeAttribute('hidden');
      });

      button.addEventListener('keydown', function(event) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const currentIndex = tabButtons.indexOf(this);
        let nextIndex = currentIndex;
        if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabButtons.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabButtons.length - 1;
        event.preventDefault();
        tabButtons[nextIndex].focus();
        tabButtons[nextIndex].click();
      });
    });
  }

  function setupAiEventListeners() {
    const sendBtn = document.getElementById('aiSendBtn');
    const chatInput = document.getElementById('aiChatInput');

    sendBtn?.addEventListener('click', handleSendMessage);
    chatInput?.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
      }
    });

    document.getElementById('learningGuideBtn')?.addEventListener('click', handleLearningGuide);
    document.getElementById('askOneBtn')?.addEventListener('click', handleAskOne);
    document.getElementById('startQuizBtn')?.addEventListener('click', handleStartQuiz);
    document.getElementById('summarizePageBtn')?.addEventListener('click', handleSummarizePage);
    document.getElementById('summarizeAllBtn')?.addEventListener('click', handleSummarizeAll);
    document.getElementById('clearChatBtn')?.addEventListener('click', handleClearChat);
  }

  async function handleSendMessage() {
    const chatInput = document.getElementById('aiChatInput');
    const message = chatInput?.value.trim();
    if (!message || isAiProcessing) return;

    chatInput.value = '';
    addMessageToChat('user', message);

    if (learningMode === 'awaiting-open-answer' && openQuestion) {
      await evaluateOpenAnswer(message);
      return;
    }

    learningMode = 'chat';
    try {
      const fullText = await ensureDocumentText();
      await runTextTask(`${message}\n\nPDF text:\n${fullText}`, null, true);
    } catch (error) {
      handleAiError(error, 'We could not answer that question.');
    }
  }

  async function handleLearningGuide() {
    if (isAiProcessing) return;
    if (learningGuideCache) {
      renderLearningGuide(learningGuideCache);
      return;
    }

    try {
      const fullText = await ensureDocumentText();
      const pageCount = PDFViewerApplication.pdfDocument?.numPages || 0;
      const prompt = `Create a learning guide for the PDF below. Do not summarize the document.
Return only valid JSON with this shape:
{
  "whyItMatters": "one specific sentence",
  "outcomes": [{"title": "specific capability", "description": "what the reader will understand"}],
  "prerequisites": {"required": ["topic"], "helpful": ["topic"]},
  "readingPath": [{"step": 1, "goal": "learning goal", "focus": "what to inspect", "pages": [1, 2]}],
  "attentionPoints": ["important definition, reasoning step, figure, assumption, or limitation"],
  "completionCriteria": ["observable evidence of understanding"]
}
Rules:
- Provide 4 to 6 outcomes and 3 to 5 reading steps.
- Use measurable verbs such as explain, compare, identify, apply, or evaluate.
- Never invent a section, figure, concept, or page number.
- Page numbers must be between 1 and ${pageCount}. Use an empty array when page evidence is uncertain.
- Write in the language that best matches the document.

PDF text:
${fullText}`;

      const guide = await runStructuredTask(prompt, validateLearningGuide, 'Building learning guide');
      learningGuideCache = guide;
      learningMode = 'guide';
      renderLearningGuide(guide);
    } catch (error) {
      handleAiError(error, 'We could not build a learning guide for this document.');
    }
  }

  async function handleAskOne() {
    if (isAiProcessing) return;
    try {
      const fullText = await ensureDocumentText();
      const previousQuestions = chatHistory
        .filter(item => item.role === 'assistant')
        .map(item => item.content)
        .slice(-6)
        .join('\n');
      const prompt = `Ask exactly one open-ended question that tests a central idea in this PDF.
Return only valid JSON: {"question":"...","focus":"...","rubric":["required idea"]}.
The question must test explanation, reasoning, application, or critique. It must be answerable from the PDF, must not reveal the answer, and must not be a generic factual lookup.
Avoid repeating these recent assistant messages:
${previousQuestions}

PDF text:
${fullText}`;

      openQuestion = await runStructuredTask(prompt, validateOpenQuestion, 'Preparing one question');
      chatHistory.push({ role: 'assistant', content: `Question: ${openQuestion.question}` });
      learningMode = 'awaiting-open-answer';
      renderOpenQuestion(openQuestion);
      setComposerPrompt('Write your answer in your own words...');
    } catch (error) {
      handleAiError(error, 'We could not prepare a question for this document.');
    }
  }

  async function evaluateOpenAnswer(answer) {
    try {
      const fullText = await ensureDocumentText();
      const prompt = `Evaluate the user's answer using only the PDF evidence and the rubric.
Return only valid JSON:
{"assessment":"Understood|Partly understood|Review needed","correct":["what is right"],"missing":["missing or inaccurate point"],"strongerAnswer":"concise model answer"}.
Do not penalize wording differences. Distinguish an incomplete answer from an incorrect one.

Question: ${openQuestion.question}
Rubric: ${JSON.stringify(openQuestion.rubric)}
User answer: ${answer}

PDF text:
${fullText}`;

      const result = await runStructuredTask(prompt, validateAssessment, 'Reviewing your answer');
      learningMode = 'open-complete';
      renderOpenAssessment(result);
      setComposerPrompt('Ask another question about this PDF...');
    } catch (error) {
      learningMode = 'awaiting-open-answer';
      handleAiError(error, 'We could not review your answer. Your response is still available above.');
    }
  }

  async function handleStartQuiz() {
    if (isAiProcessing) return;
    try {
      const fullText = await ensureDocumentText();
      const prompt = `Create a five-question multiple-choice quiz covering the most important ideas in this PDF.
Return only valid JSON:
{"title":"short quiz title","questions":[{"id":"q1","question":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"document-grounded explanation"}]}.
Rules:
- Return exactly 5 questions and exactly 4 options per question.
- There must be exactly one correct option.
- Cover core concepts, method or reasoning, evidence or conclusion, and limitation or application.
- Distractors must be plausible but contradicted by or unsupported by the PDF.
- Do not use all-of-the-above or trick questions.

PDF text:
${fullText}`;

      const quiz = await runStructuredTask(prompt, validateQuiz, 'Preparing five questions');
      quizState = {
        title: quiz.title,
        questions: quiz.questions,
        currentIndex: 0,
        answers: [],
        selectedIndex: null,
        revealed: false
      };
      learningMode = 'quiz';
      renderQuizQuestion();
    } catch (error) {
      handleAiError(error, 'We could not prepare a quiz for this document.');
    }
  }

  async function handleSummarizePage() {
    if (isAiProcessing) return;
    try {
      const fullText = await ensureDocumentText();
      const pageText = extractPageText(fullText, currentPageNumber);
      if (!pageText) throw new Error('Could not find the current page in extracted text');
      await runTextTask(
        `Summarize page ${currentPageNumber}. Focus on its claims, reasoning, and relevance.\n\n${pageText}`,
        `Summarize page ${currentPageNumber}`
      );
    } catch (error) {
      handleAiError(error, 'We could not summarize the current page.');
    }
  }

  async function handleSummarizeAll() {
    if (isAiProcessing) return;
    try {
      const fullText = await ensureDocumentText();
      await runTextTask(
        `Summarize this document using: central question, main argument, method or reasoning, evidence, implications, and limitations.\n\n${fullText}`,
        'Summarize document'
      );
    } catch (error) {
      handleAiError(error, 'We could not summarize this document.');
    }
  }

  async function ensureDocumentText() {
    if (!window.PDFTextExtractor) throw new Error('PDF text extraction is unavailable');
    if (!window.PDFTextExtractor.hasExtractedText()) {
      showToast('Extracting text from PDF');
      await window.PDFTextExtractor.triggerExtraction();
    }
    const fullText = window.PDFTextExtractor.getExtractedText();
    if (!fullText || !fullText.replace(/## Page \d+/g, '').trim()) {
      throw new Error('No readable text found in this PDF');
    }
    return fullText;
  }

  function extractPageText(fullText, pageNumber) {
    const marker = `## Page ${pageNumber}`;
    const nextMarker = `## Page ${pageNumber + 1}`;
    const start = fullText.indexOf(marker);
    if (start === -1) return '';
    const end = fullText.indexOf(nextMarker, start);
    return end === -1 ? fullText.slice(start) : fullText.slice(start, end);
  }

  async function runTextTask(prompt, displayPrompt = null, alreadyDisplayed = false) {
    setProcessing(true, 'Preparing an answer');
    if (displayPrompt && !alreadyDisplayed) addMessageToChat('user', displayPrompt);
    try {
      const response = await requestAi(prompt, chatHistory);
      addMessageToChat('assistant', response);
      chatHistory.push(
        { role: 'user', content: prompt },
        { role: 'assistant', content: response }
      );
      return response;
    } finally {
      setProcessing(false);
    }
  }

  async function runStructuredTask(prompt, validator, loadingLabel) {
    setProcessing(true, loadingLabel);
    try {
      let lastError;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const request = attempt === 0
            ? prompt
            : `${prompt}\n\nYour previous response was invalid. Return only the requested JSON object with every required field.`;
          const response = await requestAi(request, []);
          const parsed = parseJsonResponse(response);
          if (!validator(parsed)) throw new Error('The model returned an invalid structured response');
          return parsed;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error('The model returned an invalid structured response');
    } finally {
      setProcessing(false);
    }
  }

  async function requestAi(message, history) {
    const response = await chrome.runtime.sendMessage({
      action: 'pdfAiChat',
      message,
      systemPrompt: PDF_ASSISTANT_SYSTEM_PROMPT,
      chatHistory: history
    });
    if (!response?.success || !response.response) {
      throw new Error(response?.error || 'AI request failed');
    }
    return response.response;
  }

  function parseJsonResponse(response) {
    const cleaned = String(response).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object in AI response');
    return JSON.parse(cleaned.slice(start, end + 1));
  }

  function validateLearningGuide(value) {
    const pageCount = PDFViewerApplication.pdfDocument?.numPages || 0;
    if (!value || typeof value.whyItMatters !== 'string') return false;
    if (!Array.isArray(value.outcomes) || value.outcomes.length < 4 || value.outcomes.length > 6) return false;
    if (!Array.isArray(value.readingPath) || value.readingPath.length < 3 || value.readingPath.length > 5) return false;
    if (!value.prerequisites || !Array.isArray(value.completionCriteria)) return false;
    return value.readingPath.every(step => Array.isArray(step.pages) && step.pages.every(page => Number.isInteger(page) && page >= 1 && page <= pageCount));
  }

  function validateOpenQuestion(value) {
    return Boolean(value && typeof value.question === 'string' && value.question.trim() && Array.isArray(value.rubric) && value.rubric.length > 0);
  }

  function validateAssessment(value) {
    return Boolean(value && ['Understood', 'Partly understood', 'Review needed'].includes(value.assessment) && Array.isArray(value.correct) && Array.isArray(value.missing) && typeof value.strongerAnswer === 'string');
  }

  function validateQuiz(value) {
    return Boolean(value && typeof value.title === 'string' && Array.isArray(value.questions) && value.questions.length === 5 && value.questions.every(question =>
      question.id && typeof question.question === 'string' && Array.isArray(question.options) && question.options.length === 4 && Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex < 4 && typeof question.explanation === 'string'
    ));
  }

  function renderLearningGuide(guide) {
    removeLearningSurfaces();
    const labels = getLearningGuideLabels(guide);
    const surface = createElement('section', 'learning-surface learning-guide-surface');
    surface.setAttribute('aria-label', labels.title);
    surface.append(
      createSectionHeading(labels.title, labels.subtitle),
      createGuideSection(labels.whyItMatters, [guide.whyItMatters]),
      createOutcomeSection(guide.outcomes, labels),
      createPrerequisiteSection(guide.prerequisites, labels),
      createReadingPath(guide.readingPath, labels),
      createGuideSection(labels.payAttention, guide.attentionPoints || []),
      createChecklistSection(guide.completionCriteria, labels)
    );

    const actions = createElement('div', 'learning-surface-actions');
    actions.append(
      createActionButton(labels.askOne, handleAskOne, true),
      createActionButton(labels.startQuiz, handleStartQuiz)
    );
    surface.appendChild(actions);
    appendLearningSurface(surface);
  }

  function createSectionHeading(title, subtitle) {
    const header = createElement('header', 'learning-surface-header');
    header.append(createElement('h2', '', title), createElement('p', '', subtitle));
    return header;
  }

  function createGuideSection(title, items) {
    const section = createElement('section', 'guide-section');
    section.appendChild(createElement('h3', '', title));
    const list = createElement('ul', 'guide-list');
    (items || []).filter(Boolean).forEach(item => list.appendChild(createElement('li', '', item)));
    section.appendChild(list);
    return section;
  }

  function createOutcomeSection(outcomes, labels) {
    const section = createElement('section', 'guide-section');
    section.appendChild(createElement('h3', '', labels.outcomes));
    const list = createElement('ol', 'outcome-list');
    outcomes.forEach(outcome => {
      const item = createElement('li');
      item.append(createElement('strong', '', outcome.title), createElement('span', '', outcome.description));
      list.appendChild(item);
    });
    section.appendChild(list);
    return section;
  }

  function createPrerequisiteSection(prerequisites, labels) {
    const items = [];
    (prerequisites.required || []).forEach(item => items.push(`${labels.required}: ${item}`));
    (prerequisites.helpful || []).forEach(item => items.push(`${labels.helpful}: ${item}`));
    return createGuideSection(labels.prerequisites, items);
  }

  function createReadingPath(steps, labels) {
    const section = createElement('section', 'guide-section');
    section.appendChild(createElement('h3', '', labels.readingPath));
    const list = createElement('ol', 'reading-path');
    steps.forEach(step => {
      const item = createElement('li');
      const pages = step.pages.length ? labels.pages(step.pages) : labels.pagesUncertain;
      item.append(
        createElement('strong', '', step.goal),
        createElement('span', '', step.focus),
        createElement('small', '', pages)
      );
      list.appendChild(item);
    });
    section.appendChild(list);
    return section;
  }

  function createChecklistSection(criteria, labels) {
    const section = createElement('section', 'guide-section');
    section.appendChild(createElement('h3', '', labels.completion));
    const list = createElement('ul', 'completion-list');
    criteria.forEach(item => {
      const row = createElement('li');
      row.append(createElement('span', 'completion-marker', '✓'), createElement('span', '', item));
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  }

  function getLearningGuideLabels(guide) {
    const usesChinese = /[\u3400-\u9fff]/.test(JSON.stringify(guide));
    if (usesChinese) {
      return {
        title: '学习指南',
        subtitle: '梳理学习重点与 PDF 阅读路径',
        whyItMatters: '为什么重要',
        outcomes: '你将理解',
        prerequisites: '阅读前准备',
        required: '必备',
        helpful: '建议了解',
        readingPath: '阅读顺序',
        pages: pages => `第 ${pages.join('、')} 页`,
        pagesUncertain: '跟随概念阅读，页码范围暂不确定',
        payAttention: '阅读时注意',
        completion: '完成标准',
        askOne: '请出一道题',
        startQuiz: '开始测验'
      };
    }
    return {
      title: 'Learning guide',
      subtitle: 'A map of what to learn and how to read this PDF',
      whyItMatters: 'Why this matters',
      outcomes: 'What you will understand',
      prerequisites: 'Know before reading',
      required: 'Required',
      helpful: 'Helpful',
      readingPath: 'Read in this order',
      pages: pages => `Pages ${pages.join(', ')}`,
      pagesUncertain: 'Follow the concept, page range uncertain',
      payAttention: 'Pay attention to',
      completion: 'You are done when',
      askOne: 'Ask me one',
      startQuiz: 'Start quiz'
    };
  }

  function renderOpenQuestion(question) {
    removeLearningSurfaces();
    const surface = createElement('section', 'learning-surface open-question-surface');
    surface.setAttribute('aria-label', 'One question');
    surface.append(
      createElement('div', 'learning-kicker', 'One question'),
      createElement('h2', '', question.question),
      createElement('p', 'learning-hint', 'Answer in your own words. The answer is not shown until you respond.')
    );
    appendLearningSurface(surface);
  }

  function renderOpenAssessment(result) {
    const surface = createElement('section', `learning-surface assessment-surface assessment-${result.assessment.toLowerCase().replace(/\s+/g, '-')}`);
    surface.setAttribute('aria-label', 'Answer assessment');
    surface.appendChild(createElement('div', 'assessment-label', result.assessment));
    surface.append(
      createGuideSection('What you got right', result.correct),
      createGuideSection('What is missing', result.missing),
      createGuideSection('A stronger answer', [result.strongerAnswer])
    );
    const actions = createElement('div', 'learning-surface-actions');
    actions.append(
      createActionButton('Ask another', handleAskOne, true),
      createActionButton('Explain this concept', handleExplainOpenConcept)
    );
    surface.appendChild(actions);
    appendLearningSurface(surface);
  }

  async function handleExplainOpenConcept() {
    try {
      const fullText = await ensureDocumentText();
      await runTextTask(
        `Explain the concept behind this question using only the supplied PDF: ${openQuestion.question}\n\nPDF text:\n${fullText}`,
        'Explain this concept'
      );
    } catch (error) {
      handleAiError(error, 'We could not explain this concept.');
    }
  }

  function renderQuizQuestion() {
    removeLearningSurfaces();
    const question = quizState.questions[quizState.currentIndex];
    const surface = createElement('section', 'learning-surface quiz-surface');
    surface.setAttribute('aria-label', `Quiz question ${quizState.currentIndex + 1} of ${quizState.questions.length}`);
    const progress = createElement('div', 'quiz-progress');
    progress.append(createElement('span', '', quizState.title), createElement('span', '', `${quizState.currentIndex + 1} of ${quizState.questions.length}`));
    surface.append(progress, createElement('h2', '', question.question));

    const options = createElement('div', 'quiz-options');
    question.options.forEach((option, index) => {
      const button = createElement('button', 'quiz-option');
      button.type = 'button';
      button.append(createElement('span', 'quiz-option-letter', String.fromCharCode(65 + index)), createElement('span', '', option));
      button.addEventListener('click', () => selectQuizOption(index));
      options.appendChild(button);
    });
    surface.appendChild(options);
    const feedback = createElement('div', 'quiz-feedback');
    feedback.setAttribute('hidden', 'hidden');
    surface.appendChild(feedback);
    appendLearningSurface(surface);
  }

  function selectQuizOption(selectedIndex) {
    if (quizState.revealed) return;
    quizState.revealed = true;
    quizState.selectedIndex = selectedIndex;
    const question = quizState.questions[quizState.currentIndex];
    const correct = selectedIndex === question.correctIndex;
    quizState.answers.push({ questionId: question.id, selectedIndex, correct });

    const surface = document.querySelector('.quiz-surface');
    Array.from(surface.querySelectorAll('.quiz-option')).forEach((button, index) => {
      button.disabled = true;
      if (index === question.correctIndex) button.classList.add('correct');
      if (index === selectedIndex && !correct) button.classList.add('incorrect');
    });

    const feedback = surface.querySelector('.quiz-feedback');
    feedback.removeAttribute('hidden');
    feedback.append(createElement('strong', '', correct ? 'Correct' : 'Review this'), createElement('p', '', question.explanation));
    feedback.appendChild(createActionButton(quizState.currentIndex === quizState.questions.length - 1 ? 'See results' : 'Next question', advanceQuiz, true));
  }

  function advanceQuiz() {
    if (quizState.currentIndex === quizState.questions.length - 1) {
      renderQuizResults();
      return;
    }
    quizState.currentIndex += 1;
    quizState.selectedIndex = null;
    quizState.revealed = false;
    renderQuizQuestion();
  }

  function renderQuizResults() {
    removeLearningSurfaces();
    const score = quizState.answers.filter(answer => answer.correct).length;
    const surface = createElement('section', 'learning-surface quiz-results');
    surface.setAttribute('aria-label', 'Quiz results');
    surface.append(
      createElement('div', 'learning-kicker', 'Quiz complete'),
      createElement('div', 'quiz-score', `${score} / ${quizState.questions.length}`),
      createElement('p', '', score === 5 ? 'You covered the document’s key ideas well.' : score >= 3 ? 'You have the main structure. Review the missed ideas once more.' : 'Return to the learning guide, then try a new quiz.')
    );

    const missed = quizState.answers.filter(answer => !answer.correct);
    if (missed.length) {
      const list = createElement('ul', 'quiz-review-list');
      missed.forEach(answer => {
        const question = quizState.questions.find(item => item.id === answer.questionId);
        list.appendChild(createElement('li', '', question.question));
      });
      surface.append(createElement('h3', '', 'Review these ideas'), list);
    }

    const actions = createElement('div', 'learning-surface-actions');
    actions.append(createActionButton('New quiz', handleStartQuiz, true), createActionButton('Open learning guide', handleLearningGuide));
    surface.appendChild(actions);
    appendLearningSurface(surface);
    learningMode = 'quiz-complete';
  }

  function createActionButton(label, handler, primary = false) {
    const button = createElement('button', `learning-action${primary ? ' primary' : ''}`, label);
    button.type = 'button';
    button.addEventListener('click', handler);
    return button;
  }

  function createElement(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== '') element.textContent = text;
    return element;
  }

  function appendLearningSurface(surface) {
    const messages = document.getElementById('aiChatMessages');
    messages?.appendChild(surface);
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  function removeLearningSurfaces() {
    document.querySelectorAll('.learning-surface').forEach(surface => surface.remove());
  }

  function addMessageToChat(role, content) {
    const messages = document.getElementById('aiChatMessages');
    if (!messages) return;
    const message = createElement('div', `ai-message ${role}`);
    const contentElement = createElement('div', 'ai-message-content');
    contentElement.innerHTML = formatMessage(content);
    message.append(createElement('div', 'ai-message-label', role === 'user' ? 'You' : 'Assistant'), contentElement);
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
  }

  function formatMessage(text) {
    let formatted = escapeHtml(text || '');
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/^[-•]\s(.+)$/gm, '<li>$1</li>');
    formatted = formatted.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    return formatted.replace(/\n/g, '<br>');
  }

  function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, character => map[character]);
  }

  function setProcessing(processing, label = 'Preparing an answer') {
    isAiProcessing = processing;
    const indicator = document.getElementById('aiLoadingIndicator');
    const indicatorLabel = indicator?.querySelector('span');
    if (indicatorLabel) indicatorLabel.textContent = label;
    indicator?.classList.toggle('hidden', !processing);
    document.getElementById('aiChatMessages')?.setAttribute('aria-busy', processing ? 'true' : 'false');
    const sendButton = document.getElementById('aiSendBtn');
    if (sendButton) sendButton.disabled = processing;
    document.querySelectorAll('.ai-panel-actions button').forEach(button => {
      button.disabled = processing;
    });
  }

  function setComposerPrompt(placeholder) {
    const input = document.getElementById('aiChatInput');
    if (input) {
      input.placeholder = placeholder;
      input.focus();
    }
  }

  function handleAiError(error, fallbackMessage) {
    console.error('[PDF AI Assistant]', error);
    addMessageToChat('assistant', `${fallbackMessage}\n\n${error.message || 'Check the model configuration and try again.'}`);
    showToast('AI request failed', true);
    setProcessing(false);
  }

  function handleClearChat() {
    if (!confirm('Are you sure you want to clear the chat history and learning session?')) return;
    chatHistory = [];
    learningGuideCache = null;
    learningMode = 'chat';
    openQuestion = null;
    quizState = null;
    const messages = document.getElementById('aiChatMessages');
    if (messages) {
      messages.innerHTML = `
        <div class="ai-welcome-message">
          <div class="ai-message assistant">
            <div class="ai-message-label">Assistant</div>
            <div class="ai-message-content">
              Build a path through this document, then check what you understood:
              <ul>
                <li>See what you will understand and how to read it</li>
                <li>Answer one open question about a key idea</li>
                <li>Take a five-question quiz</li>
              </ul>
              Choose a learning action above or ask your own question below.
            </div>
          </div>
        </div>`;
    }
    setComposerPrompt('Ask a question about this PDF...');
    showToast('Learning session cleared');
  }

  function showToast(message, isError = false) {
    const toast = createElement('div', `toast-notification${isError ? ' error' : ''}`, message);
    toast.setAttribute('role', isError ? 'alert' : 'status');
    toast.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2200);
  }

  window.PDFAiAssistant = {
    addMessageToChat,
    sendToAi: runTextTask,
    clearChat: handleClearChat,
    buildLearningGuide: handleLearningGuide,
    askOne: handleAskOne,
    startQuiz: handleStartQuiz
  };
})();
