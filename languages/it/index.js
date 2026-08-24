const italianConfig = {
  code: 'it',
  name: 'Italian',
  nativeName: 'Italiano',
  emoji: '🇮🇹',
  enabled: true,
  supportedLevels: ['A1', 'A2', 'B1', 'B2'],
  grammar: {
    focusAreas: [
      'gender',
      'articles',
      'verb_conjugations',
      'essere_avere',
      'prepositions',
      'passato_prossimo',
      'adjective_agreement',
    ],
  },
  mistakeCategories: [
    'vocabulary',
    'grammar',
    'article_gender',
    'verb_conjugation',
    'preposition',
    'agreement',
    'spelling',
    'expression_usage',
  ],
  ai: {
    languageName: 'Italian',
    tutorInstruction: 'The target language is Italian.',
  },
  normalizeText(value = '') {
    return String(value)
      .toLowerCase()
      .replace(/[.,!?;:()[\]"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },
};

export default italianConfig;
