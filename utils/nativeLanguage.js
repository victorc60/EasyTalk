export const SUPPORTED_NATIVE_LANGUAGES = ['ru', 'ro'];

export function normalizeNativeLanguage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return SUPPORTED_NATIVE_LANGUAGES.includes(normalized) ? normalized : null;
}

export function getNativeLanguageLabel(nativeLanguage) {
  return normalizeNativeLanguage(nativeLanguage) === 'ro' ? 'Romana' : 'Русский';
}

export function getNativeLanguageInstruction(nativeLanguage) {
  return normalizeNativeLanguage(nativeLanguage) === 'ro' ? 'Romanian' : 'Russian';
}

export function buildNativeLanguageSelectionText(currentLanguage = null) {
  const normalized = normalizeNativeLanguage(currentLanguage);
  const currentLine = normalized
    ? `\nCurrent language / Limba curenta / Текущий язык: <b>${getNativeLanguageLabel(normalized)}</b>\n`
    : '\n';

  return [
    '🌍 <b>Choose your native language</b>',
    'Alege limba ta materna',
    'Выбери родной язык',
    currentLine,
    'I will explain the target language in your language.',
    'Iti voi explica limba pe care o studiezi in limba ta.',
    'Я буду объяснять изучаемый язык на твоем родном языке.',
  ].join('\n');
}

export function buildNativeLanguageSelectionMarkup(currentLanguage = null) {
  const normalized = normalizeNativeLanguage(currentLanguage);
  const ruPrefix = normalized === 'ru' ? '✅ ' : '';
  const roPrefix = normalized === 'ro' ? '✅ ' : '';

  return {
    inline_keyboard: [
      [
        { text: `${ruPrefix}Русский`, callback_data: 'native_lang_ru' },
        { text: `${roPrefix}Romana`, callback_data: 'native_lang_ro' },
      ],
    ],
  };
}

export function buildNativeLanguageSavedMessage(nativeLanguage, isUpdate = false) {
  const normalized = normalizeNativeLanguage(nativeLanguage) || 'ru';

  if (normalized === 'ro') {
    return isUpdate
      ? '✅ Limba ta materna a fost actualizata la <b>romana</b>.\nDe acum iti voi explica limba studiata in romana.'
      : '✅ Gata! Limba ta materna este <b>romana</b>.\nDe acum iti voi explica limba studiata in romana.';
  }

  return isUpdate
    ? '✅ Родной язык обновлен: <b>русский</b>.\nТеперь я буду объяснять изучаемый язык на русском.'
    : '✅ Отлично! Твой родной язык — <b>русский</b>.\nТеперь я буду объяснять изучаемый язык на русском.';
}

export function buildNativeLanguageRequiredText() {
  return [
    '🌍 Before we continue, choose your native language.',
    'Inainte sa continuam, alege limba ta materna.',
    'Перед тем как продолжить, выбери родной язык.',
  ].join('\n');
}

export function buildWelcomeMessage(nativeLanguage, safeFirstName, targetLanguageLabel = 'English') {
  const normalized = normalizeNativeLanguage(nativeLanguage) || 'ru';

  if (normalized === 'ro') {
    return `
👋 <b>Salut, ${safeFirstName}!</b> Sunt asistentul tau pentru invatarea limbii.

📌 <b>Moduri disponibile:</b>
1. <b>Conversatie libera</b> - /mode_free_talk
2. <b>Jocuri de rol</b> - /mode_role_play
3. <b>Corectarea greselilor</b> - /mode_correction
4. <b>Limba nativa</b> - /language
📋 Vezi modurile: /mode

🎮 <b>Jocuri si activitate:</b>
🔤 Cuvantul zilei la 18:30
📚 Curiozitati la 17:30
💬 /topic - subiect de conversatie
🎭 /roleplay - joc de rol
📚🎧 /story - voice storytelling with audio

📊 /progress - progresul tau
🌍 /languages - limbile pe care le studiezi
🧠 /session - sesiunea zilnica
🏆 /leaders - clasament

Alege ce iti place si exerseaza ${targetLanguageLabel}!`;
  }

  return `
👋 <b>Привет, ${safeFirstName}!</b> Я твой помощник в изучении языка.

📌 <b>Доступные режимы:</b>
1. <b>Свободное общение</b> - /mode_free_talk
2. <b>Ролевые игры</b> - /mode_role_play
3. <b>Проверка ошибок</b> - /mode_correction
4. <b>Родной язык</b> - /language
📋 Показать режимы: /mode

🎮 <b>Игры и активность:</b>
🔤 Слово дня в 18:30
📚 Интересные факты в 17:30
💬 /topic - тема для обсуждения
🎭 /roleplay - ролевая игра
📚🎧 /story - voice storytelling with audio

📊 /progress - твой прогресс
🌍 /languages - изучаемые языки
🧠 /session - ежедневная сессия
🏆 /leaders - таблица лидеров

Выбирай что тебе интересно и практикуй ${targetLanguageLabel}!`;
}
