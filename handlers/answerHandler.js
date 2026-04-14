// handlers/answerHandler.js
//
// Единый обработчик ответов на вопросы системы очередей контента.
// callback_data формат: aq_{type}_{queueId}_{answer}
//   Примеры:
//     aq_word_42_2       — тип word, id очереди 42, ответ 2 (индекс)
//     aq_quiz_17_1       — тип quiz, id очереди 17, ответ 1
//     aq_fact_5_true     — тип fact, id очереди 5, ответ true
//     aq_fact_5_false    — тип fact, id очереди 5, ответ false

import ContentQueue from '../models/ContentQueue.js';
import { awardPoints } from '../services/userServices.js';
import { recordGameParticipation, hasUserAnsweredGame } from '../services/wordGameServices.js';
import { sendUserMessage, escapeHtml } from '../utils/botUtils.js';

const TZ = 'Europe/Chisinau';
const VALID_TYPES = new Set(['word', 'quiz', 'idiom', 'phrasal', 'fact']);

// In-memory set against race conditions (double tap)
const pendingAnswers = new Set();

function getTodayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

async function disableKeyboard(bot, callbackQuery) {
  try {
    await bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      {
        chat_id: callbackQuery.message?.chat?.id,
        message_id: callbackQuery.message?.message_id
      }
    );
  } catch (err) {
    const desc = err?.response?.body?.description || err?.message || '';
    if (
      !desc.includes('message is not modified') &&
      !desc.includes('message to edit not found') &&
      !desc.includes("message can't be edited")
    ) {
      console.warn(`[ANSWER] Не удалось убрать кнопки: ${desc}`);
    }
  }
}

function getPoints(type, item, isCorrect) {
  if (type === 'fact') {
    return isCorrect ? 10 : 2;
  }
  if (!isCorrect) return 0;
  if (type === 'quiz') {
    const level = item?.level;
    if (level === 'A2') return 1;
    if (level === 'B2') return 3;
    return 2; // B1 or default
  }
  return 5; // word, idiom, phrasal
}

function buildResultMessage(type, item, isCorrect, points) {
  let msg = isCorrect ? `✅ <b>Верно!</b>` : `❌ <b>Неверно.</b>`;
  if (points > 0) msg += ` +${points} очков`;
  msg += `\n\n`;

  switch (type) {
    case 'word':
      msg += `🔤 <b>${escapeHtml(item.word)}</b>\n`;
      msg += `🇷🇺 Перевод: <b>${escapeHtml(item.translation)}</b>\n`;
      if (item.example) msg += `📝 ${escapeHtml(item.example)}`;
      break;

    case 'idiom':
      msg += `🌷 <b>${escapeHtml(item.idiom)}</b>\n`;
      msg += `🎯 Перевод: <b>${escapeHtml(item.translation)}</b>\n`;
      if (item.meaning) msg += `ℹ️ ${escapeHtml(item.meaning)}\n`;
      if (item.example) msg += `📝 ${escapeHtml(item.example)}`;
      break;

    case 'phrasal':
      msg += `⚡ <b>${escapeHtml(item.verb || item.phrasalVerb || '')}</b>\n`;
      msg += `🎯 Перевод: <b>${escapeHtml(item.translation)}</b>\n`;
      if (item.meaning) msg += `ℹ️ ${escapeHtml(item.meaning)}\n`;
      if (item.example) msg += `📝 ${escapeHtml(item.example)}`;
      break;

    case 'quiz':
      msg += `📝 <b>${escapeHtml(item.question || '')}</b>\n`;
      msg += `✔️ Правильный ответ: <b>${escapeHtml(item.options?.[item.correctIndex] || '')}</b>\n`;
      if (item.explanation) msg += `ℹ️ ${escapeHtml(item.explanation)}`;
      break;

    case 'fact':
      msg += `🧠 "${escapeHtml(item.claim || '')}"\n\n`;
      if (item.explanation) msg += escapeHtml(item.explanation);
      break;
  }

  return msg;
}

/**
 * Обработчик callback_query с prefix "aq_".
 * Вызывается из setupCallbacks в botSetup.js.
 */
export async function handleAnswerCallback(bot, callbackQuery) {
  try {
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;

    // Parse: aq_{type}_{queueId}_{answer}
    // Split only on first 3 underscores to handle potential underscores in answer
    const firstUnderscore = data.indexOf('_');
    const rest = data.slice(firstUnderscore + 1); // type_{queueId}_{answer}
    const secondUnderscore = rest.indexOf('_');
    const type = rest.slice(0, secondUnderscore);
    const afterType = rest.slice(secondUnderscore + 1); // {queueId}_{answer}
    const thirdUnderscore = afterType.indexOf('_');
    const queueId = parseInt(afterType.slice(0, thirdUnderscore), 10);
    const answer = afterType.slice(thirdUnderscore + 1);

    if (!VALID_TYPES.has(type) || isNaN(queueId)) return;

    // Anti-race: prevent double tap
    const pendingKey = `${userId}:${type}:${queueId}`;
    if (pendingAnswers.has(pendingKey)) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: 'ℹ️ Ты уже ответил',
        show_alert: true
      });
      return;
    }

    // Check DB for previous answer today
    const today = getTodayDate();
    const gameTypeKey = `q_${type}`;
    const alreadyAnswered = await hasUserAnsweredGame(userId, gameTypeKey, 'queue', today);

    if (alreadyAnswered) {
      await disableKeyboard(bot, callbackQuery);
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: 'ℹ️ Ты уже ответил на этот вопрос сегодня',
        show_alert: true
      });
      return;
    }

    pendingAnswers.add(pendingKey);
    await disableKeyboard(bot, callbackQuery);

    try {
      // Load item from queue table
      const queueRow = await ContentQueue.findByPk(queueId);
      if (!queueRow) {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: '⏰ Вопрос больше недоступен',
          show_alert: true
        });
        return;
      }

      const item = queueRow.content;
      let isCorrect = false;

      if (type === 'fact') {
        const userSaidTrue = answer === 'true';
        isCorrect = userSaidTrue === Boolean(item.isTrue);
      } else {
        const selectedIndex = parseInt(answer, 10);
        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: '⚠️ Неверный вариант ответа',
            show_alert: true
          });
          return;
        }
        isCorrect = selectedIndex === item.correctIndex;
      }

      const points = getPoints(type, item, isCorrect);

      // Award points
      if (points > 0) {
        await awardPoints(userId, points);
      }

      // Build key for participation record
      const wordKey =
        type === 'word'    ? (item.word || '').slice(0, 100) :
        type === 'idiom'   ? (item.idiom || '').slice(0, 100) :
        type === 'phrasal' ? (item.verb || item.phrasalVerb || '').slice(0, 100) :
        type === 'quiz'    ? (item.question || '').slice(0, 100) :
                             (item.claim || '').slice(0, 100);

      // Record in word_game_participation (prevents double answer on next check)
      await recordGameParticipation({
        userId,
        word: wordKey,
        answered: true,
        correct: isCorrect,
        pointsEarned: points,
        responseTime: null,
        gameType: gameTypeKey,
        slot: 'queue',
        gameDate: today
      });

      // Send result message
      const resultMsg = buildResultMessage(type, item, isCorrect, points);
      await sendUserMessage(bot, userId, resultMsg, { parse_mode: 'HTML' });

      await bot.answerCallbackQuery(callbackQuery.id, {
        text: isCorrect ? '✅ Верно!' : '❌ Неверно',
        show_alert: false
      });

      console.log(`[ANSWER] userId=${userId} type=${type} queueId=${queueId} correct=${isCorrect} points=${points}`);
    } finally {
      pendingAnswers.delete(pendingKey);
    }
  } catch (error) {
    console.error(`[ANSWER] Ошибка обработки ответа:`, error.message);
    try {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '⚠️ Произошла ошибка',
        show_alert: true
      });
    } catch (_) {}
  }
}
