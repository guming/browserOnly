import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const readPublicFile = (filename: string) => readFileSync(
  join(process.cwd(), 'public', filename),
  'utf8',
);

describe('PDF viewer learning features', () => {
  const html = readPublicFile('pdf-viewer.html');
  const assistant = readPublicFile('pdf-ai-assistant.js');
  const extractor = readPublicFile('pdf-text-extract.js');

  test('exposes text, links, and AI assistant tabs', () => {
    expect(html).toContain('id="linksTabButton"');
    expect(html).toContain('aria-controls="linksTab"');
    expect(html).toContain('id="linksTab"');
    expect(html).toContain('id="learningGuideBtn"');
    expect(html).toContain('id="askOneBtn"');
    expect(html).toContain('id="startQuizBtn"');
  });

  test('keeps the existing PDF AI message contract', () => {
    expect(assistant).toContain("action: 'pdfAiChat'");
    expect(assistant).toContain('message,');
    expect(assistant).toContain('systemPrompt: PDF_ASSISTANT_SYSTEM_PROMPT');
    expect(assistant).toContain('chatHistory: history');
  });

  test('defines distinct learning guide, open-question, and quiz flows', () => {
    expect(assistant).toContain('async function handleLearningGuide()');
    expect(assistant).toContain('async function handleAskOne()');
    expect(assistant).toContain('async function evaluateOpenAnswer(answer)');
    expect(assistant).toContain('async function handleStartQuiz()');
    expect(assistant).toContain('questions.length === 5');
  });

  test('extracts only safe external PDF links and DOI references', () => {
    expect(extractor).toContain("page.getAnnotations({ intent: 'display' })");
    expect(extractor).toContain("['http:', 'https:', 'mailto:'].includes(parsed.protocol)");
    expect(extractor).toContain('https://doi.org/');
    expect(extractor).toContain('window.PDFTextExtractor.getExtractedLinks');
  });

  test('renders a structured learning guide and five-question quiz', async () => {
    document.body.innerHTML = `
      <button id="learningGuideBtn"></button>
      <button id="askOneBtn"></button>
      <button id="startQuizBtn"></button>
      <button id="summarizePageBtn"></button>
      <button id="summarizeAllBtn"></button>
      <button id="clearChatBtn"></button>
      <div class="ai-panel-actions"></div>
      <div id="aiChatMessages"></div>
      <div id="aiLoadingIndicator" class="hidden"><span></span></div>
      <textarea id="aiChatInput"></textarea>
      <button id="aiSendBtn"></button>
    `;

    (global as any).PDFViewerApplication = {
      pdfDocument: { numPages: 3 },
      eventBus: { on: jest.fn() },
    };
    (window as any).PDFTextExtractor = {
      hasExtractedText: () => true,
      getExtractedText: () => '## Page 1\nA grounded PDF document.',
      triggerExtraction: jest.fn(),
    };

    const guide = {
      whyItMatters: '理解这本书提出的具体历史问题。',
      outcomes: Array.from({ length: 4 }, (_, index) => ({ title: `学习目标 ${index + 1}`, description: '解释核心内容。' })),
      prerequisites: { required: ['核心概念'], helpful: [] },
      readingPath: Array.from({ length: 3 }, (_, index) => ({ step: index + 1, goal: `步骤 ${index + 1}`, focus: '仔细阅读。', pages: [index + 1] })),
      attentionPoints: ['一个关键假设'],
      completionCriteria: ['解释主要观点'],
    };
    const quiz = {
      title: 'Key ideas',
      questions: Array.from({ length: 5 }, (_, index) => ({
        id: `q${index + 1}`,
        question: `Question ${index + 1}`,
        options: ['A', 'B', 'C', 'D'],
        correctIndex: 0,
        explanation: 'Grounded explanation',
      })),
    };

    const sendMessage = jest.fn()
      .mockResolvedValueOnce({ success: true, response: JSON.stringify(guide) })
      .mockResolvedValueOnce({ success: true, response: JSON.stringify(quiz) });
    (global as any).chrome.runtime.sendMessage = sendMessage;

    window.eval(assistant);
    document.dispatchEvent(new Event('DOMContentLoaded'));

    document.getElementById('learningGuideBtn')?.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.querySelector('.learning-guide-surface')).not.toBeNull();
    expect(document.querySelectorAll('.outcome-list li')).toHaveLength(4);
    const guideText = document.querySelector('.learning-guide-surface')?.textContent || '';
    expect(guideText).toContain('学习指南');
    expect(guideText).toContain('为什么重要');
    expect(guideText).toContain('你将理解');
    expect(guideText).toContain('阅读顺序');
    expect(guideText).not.toContain('Learning guide');
    expect(guideText).not.toContain('Why this matters');
    expect(guideText).not.toContain('What you will understand');

    document.getElementById('startQuizBtn')?.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.querySelector('.quiz-surface')).not.toBeNull();
    expect(document.querySelectorAll('.quiz-option')).toHaveLength(4);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
