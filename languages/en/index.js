const englishConfig = {
  code: 'en',
  name: 'English',
  nativeName: 'English',
  emoji: '🇬🇧',
  enabled: true,
  supportedLevels: ['A1', 'A2', 'B1', 'B2'],
  grammar: {
    focusAreas: ['articles', 'phrasal_verbs', 'irregular_verbs', 'word_order', 'tenses'],
  },
  mistakeCategories: [
    'vocabulary',
    'grammar',
    'article',
    'preposition',
    'word_order',
    'verb_form',
    'tense',
    'spelling',
    'expression_usage',
    'phrasal_verb',
  ],
  ai: {
    languageName: 'English',
    tutorInstruction: 'The target language is English.',
  },
  normalizeText(value = '') {
    return String(value)
      .toLowerCase()
      .replace(/[.,!?;:()[\]"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },
};

export default englishConfig;
