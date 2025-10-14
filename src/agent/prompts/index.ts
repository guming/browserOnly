/**
 * Mode prompts for the PromptManager
 */

// Define the structure for mode prompts
export interface ModePrompts {
  [key: string]: string;
}

// Import shared constants
export {
  MULTITAB_OPERATION_INSTRUCTIONS,
  CANONICAL_SEQUENCE,
  MEMORY_FORMAT,
  FUNCTIONAL_TEST_PROMPT
} from './constants.ts';

// Import individual mode prompts
import {happinessBookPrompt, howToReadPrompt} from './booksPrompt.ts';
import operatorPrompt from './operatorPrompt.ts';
import researcherPrompt from './researcherPrompt.ts';
import lawyerPrompt from './lawyerPrompt.ts';
import traderPrompt from './traderPrompt.ts';
import mathPrompt from './mathPrompt.ts';
import qaPrompt from './qaPrompt.ts';
import devopsPrompt from './devopsPrompt.ts';
import codePrompt from './codePrompt.ts';
import healthPrompt from './healthPrompt.ts';
import wikiPrompt from './wikiPrompt.ts';
import mungerPrompt from './mungerPrompt.ts';
import dataAnalystPrompt from './dataAnalystPrompt.ts';
import studyGuidePrompt from './notebooklmPrompt.ts'

// Export a function that takes the dynamic prompts as parameters
export const createModePrompts = (
): ModePrompts => ({
  operator: operatorPrompt,
  researcher: researcherPrompt,
  lawyer: lawyerPrompt,
  trader: traderPrompt,
  math: mathPrompt,
  qa: qaPrompt,
  devops: devopsPrompt,
  code: codePrompt,
  health: healthPrompt,
  wiki: wikiPrompt,
  munger: mungerPrompt,
  dataAnalyst: dataAnalystPrompt,
  books: happinessBookPrompt,
  'books-happinessBook': happinessBookPrompt,
  'books-howToRead': howToReadPrompt,
  notebooklm: studyGuidePrompt,
});