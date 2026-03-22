import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Op } from 'sequelize';
import User from '../models/User.js';
import MiniEventDay from '../models/MiniEventDay.js';
import MiniEventParticipant from '../models/MiniEventParticipant.js';
import MiniEventResponse from '../models/MiniEventResponse.js';
import { awardPoints } from './userServices.js';
import { sendUserMessage, sendAdminMessage } from '../utils/botUtils.js';
import { appendBankHistoryEntries } from './bankLifecycleService.js';

const TZ = 'Europe/Moscow';
const QUESTIONS_PER_EVENT = 10;
const CORRECT_ANSWER_POINTS = 20;
const PARTICIPATION_REWARD = 50;
const PLACE_REWARDS = [300, 200, 100];
const MIN_INTERVAL_MS = 30 * 1000;

let questionBankCache = null;
let miniEventHistoryPathCache = null;

function getMoscowNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayEventDate() {
  return formatDateKey(getMoscowNow());
}

function getEventKeyFromDate(eventDate) {
  return eventDate.replace(/-/g, '');
}

function getDateFromEventKey(eventKey) {
  if (!/^\d{8}$/.test(eventKey)) {
    return null;
  }
  const y = eventKey.slice(0, 4);
  const m = eventKey.slice(4, 6);
  const d = eventKey.slice(6, 8);
  return `${y}-${m}-${d}`;
}

function getCutoffTime(eventDate) {
  const [year, month, day] = eventDate.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 0, 0, 0);
}

function isSaturdayInMoscow() {
  return getMoscowNow().getDay() === 6;
}

function loadQuestionBank() {
  if (questionBankCache) {
    return questionBankCache;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const bankPath = path.join(__dirname, '..', 'data', 'mini_event_questions.json');
  const raw = fs.readFileSync(bankPath, 'utf-8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed) || parsed.length < QUESTIONS_PER_EVENT) {
    throw new Error(`mini_event_questions.json должен содержать минимум ${QUESTIONS_PER_EVENT} вопросов`);
  }

  questionBankCache = parsed;
  return questionBankCache;
}

function getMiniEventHistoryPath() {
  if (miniEventHistoryPathCache) {
    return miniEventHistoryPathCache;
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  miniEventHistoryPathCache = path.join(__dirname, '..', 'data', 'mini_event_history.json');
  return miniEventHistoryPathCache;
}

function loadUsedMiniEventQuestionIds() {
  const historyPath = getMiniEventHistoryPath();

  if (!fs.existsSync(historyPath)) {
    return new Set();
  }

  try {
    const raw = fs.readFileSync(historyPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.map((id) => String(id).trim()).filter(Boolean));
  } catch (error) {
    console.error('Ошибка чтения mini_event_history.json:', error.message);
    return new Set();
  }
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickQuestionIds() {
  const bank = loadQuestionBank();
  const usedQuestionIds = loadUsedMiniEventQuestionIds();
  const unusedQuestions = bank.filter((q) => !usedQuestionIds.has(String(q.id)));
  const selected = [];
  const selectedIds = new Set();

  for (const question of shuffleInPlace([...unusedQuestions])) {
    if (selected.length >= QUESTIONS_PER_EVENT) break;
    selected.push(question);
    selectedIds.add(String(question.id));
  }

  if (selected.length < QUESTIONS_PER_EVENT) {
    const fallback = shuffleInPlace([...bank]);
    for (const question of fallback) {
      if (selected.length >= QUESTIONS_PER_EVENT) break;
      const key = String(question.id);
      if (selectedIds.has(key)) continue;
      selected.push(question);
      selectedIds.add(key);
    }
  }

  return selected.slice(0, QUESTIONS_PER_EVENT).map((q) => q.id);
}

function getQuestionById(questionId) {
  return loadQuestionBank().find((q) => q.id === questionId) || null;
}

function buildQuestionKeyboard(eventKey, questionIndex, options) {
  return {
    inline_keyboard: options.map((option, optionIndex) => ([{
      text: `${optionIndex + 1}. ${option}`,
      callback_data: `mini_ev_a_${eventKey}_${questionIndex}_${optionIndex}`
    }]))
  };
}

function calculateNextIntervalMs(now, cutoff, remainingQuestions) {
  const remainingMs = cutoff.getTime() - now.getTime();
  if (remainingQuestions <= 0) {
    return 0;
  }

  if (remainingMs <= 0) {
    return 0;
  }

  return Math.max(Math.floor(remainingMs / remainingQuestions), MIN_INTERVAL_MS);
}

async function getOrCreateEventDay(eventDate) {
  const defaults = {
    event_date: eventDate,
    total_questions: QUESTIONS_PER_EVENT,
    question_ids: pickQuestionIds(),
    is_closed: false
  };

  const [day, created] = await MiniEventDay.findOrCreate({
    where: { event_date: eventDate },
    defaults
  });

  if (created && Array.isArray(day.question_ids)) {
    appendBankHistoryEntries('mini_event', day.question_ids);
  }

  if (!Array.isArray(day.question_ids) || day.question_ids.length < QUESTIONS_PER_EVENT) {
    const newQuestionIds = pickQuestionIds();
    await day.update({ question_ids: newQuestionIds, total_questions: QUESTIONS_PER_EVENT });
    await day.reload();
    appendBankHistoryEntries('mini_event', newQuestionIds);
  }

  return day;
}

async function getRank(eventDate, userId) {
  const rows = await MiniEventParticipant.findAll({
    where: { event_date: eventDate },
    order: [
      ['quiz_points', 'DESC'],
      ['correct_answers', 'DESC'],
      ['answered_count', 'DESC'],
      ['last_answer_at', 'ASC'],
      ['joined_at', 'ASC']
    ]
  });

  const index = rows.findIndex((row) => String(row.user_id) === String(userId));
  return {
    rank: index >= 0 ? index + 1 : null,
    total: rows.length
  };
}

async function sendQuestionToParticipant(bot, day, participant) {
  const now = getMoscowNow();
  const eventDate = day.event_date;
  const cutoff = getCutoffTime(eventDate);

  if (now >= cutoff) {
    return false;
  }

  if (participant.waiting_for_answer) {
    return false;
  }

  if (participant.current_question_index >= day.total_questions) {
    if (participant.status !== 'completed') {
      await participant.update({
        status: 'completed',
        completed_at: participant.completed_at || now,
        next_question_at: null
      });
    }
    return false;
  }

  if (participant.next_question_at && participant.next_question_at > now) {
    return false;
  }

  const questionId = day.question_ids[participant.current_question_index];
  const question = getQuestionById(questionId);
  if (!question || !Array.isArray(question.options) || question.options.length < 2) {
    return false;
  }

  const eventKey = getEventKeyFromDate(eventDate);
  const keyboard = buildQuestionKeyboard(eventKey, participant.current_question_index, question.options);

  const rank = await getRank(eventDate, participant.user_id);
  const progressText = `Прогресс: ${participant.answered_count}/${day.total_questions}.\nТекущее место: ${rank.rank || '-'} из ${rank.total}.`;

  const message =
    `🎮 <b>Мини-игра выходного дня</b>\n` +
    `Вопрос ${participant.current_question_index + 1}/${day.total_questions}\n\n` +
    `${question.question}\n\n` +
    `${progressText}\n\n` +
    `Следующий вопрос придет только после твоего ответа.`;

  await sendUserMessage(bot, participant.user_id, message, {
    parse_mode: 'HTML',
    reply_markup: keyboard
  });

  await participant.update({
    waiting_for_answer: true,
    last_question_sent_at: now,
    next_question_at: null
  });

  return true;
}

async function sendQueuedQuestions(bot) {
  const today = getTodayEventDate();
  const day = await MiniEventDay.findOne({ where: { event_date: today, is_closed: false } });
  if (!day) {
    return;
  }

  const now = getMoscowNow();
  const cutoff = getCutoffTime(today);
  if (now >= cutoff) {
    await finalizeEventDay(bot, today);
    return;
  }

  const dueParticipants = await MiniEventParticipant.findAll({
    where: {
      event_date: today,
      status: 'active',
      waiting_for_answer: false,
      current_question_index: { [Op.lt]: day.total_questions },
      [Op.or]: [
        { next_question_at: null },
        { next_question_at: { [Op.lte]: now } }
      ]
    },
    order: [['next_question_at', 'ASC'], ['joined_at', 'ASC']],
    limit: 100
  });

  for (const participant of dueParticipants) {
    try {
      await sendQuestionToParticipant(bot, day, participant);
    } catch (error) {
      console.error(`Ошибка отправки вопроса mini event user=${participant.user_id}:`, error.message);
    }
  }
}

async function findParticipant(eventDate, userId) {
  return MiniEventParticipant.findOne({
    where: {
      event_date: eventDate,
      user_id: userId
    }
  });
}

export async function broadcastMiniEventInvite(bot, force = false) {
  try {
    if (!force && !isSaturdayInMoscow()) {
      return { skipped: true, reason: 'not_saturday' };
    }

    const eventDate = getTodayEventDate();
    const day = await getOrCreateEventDay(eventDate);

    if (!force && day.invite_sent_at) {
      return { skipped: true, reason: 'already_sent' };
    }

    const users = await User.findAll({
      attributes: ['telegram_id'],
      where: { is_active: true }
    });

    const eventKey = getEventKeyFromDate(eventDate);
    let success = 0;
    let fails = 0;

    for (const user of users) {
      try {
        await sendUserMessage(
          bot,
          user.telegram_id,
          `🎮 <b>Mini-joc de sâmbătă | Субботняя мини-игра</b>\n\n` +
            `Ești gata de un challenge de engleză?\n` +
            `Готов(а) к челленджу по английскому?\n\n` +
            `🧠 <b>10 întrebări / 10 вопросов</b>\n` +
            `gramatică • traducere • alege varianta corectă\n` +
            `грамматика • перевод • выбери правильный вариант\n\n` +
            `🏆 <b>Premii / Награды</b>\n` +
            `🥇 300 puncte | 🥈 200 | 🥉 100\n` +
            `🎁 Participare: 50 puncte | 🎁 Участие: 50 очков\n\n` +
            `⏰ Doar azi, până la 23:00.\n` +
            `⏰ Только сегодня, до 23:00.\n\n` +
            `🚀 Apasă „Participă” și începe jocul!\n` +
            `🚀 Нажми «Участвовать» и начни игру!`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '✅ Участвовать', callback_data: `mini_ev_join_${eventKey}` }]]
            }
          }
        );
        success += 1;
      } catch (error) {
        fails += 1;
      }
    }

    await day.update({ invite_sent_at: getMoscowNow() });
    await sendAdminMessage(bot, `📣 Mini Event invite: ✅ ${success} / ❌ ${fails} (${eventDate})`);

    return { success, fails, eventDate };
  } catch (error) {
    console.error('Ошибка broadcastMiniEventInvite:', error.message);
    await sendAdminMessage(bot, `‼️ Ошибка mini-event invite: ${error.message}`);
    return { success: 0, fails: 0, error: error.message };
  }
}

export async function sendMiniEventEntryPoint(bot, chatId, userId) {
  const today = getTodayEventDate();
  const eventKey = getEventKeyFromDate(today);
  const cutoff = getCutoffTime(today);
  const now = getMoscowNow();

  if (!isSaturdayInMoscow()) {
    await sendUserMessage(bot, chatId, 'ℹ️ Мини-игра запускается по субботам. Напомню в ближайшую субботу.');
    return;
  }

  if (now >= cutoff) {
    await sendUserMessage(bot, chatId, '⏰ Сегодняшняя мини-игра уже завершилась (после 23:00).');
    return;
  }

  const participant = await findParticipant(today, userId);
  if (participant) {
    const day = await getOrCreateEventDay(today);
    const rank = await getRank(today, userId);
    await sendUserMessage(
      bot,
      chatId,
      `Ты уже участвуешь.\nПрогресс: ${participant.answered_count}/${day.total_questions}.\nТекущее место: ${rank.rank || '-'} из ${rank.total}.`
    );
    return;
  }

  await sendUserMessage(
    bot,
    chatId,
    `🎮 <b>Mini-joc de sâmbătă | Субботняя мини-игра</b>\n\n` +
      `Ești gata de un challenge de engleză?\n` +
      `Готов(а) к челленджу по английскому?\n\n` +
      `🧠 <b>10 întrebări / 10 вопросов</b>\n` +
      `gramatică • traducere • alege varianta corectă\n` +
      `грамматика • перевод • выбери правильный вариант\n\n` +
      `🏆 <b>Premii / Награды</b>\n` +
      `🥇 300 puncte | 🥈 200 | 🥉 100\n` +
      `🎁 Participare: 50 puncte | 🎁 Участие: 50 очков\n\n` +
      `⏰ Doar azi, până la 23:00.\n` +
      `⏰ Только сегодня, до 23:00.\n\n` +
      `🚀 Apasă „Participă” și începe jocul!\n` +
      `🚀 Нажми «Участвовать» и начни игру!`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '✅ Участвовать', callback_data: `mini_ev_join_${eventKey}` }]]
      }
    }
  );
}

export async function handleMiniEventJoinCallback(bot, callbackQuery) {
  try {
    const data = callbackQuery.data || '';
    const parts = data.split('_');
    if (parts.length !== 4 || parts[0] !== 'mini' || parts[1] !== 'ev' || parts[2] !== 'join') {
      return false;
    }

    const eventKey = parts[3];
    const eventDate = getDateFromEventKey(eventKey);
    if (!eventDate) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '⚠️ Некорректный ивент', show_alert: true });
      return true;
    }

    const now = getMoscowNow();
    const today = getTodayEventDate();
    if (eventDate !== today) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '⏰ Ивент уже неактуален', show_alert: true });
      return true;
    }

    const cutoff = getCutoffTime(eventDate);
    if (now >= cutoff) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '⏰ Прием участников завершен (после 23:00)', show_alert: true });
      return true;
    }

    const day = await getOrCreateEventDay(eventDate);
    let participant = await findParticipant(eventDate, callbackQuery.from.id);

    if (!participant) {
      participant = await MiniEventParticipant.create({
        event_date: eventDate,
        user_id: callbackQuery.from.id,
        joined_at: now,
        next_question_at: now,
        status: 'active'
      });
    }

    if (participant.status !== 'active') {
      await participant.update({ status: 'active', next_question_at: now });
    }

    await bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Ты в игре!' });
    await sendUserMessage(
      bot,
      callbackQuery.from.id,
      'Отлично, участие подтверждено. Первый вопрос отправляю сейчас.'
    );

    await sendQuestionToParticipant(bot, day, participant);
    return true;
  } catch (error) {
    console.error('Ошибка handleMiniEventJoinCallback:', error.message);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '⚠️ Ошибка участия', show_alert: true });
    return true;
  }
}

export async function handleMiniEventAnswerCallback(bot, callbackQuery) {
  try {
    const data = callbackQuery.data || '';
    const parts = data.split('_');
    if (parts.length !== 6 || parts[0] !== 'mini' || parts[1] !== 'ev' || parts[2] !== 'a') {
      return false;
    }

    const eventKey = parts[3];
    const questionIndex = Number(parts[4]);
    const selectedOptionIndex = Number(parts[5]);

    if (!Number.isInteger(questionIndex) || !Number.isInteger(selectedOptionIndex)) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '⚠️ Неверный формат ответа', show_alert: true });
      return true;
    }

    const eventDate = getDateFromEventKey(eventKey);
    if (!eventDate) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '⚠️ Ивент не найден', show_alert: true });
      return true;
    }

    const day = await MiniEventDay.findOne({ where: { event_date: eventDate } });
    if (!day || day.is_closed) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '⏰ Игра завершена', show_alert: true });
      return true;
    }

    const participant = await findParticipant(eventDate, callbackQuery.from.id);
    if (!participant) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'ℹ️ Сначала подтверди участие', show_alert: true });
      return true;
    }

    if (participant.status !== 'active') {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '⏰ Ты уже завершил этот ивент', show_alert: true });
      return true;
    }

    if (!participant.waiting_for_answer) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'ℹ️ Сейчас нет активного вопроса', show_alert: true });
      return true;
    }

    if (participant.current_question_index !== questionIndex) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: 'ℹ️ Сначала ответь на текущий вопрос',
        show_alert: true
      });
      return true;
    }

    const questionId = day.question_ids[questionIndex];
    const question = getQuestionById(questionId);
    if (!question) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '⚠️ Вопрос не найден', show_alert: true });
      return true;
    }

    if (selectedOptionIndex < 0 || selectedOptionIndex >= question.options.length) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: '⚠️ Неверный вариант', show_alert: true });
      return true;
    }

    const exists = await MiniEventResponse.findOne({
      where: {
        event_date: eventDate,
        user_id: callbackQuery.from.id,
        question_index: questionIndex
      }
    });
    if (exists) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'ℹ️ Ответ уже засчитан', show_alert: true });
      return true;
    }

    const now = getMoscowNow();
    const isCorrect = selectedOptionIndex === question.correctIndex;
    const earnedQuizPoints = isCorrect ? CORRECT_ANSWER_POINTS : 0;
    const responseTime = participant.last_question_sent_at
      ? now.getTime() - new Date(participant.last_question_sent_at).getTime()
      : null;

    await MiniEventResponse.create({
      event_date: eventDate,
      user_id: callbackQuery.from.id,
      question_index: questionIndex,
      question_id: question.id,
      selected_option_index: selectedOptionIndex,
      is_correct: isCorrect,
      response_time_ms: responseTime,
      answered_at: now
    });

    const answeredCount = participant.answered_count + 1;
    const correctAnswers = participant.correct_answers + (isCorrect ? 1 : 0);
    const quizPoints = participant.quiz_points + earnedQuizPoints;
    const nextQuestionIndex = participant.current_question_index + 1;
    const remainingQuestions = day.total_questions - nextQuestionIndex;
    const cutoff = getCutoffTime(eventDate);
    const nextInterval = calculateNextIntervalMs(now, cutoff, remainingQuestions);

    const nextQuestionAt = remainingQuestions > 0 && nextInterval > 0
      ? new Date(now.getTime() + nextInterval)
      : null;

    const isCompleted = nextQuestionIndex >= day.total_questions;

    await participant.update({
      answered_count: answeredCount,
      correct_answers: correctAnswers,
      quiz_points: quizPoints,
      current_question_index: nextQuestionIndex,
      waiting_for_answer: false,
      next_question_at: isCompleted ? null : nextQuestionAt,
      last_answer_at: now,
      status: isCompleted ? 'completed' : 'active',
      completed_at: isCompleted ? now : null
    });

    const rank = await getRank(eventDate, callbackQuery.from.id);
    const feedback = isCorrect
      ? `✅ Верно! +${earnedQuizPoints} очков за вопрос.`
      : `❌ Неверно. Правильный ответ: ${question.options[question.correctIndex]}.`;

    const nextInfo = isCompleted
      ? 'Ты ответил на все 10 вопросов. Финальные места и награды отправлю после 23:00.'
      : `Следующий вопрос: примерно через ${Math.max(1, Math.round(nextInterval / 60000))} мин.`;

    await sendUserMessage(
      bot,
      callbackQuery.from.id,
      `${feedback}\n\n` +
        `Прогресс: ${answeredCount}/${day.total_questions}.\n` +
        `Текущее место: ${rank.rank || '-'} из ${rank.total}.\n` +
        `${nextInfo}`
    );

    await bot.answerCallbackQuery(callbackQuery.id, {
      text: isCorrect ? '✅ Правильно!' : '❌ Есть ошибка',
      show_alert: false
    });

    if (!isCompleted) {
      await sendQueuedQuestions(bot);
    }

    return true;
  } catch (error) {
    console.error('Ошибка handleMiniEventAnswerCallback:', error.message);
    await bot.answerCallbackQuery(callbackQuery.id, { text: '⚠️ Ошибка обработки ответа', show_alert: true });
    return true;
  }
}

export async function processMiniEventQueue(bot) {
  try {
    await sendQueuedQuestions(bot);
  } catch (error) {
    console.error('Ошибка processMiniEventQueue:', error.message);
  }
}

export async function finalizeEventDay(bot, eventDate = null, force = false) {
  const targetDate = eventDate || getTodayEventDate();

  try {
    const day = await MiniEventDay.findOne({ where: { event_date: targetDate } });
    if (!day) {
      return { ok: true, skipped: 'no_day' };
    }

    if (!force) {
      const now = getMoscowNow();
      const cutoff = getCutoffTime(targetDate);
      if (now < cutoff) {
        return { ok: true, skipped: 'not_finished_yet' };
      }
    }

    if (day.is_closed && day.finalized_at) {
      return { ok: true, skipped: 'already_finalized' };
    }

    const participants = await MiniEventParticipant.findAll({
      where: { event_date: targetDate },
      include: [{
        model: User,
        as: 'User',
        attributes: ['telegram_id', 'username', 'first_name'],
        required: false
      }],
      order: [
        ['quiz_points', 'DESC'],
        ['correct_answers', 'DESC'],
        ['answered_count', 'DESC'],
        ['last_answer_at', 'ASC'],
        ['joined_at', 'ASC']
      ]
    });

    for (let i = 0; i < participants.length; i += 1) {
      const participant = participants[i];
      const place = i + 1;
      const placeReward = place <= 3 ? PLACE_REWARDS[place - 1] : 0;
      const participationReward = PARTICIPATION_REWARD;
      const totalReward = participationReward + placeReward;

      if (!participant.award_granted) {
        await awardPoints(participant.user_id, totalReward);
      }

      await participant.update({
        reward_points: totalReward,
        award_granted: true,
        status: participant.status === 'completed' ? 'completed' : 'finished'
      });

      const name = participant.User?.first_name || participant.User?.username || `ID ${participant.user_id}`;
      const finalMessage =
        `🏁 Мини-игра за ${targetDate} завершена.\n` +
        `Твое место: ${place}/${participants.length}.\n` +
        `Результат: ${participant.correct_answers}/${day.total_questions}, quiz points: ${participant.quiz_points}.\n` +
        `Награда: участие ${participationReward} + место ${placeReward} = ${totalReward} очков.\n\n` +
        `Спасибо за участие, ${name}!`;

      await sendUserMessage(bot, participant.user_id, finalMessage);
    }

    await day.update({
      is_closed: true,
      finalized_at: getMoscowNow()
    });

    await sendAdminMessage(bot, `✅ Mini event ${targetDate} finalized. Participants: ${participants.length}`);

    return { ok: true, participants: participants.length };
  } catch (error) {
    console.error('Ошибка finalizeEventDay:', error.message);
    await sendAdminMessage(bot, `‼️ Ошибка finalize mini-event ${targetDate}: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

export async function adminTriggerMiniEventInvite(bot) {
  const today = getTodayEventDate();
  const day = await getOrCreateEventDay(today);
  await day.update({ invite_sent_at: null, is_closed: false, finalized_at: null });
  return broadcastMiniEventInvite(bot, true);
}

/**
 * Сводка субботнего мини-ивента за календарный день (event_date = YYYY-MM-DD по Москве).
 * Используется в ежедневном админ-отчёте.
 *
 * - joined: нажали «Участвовать»
 * - played: ответили хотя бы на 1 вопрос
 * - totalPoints: после финала — сумма reward_points по участникам; до финала — сумма quiz_points
 */
export async function getMiniEventDailySummary(eventDate) {
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(eventDate))) {
    return null;
  }

  const rows = await MiniEventParticipant.findAll({
    where: { event_date: eventDate },
    attributes: ['user_id', 'answered_count', 'quiz_points', 'reward_points', 'award_granted', 'status'],
  });

  if (rows.length === 0) {
    return {
      eventDate,
      joined: 0,
      played: 0,
      completed: 0,
      totalPoints: 0,
      anyFinalized: false,
      playedUserIds: [],
    };
  }

  const joined = rows.length;
  const playedRows = rows.filter((r) => (r.answered_count || 0) > 0);
  const played = playedRows.length;
  const playedUserIds = playedRows.map((r) => String(r.user_id));
  const completed = rows.filter((r) => r.status === 'completed').length;
  const anyFinalized = rows.some((r) => r.award_granted);

  const totalPoints = rows.reduce((sum, r) => {
    if (r.award_granted) {
      return sum + (Number(r.reward_points) || 0);
    }
    return sum + (Number(r.quiz_points) || 0);
  }, 0);

  return {
    eventDate,
    joined,
    played,
    completed,
    totalPoints,
    anyFinalized,
    playedUserIds,
  };
}
