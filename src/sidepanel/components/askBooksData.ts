export interface BookGuide {
  id: string;
  title: string;
  author: string;
  category: string;
  guideIntro: string;
  guideQuestions: [string, string];
}

export interface BookCategory {
  id: string;
  name: string;
}

export const bookCategories: BookCategory[] = [
  { id: 'thinking', name: 'Thinking & Decision Making' },
  { id: 'productivity', name: 'Productivity & Habits' },
  { id: 'business', name: 'Business & Strategy' },
  { id: 'growth', name: 'Personal Growth' },
  { id: 'learning', name: 'Learning & Research' },
  { id: 'systems', name: 'Systems Thinking' },
  { id: 'finance', name: 'Money & Finance' },
];

export const availableBooks: BookGuide[] = [
  {
    id: 'happinessBook',
    title: 'Build the Life You Want',
    author: 'Oprah Winfrey',
    category: 'growth',
    guideIntro: 'Ready to begin? Share:',
    guideQuestions: [
      'Your current situation or specific challenges (e.g., burnt out at work, tense relationships, lack of direction)',
      'Your most important goal (e.g., more fulfillment at work, better communication, feeling calmer)',
    ],
  },
  {
    id: 'howToRead',
    title: 'How to Read a Book',
    author: 'Mortimer J. Adler',
    category: 'growth',
    guideIntro: 'Ready to improve your reading? Share:',
    guideQuestions: [
      'Your main reading goal (e.g., study faster, read classics, extract insights for work)',
      'Your current reading challenge (e.g., difficulty finishing books, remembering key points)',
    ],
  },
  {
    id: 'thinkingFastAndSlow',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    category: 'thinking',
    guideIntro: 'Ready to improve your thinking? Share:',
    guideQuestions: [
      'What decisions or judgments are you struggling with? (e.g., investment, relationships, career)',
      'Do you want to strengthen your intuition or improve your analytical accuracy?',
    ],
  },
  {
    id: 'artOfThinkingClearly',
    title: 'The Art of Thinking Clearly',
    author: 'Rolf Dobelli',
    category: 'thinking',
    guideIntro: 'Ready to think more clearly? Share:',
    guideQuestions: [
      'A recent decision or belief that may have been influenced by bias',
      'Your primary goal (e.g., rational business choices, better relationships, independent thinking)',
    ],
  },
  {
    id: 'gettingThingsDone',
    title: 'Getting Things Done',
    author: 'David Allen',
    category: 'productivity',
    guideIntro: 'Ready to get organized? Share:',
    guideQuestions: [
      'Your current productivity challenge (e.g., overwhelm, procrastination, disorganization)',
      'What system or tool you currently use to manage tasks (e.g., Notion, Todoist, pen & paper)',
    ],
  },
  {
    id: 'deepWork',
    title: 'Deep Work',
    author: 'Cal Newport',
    category: 'productivity',
    guideIntro: 'Ready to master focus? Share:',
    guideQuestions: [
      'What type of work or study requires your deepest focus?',
      'Your main sources of distraction (e.g., notifications, meetings, social media)',
    ],
  },
  {
    id: 'essentialism',
    title: 'Essentialism: The Disciplined Pursuit of Less',
    author: 'Greg McKeown',
    category: 'productivity',
    guideIntro: 'Ready to pursue less but better? Share:',
    guideQuestions: [
      'What areas of your life feel overloaded or scattered right now?',
      'The one or two goals that truly matter most to you in this season of life',
    ],
  },
  {
    id: 'atomicHabits',
    title: 'Atomic Habits',
    author: 'James Clear',
    category: 'productivity',
    guideIntro: 'Ready to build better habits? Share:',
    guideQuestions: [
      'A specific habit you want to build or break (e.g., exercising daily, reducing screen time, journaling)',
      'Your primary motivation or identity goal (e.g., “I want to be healthier”, “I want to be more focused”)',
    ],
  },
  {
    id: 'leanStartup',
    title: 'The Lean Startup',
    author: 'Eric Ries',
    category: 'business',
    guideIntro: 'Ready to build lean? Share:',
    guideQuestions: [
      'Your startup idea or current challenge (e.g., validating demand, defining MVP)',
      'Your primary goal (e.g., faster experimentation, customer validation, product-market fit)',
    ],
  },
  {
    id: 'artOfStrategy',
    title: 'The Art of Strategy',
    author: 'Avinash K. Dixit & Barry J. Nalebuff',
    category: 'business',
    guideIntro: 'Ready to think strategically? Share:',
    guideQuestions: [
      'A strategic situation you’re facing (e.g., business competition, negotiation, decision conflict)',
      'Your desired outcome (e.g., predict moves, strengthen position, design win-win solution)',
    ],
  },
  {
    id: 'makeItStick',
    title: 'Make It Stick',
    author: 'Peter C. Brown, Henry L. Roediger III & Mark A. McDaniel',
    category: 'learning',
    guideIntro: 'Ready to learn more effectively? Share:',
    guideQuestions: [
      'What you are learning and when you need to use it',
      'How you currently study and what you tend to forget',
    ],
  },
  {
    id: 'craftOfResearch',
    title: 'The Craft of Research',
    author: 'Wayne C. Booth, Gregory G. Colomb, Joseph M. Williams et al.',
    category: 'learning',
    guideIntro: 'Ready to shape your research? Share:',
    guideQuestions: [
      'Your topic, question, or claim you want to investigate',
      'The audience, evidence you have, and evidence you still need',
    ],
  },
  {
    id: 'thinkingInSystems',
    title: 'Thinking in Systems',
    author: 'Donella H. Meadows',
    category: 'systems',
    guideIntro: 'Ready to examine the system? Share:',
    guideQuestions: [
      'The recurring problem or surprising outcome you want to understand',
      'The people, resources, feedback, and delays involved',
    ],
  },
  {
    id: 'momTest',
    title: 'The Mom Test',
    author: 'Rob Fitzpatrick',
    category: 'business',
    guideIntro: 'Ready to learn from customers? Share:',
    guideQuestions: [
      'Your product idea and the customer problem you want to test',
      'Who you can interview and what you currently believe',
    ],
  },
  {
    id: 'designingYourLife',
    title: 'Designing Your Life',
    author: 'Bill Burnett & Dave Evans',
    category: 'growth',
    guideIntro: 'Ready to explore a life choice? Share:',
    guideQuestions: [
      'The career or life direction you are considering',
      'Your constraints and a small experiment you could try',
    ],
  },
  {
    id: 'psychologyOfMoney',
    title: 'The Psychology of Money',
    author: 'Morgan Housel',
    category: 'finance',
    guideIntro: 'Ready to examine a money decision? Share:',
    guideQuestions: [
      'The money decision or behavior you want to understand',
      'Your goal, time horizon, and worries about downside risk',
    ],
  },
];

export const getBookCategoryName = (categoryId: string): string =>
  bookCategories.find(category => category.id === categoryId)?.name ?? categoryId;
