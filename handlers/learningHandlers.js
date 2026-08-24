import User from '../models/User.js';
import { sendUserMessage, escapeHtml } from '../utils/botUtils.js';
import { buildWelcomeMessage, normalizeNativeLanguage } from '../utils/nativeLanguage.js';
import {
  UNKNOWN_LEVEL,
  buildTargetLanguageSelectionMarkup,
  buildTargetLanguageSelectionText,
  buildTargetLevelSelectionMarkup,
  buildTargetLevelSelectionText,
  getEnabledLanguageConfigs,
  getLanguageLabel,
  normalizeLevel,
  normalizeTargetLanguage,
} from '../services/languageRegistry.js';
import {
  ensureUserLanguageProfile,
  getUserActiveTargetLanguage,
  getUserLanguageProfiles,
  getUserLanguageProgressSummary,
  setUserActiveTargetLanguage,
  updateUserLanguageLevel,
} from '../services/userLanguageProfileService.js';
import {
  formatSessionExerciseMessage,
  getActiveDailySession,
  getCurrentSessionExercise,
  getSessionSummaryMessage,
  isTextExercise,
  startDailySession,
  submitSessionAnswer,
} from '../services/dailySessionService.js';

async function getUserNativeLanguage(userId) {
  const user = await User.findOne({
    where: { telegram_id: userId },
    attributes: ['native_language'],
  });
  return normalizeNativeLanguage(user?.native_language);
}

export async function showTargetLanguageSelection(bot, chatId, userId) {
  const activeLanguage = await getUserActiveTargetLanguage(userId);
  await sendUserMessage(
    bot,
    chatId,
    buildTargetLanguageSelectionText(activeLanguage),
    {
      parse_mode: 'HTML',
      reply_markup: buildTargetLanguageSelectionMarkup(activeLanguage),
    }
  );
}

export async function showTargetLevelSelection(bot, chatId, userId, targetLanguage) {
  const normalizedLanguage = normalizeTargetLanguage(targetLanguage);
  const profile = await ensureUserLanguageProfile({
    userId,
    targetLanguage: normalizedLanguage,
  });

  await sendUserMessage(
    bot,
    chatId,
    buildTargetLevelSelectionText(normalizedLanguage, profile.current_level),
    {
      parse_mode: 'HTML',
      reply_markup: buildTargetLevelSelectionMarkup(normalizedLanguage, profile.current_level),
    }
  );
}

export async function showLanguagesOverview(bot, chatId, userId) {
  const activeLanguage = await getUserActiveTargetLanguage(userId);
  const profiles = await getUserLanguageProfiles(userId);
  const profilesByCode = new Map(profiles.map((entry) => [entry.profile.target_language, entry]));
  const lines = ['🌍 <b>Languages</b>', ''];

  for (const config of getEnabledLanguageConfigs()) {
    const entry = profilesByCode.get(config.code);
    if (!entry) {
      lines.push(`${config.emoji} <b>${config.nativeName}</b>`);
      lines.push('Not started');
      lines.push('');
      continue;
    }

    const level = normalizeLevel(entry.profile.current_level) === UNKNOWN_LEVEL
      ? 'Level not set'
      : entry.profile.current_level;
    const activeMark = activeLanguage === config.code ? ' ✅' : '';
    lines.push(`${config.emoji} <b>${config.nativeName}</b>${activeMark}`);
    lines.push(`${level} • ${entry.masteredItems} mastered • ${entry.dueForReview} due`);
    lines.push('');
  }

  await sendUserMessage(
    bot,
    chatId,
    lines.join('\n').trim(),
    {
      parse_mode: 'HTML',
      reply_markup: buildTargetLanguageSelectionMarkup(activeLanguage),
    }
  );
}

export async function maybeContinueOnboarding(bot, chatId, userId) {
  const activeLanguage = await getUserActiveTargetLanguage(userId);
  if (!activeLanguage) {
    await showTargetLanguageSelection(bot, chatId, userId);
    return false;
  }

  const profile = await ensureUserLanguageProfile({
    userId,
    targetLanguage: activeLanguage,
  });

  if (normalizeLevel(profile.current_level) === UNKNOWN_LEVEL) {
    await showTargetLevelSelection(bot, chatId, userId, activeLanguage);
    return false;
  }

  return true;
}

export async function saveTargetLanguage(bot, callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id || callbackQuery.from.id;
  const userId = callbackQuery.from.id;
  const selectedLanguage = callbackQuery.data.slice('target_lang_'.length);
  const normalizedLanguage = normalizeTargetLanguage(selectedLanguage);

  if (!normalizedLanguage) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Unsupported language' });
    return;
  }

  await setUserActiveTargetLanguage({
    userId,
    targetLanguage: normalizedLanguage,
  });

  const profile = await ensureUserLanguageProfile({
    userId,
    targetLanguage: normalizedLanguage,
  });

  await bot.answerCallbackQuery(callbackQuery.id, {
    text: `${getLanguageLabel(normalizedLanguage)} selected`,
  });

  if (normalizeLevel(profile.current_level) === UNKNOWN_LEVEL) {
    await sendUserMessage(
      bot,
      chatId,
      `✅ Active language: <b>${getLanguageLabel(normalizedLanguage)}</b>`,
      { parse_mode: 'HTML' }
    );
    await showTargetLevelSelection(bot, chatId, userId, normalizedLanguage);
    return;
  }

  await sendUserMessage(
    bot,
    chatId,
    `✅ Active language changed to <b>${getLanguageLabel(normalizedLanguage)}</b>.`,
    { parse_mode: 'HTML' }
  );
  await showLanguagesOverview(bot, chatId, userId);
}

export async function saveTargetLevel(bot, callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id || callbackQuery.from.id;
  const userId = callbackQuery.from.id;
  const match = callbackQuery.data.match(/^target_level_([a-z]{2,8})_(.+)$/);

  if (!match) {
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'Invalid level' });
    return;
  }

  const [, targetLanguage, currentLevel] = match;
  const normalizedLanguage = normalizeTargetLanguage(targetLanguage);
  const normalizedLevel = normalizeLevel(currentLevel);

  await updateUserLanguageLevel({
    userId,
    targetLanguage: normalizedLanguage,
    currentLevel: normalizedLevel,
  });
  await setUserActiveTargetLanguage({
    userId,
    targetLanguage: normalizedLanguage,
  });

  const nativeLanguage = await getUserNativeLanguage(userId);
  const safeFirstName = escapeHtml(callbackQuery.from.first_name || 'friend');

  await bot.answerCallbackQuery(callbackQuery.id, {
    text: normalizedLevel === UNKNOWN_LEVEL ? 'Level saved' : `${normalizedLevel} saved`,
  });

  await sendUserMessage(
    bot,
    chatId,
    normalizedLevel === UNKNOWN_LEVEL
      ? `✅ ${getLanguageLabel(normalizedLanguage)} is ready.\nPlacement test can be added later.`
      : `✅ ${getLanguageLabel(normalizedLanguage)} • level <b>${normalizedLevel}</b> saved.`,
    { parse_mode: 'HTML' }
  );

  await sendUserMessage(
    bot,
    chatId,
    buildWelcomeMessage(nativeLanguage, safeFirstName, getLanguageLabel(normalizedLanguage)),
    { parse_mode: 'HTML' }
  );
}

export async function startDailySessionCommand(bot, msg, openai) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  try {
    const nativeLanguage = await getUserNativeLanguage(userId);
    const onboardingComplete = await maybeContinueOnboarding(bot, chatId, userId);

    if (!onboardingComplete) {
      return;
    }

    const activeLanguage = await getUserActiveTargetLanguage(userId);
    const session = await startDailySession({
      userId,
      targetLanguage: activeLanguage,
      openai,
    });
    const exercise = await getCurrentSessionExercise(session.id);

    if (!exercise) {
      await sendUserMessage(bot, chatId, '⚠️ Could not create a daily session right now.');
      return;
    }

    await sendUserMessage(
      bot,
      chatId,
      `🧠 Session ready for <b>${getLanguageLabel(activeLanguage)}</b>.\nShort format: learn, practice, output, review.`,
      { parse_mode: 'HTML' }
    );

    const formatted = formatSessionExerciseMessage(session, exercise, nativeLanguage);
    await sendUserMessage(bot, chatId, formatted.text, {
      parse_mode: 'HTML',
      ...(formatted.reply_markup ? { reply_markup: formatted.reply_markup } : {}),
    });
  } catch (error) {
    console.error('[Learning Session] Failed to start session:', error.message);
    await sendUserMessage(
      bot,
      chatId,
      `⚠️ Не удалось собрать сессию: ${error.message}`,
      { parse_mode: 'HTML' }
    );
  }
}

export async function handleLearningCallback(bot, callbackQuery, openai) {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message?.chat?.id || callbackQuery.from.id;
  const userId = callbackQuery.from.id;

  if (data.startsWith('target_lang_')) {
    await saveTargetLanguage(bot, callbackQuery);
    return true;
  }

  if (data.startsWith('target_level_')) {
    await saveTargetLevel(bot, callbackQuery);
    return true;
  }

  if (data.startsWith('session_answer_')) {
    const match = data.match(/^session_answer_(\d+)_(\d+)$/);
    if (!match) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Invalid answer' });
      return true;
    }

    const nativeLanguage = await getUserNativeLanguage(userId);
    const sessionId = Number(match[1]);
    const answerIndex = Number(match[2]);
    const result = await submitSessionAnswer({
      sessionId,
      userId,
      answer: answerIndex,
      nativeLanguage,
      openai,
    });

    await bot.answerCallbackQuery(callbackQuery.id, {
      text: result.finished ? 'Session complete' : 'Answer saved',
    });
    await sendUserMessage(bot, chatId, result.feedback, { parse_mode: 'HTML' });

    if (result.finished) {
      await sendUserMessage(bot, chatId, await getSessionSummaryMessage(sessionId), { parse_mode: 'HTML' });
      return true;
    }

    const formatted = formatSessionExerciseMessage(result.session, result.nextExercise, nativeLanguage);
    await sendUserMessage(bot, chatId, formatted.text, {
      parse_mode: 'HTML',
      ...(formatted.reply_markup ? { reply_markup: formatted.reply_markup } : {}),
    });
    return true;
  }

  return false;
}

export async function handleLearningTextMessage(bot, msg, openai) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const session = await getActiveDailySession(userId);

  if (!session) {
    return false;
  }

  const exercise = await getCurrentSessionExercise(session.id);
  if (!exercise) {
    return false;
  }

  if (!isTextExercise(exercise.exercise_type)) {
    await sendUserMessage(
      bot,
      chatId,
      'ℹ️ Для этого шага выбери один из вариантов кнопками ниже.',
      { parse_mode: 'HTML' }
    );
    return true;
  }

  const nativeLanguage = await getUserNativeLanguage(userId);
  const result = await submitSessionAnswer({
    sessionId: session.id,
    userId,
    answer: msg.text?.trim() || '',
    nativeLanguage,
    openai,
  });

  await sendUserMessage(bot, chatId, result.feedback, { parse_mode: 'HTML' });

  if (result.finished) {
    await sendUserMessage(bot, chatId, await getSessionSummaryMessage(session.id), { parse_mode: 'HTML' });
    return true;
  }

  const formatted = formatSessionExerciseMessage(result.session, result.nextExercise, nativeLanguage);
  await sendUserMessage(bot, chatId, formatted.text, {
    parse_mode: 'HTML',
    ...(formatted.reply_markup ? { reply_markup: formatted.reply_markup } : {}),
  });
  return true;
}

export async function buildActiveLanguageProgressMessage(userId) {
  const activeLanguage = await getUserActiveTargetLanguage(userId);
  if (!activeLanguage) {
    return 'ℹ️ Сначала выбери изучаемый язык.';
  }

  const summary = await getUserLanguageProgressSummary(userId, activeLanguage);
  const topMistakes = summary.topMistakes.length
    ? summary.topMistakes
        .map((item) => `• ${item.category}: ${item.pattern_key} (${item.count})`)
        .join('\n')
    : '• No repeated mistakes yet';

  return [
    `📊 <b>Your Progress</b>`,
    '',
    `🌍 Active language: ${getLanguageLabel(activeLanguage)}`,
    `📚 Current level: ${summary.profile.current_level}`,
    `🧠 Items learned: ${summary.itemsLearned}`,
    `🏁 Items mastered: ${summary.itemsMastered}`,
    `🗂 Active vocabulary: ${summary.activeVocabulary}`,
    `⏰ Due for review: ${summary.dueForReview}`,
    `⚠️ Weak items: ${summary.weakItems}`,
    '',
    `<b>Common mistakes</b>`,
    topMistakes,
  ].join('\n');
}
