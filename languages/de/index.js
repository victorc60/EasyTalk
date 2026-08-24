const germanConfig = {
  code: 'de',
  name: 'German',
  nativeName: 'Deutsch',
  emoji: '🇩🇪',
  enabled: true,
  supportedLevels: ['A1', 'A2', 'B1', 'B2'],
  grammar: {
    focusAreas: [
      'gender',
      'articles',
      'cases',
      'word_order',
      'separable_verbs',
      'adjective_endings',
      'verb_position',
    ],
  },
  mistakeCategories: [
    'vocabulary',
    'grammar',
    'article',
    'gender',
    'case',
    'word_order',
    'verb_position',
    'agreement',
    'spelling',
    'expression_usage',
  ],
  ai: {
    languageName: 'German',
    tutorInstruction: 'The target language is German.',
  },
  normalizeText(value = '') {
    return String(value)
      .toLowerCase()
      .replace(/[.,!?;:()[\]"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },
};

export default germanConfig;
