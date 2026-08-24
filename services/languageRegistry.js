import languageRegistry from '../languages/index.js';

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2'];
export const UNKNOWN_LEVEL = 'unknown';
export const LEARNING_ITEM_TYPES = ['word', 'phrase', 'collocation', 'expression', 'grammar'];

export function getEnabledLanguageConfigs() {
  return Object.values(languageRegistry).filter((config) => config.enabled !== false);
}

export function normalizeTargetLanguage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return languageRegistry[normalized]?.enabled === false ? null : languageRegistry[normalized]?.code || null;
}

export function normalizeLevel(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (CEFR_LEVELS.includes(normalized)) {
    return normalized;
  }
  return UNKNOWN_LEVEL;
}

export function getLanguageConfig(languageCode) {
  const normalized = normalizeTargetLanguage(languageCode);
  return normalized ? languageRegistry[normalized] : null;
}

export function getLanguageLabel(languageCode) {
  const config = getLanguageConfig(languageCode);
  return config ? `${config.emoji} ${config.nativeName}` : 'Unknown';
}

export function getLanguagePlainName(languageCode) {
  const config = getLanguageConfig(languageCode);
  return config?.name || 'Unknown';
}

export function normalizeLanguageText(languageCode, value) {
  const config = getLanguageConfig(languageCode);
  if (!config?.normalizeText) {
    return String(value || '').trim().toLowerCase();
  }
  return config.normalizeText(value);
}

export function compareLevels(left, right) {
  const leftIndex = CEFR_LEVELS.indexOf(normalizeLevel(left));
  const rightIndex = CEFR_LEVELS.indexOf(normalizeLevel(right));
  return leftIndex - rightIndex;
}

export function getSelectableLevels() {
  return [...CEFR_LEVELS, UNKNOWN_LEVEL];
}

export function buildTargetLanguageSelectionText(currentLanguage = null) {
  const currentLine = currentLanguage
    ? `\nCurrent target language: <b>${getLanguageLabel(currentLanguage)}</b>\n`
    : '\n';

  return [
    '🌍 <b>Choose the language you want to study</b>',
    'Выбери язык, который хочешь изучать.',
    currentLine,
    'Available now: English, German, Italian.',
    'После выбора языка открой /session и начни мини-урок на сегодня.',
  ].join('\n');
}

export function buildTargetLanguageSelectionMarkup(currentLanguage = null) {
  return {
    inline_keyboard: getEnabledLanguageConfigs().map((config) => {
      const prefix = currentLanguage === config.code ? '✅ ' : '';
      return [{ text: `${prefix}${config.emoji} ${config.nativeName}`, callback_data: `target_lang_${config.code}` }];
    }),
  };
}

export function buildTargetLevelSelectionText(languageCode, currentLevel = UNKNOWN_LEVEL) {
  const label = getLanguageLabel(languageCode);
  const levelLabel = normalizeLevel(currentLevel) === UNKNOWN_LEVEL ? 'not set' : normalizeLevel(currentLevel);

  return [
    `📚 <b>${label}</b>`,
    '',
    `Current level: <b>${levelLabel}</b>`,
    '',
    'Choose your level now. You can switch languages later in /languages.',
    'Выбери свой уровень сейчас. Потом можно в любой момент вернуться в /languages.',
  ].join('\n');
}

export function buildTargetLevelSelectionMarkup(languageCode, currentLevel = UNKNOWN_LEVEL) {
  const normalizedLanguage = normalizeTargetLanguage(languageCode);
  const normalizedLevel = normalizeLevel(currentLevel);
  const levels = [
    ['A1', 'A2'],
    ['B1', 'B2'],
  ];

  const rows = levels.map((pair) => pair.map((level) => ({
    text: `${normalizedLevel === level ? '✅ ' : ''}${level}`,
    callback_data: `target_level_${normalizedLanguage}_${level}`,
  })));

  rows.push([
    {
      text: `${normalizedLevel === UNKNOWN_LEVEL ? '✅ ' : ''}Не знаю свой уровень`,
      callback_data: `target_level_${normalizedLanguage}_${UNKNOWN_LEVEL}`,
    },
  ]);

  return { inline_keyboard: rows };
}
