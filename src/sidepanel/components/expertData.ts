export type ExpertId = 'munger' | 'marks' | 'kovach' | 'kotler' | 'tukey';

export interface ExpertGuide {
  id: ExpertId;
  initials: string;
  name: string;
  field: string;
  guideIntro: string;
  guideQuestions: [string, string];
  placeholder: string;
}

export const availableExperts: ExpertGuide[] = [
  {
    id: 'munger',
    initials: 'CM',
    name: 'Charlie Munger',
    field: 'Decisions & mental models',
    guideIntro: 'To get a useful answer, share:',
    guideQuestions: [
      'The decision, problem, or belief you want to examine',
      'The constraints, alternatives, and outcome you are considering',
    ],
    placeholder: 'Share the decision or problem you want to examine',
  },
  {
    id: 'marks',
    initials: 'HM',
    name: 'Howard Marks',
    field: 'Finance & risk',
    guideIntro: 'To assess the situation, share:',
    guideQuestions: [
      'The financial decision or market situation you are assessing',
      'Your alternatives, time horizon, and acceptable downside',
    ],
    placeholder: 'Describe a financial decision or market situation',
  },
  {
    id: 'kovach',
    initials: 'BK',
    name: 'Bill Kovach',
    field: 'News verification',
    guideIntro: 'To evaluate the report, share:',
    guideQuestions: [
      'The news report or claim you want to evaluate',
      'The sources, links, or page content currently available',
    ],
    placeholder: 'Paste a claim or describe the news you want to verify',
  },
  {
    id: 'kotler',
    initials: 'PK',
    name: 'Philip Kotler',
    field: 'Marketing & growth',
    guideIntro: 'To diagnose the opportunity, share:',
    guideQuestions: [
      'The product or service you are trying to market',
      'The intended customer and the result you want to achieve',
    ],
    placeholder: 'Describe your product, customer, and marketing challenge',
  },
  {
    id: 'tukey',
    initials: 'JT',
    name: 'John Tukey',
    field: 'Data analysis',
    guideIntro: 'To begin the analysis, share:',
    guideQuestions: [
      'The question the data should help you answer',
      'The data, metrics, or observations you currently have',
    ],
    placeholder: 'Describe the data and the question you want answered',
  },
];

export const getExpert = (expertId: ExpertId): ExpertGuide =>
  availableExperts.find(expert => expert.id === expertId) ?? availableExperts[0];
