// handlers/commandHandlers.js
import User from '../models/User.js';
import { sendUserMessage } from '../utils/botUtils.js';
import { sendAdminMessage } from '../utils/botUtils.js';
import { startRolePlay, showLeaderboard, sendConversationStarter } from '../features/botFeatures.js';

export async function start(bot, msg) {
  try {
    const [user, created] = await User.findOrCreate({
      where: { telegram_id: msg.chat.id },
      defaults: {
        telegram_id: msg.chat.id,
        username: msg.from.username || `${msg.from.first_name}${msg.from.last_name ? ` ${msg.from.last_name}` : ''}`,
        first_name: msg.from.first_name,
        last_name: msg.from.last_name,
        first_activity: new Date(),
        last_activity: new Date(),
        points: 0,
        isActive: true
      }
    });

    if (created) {
      console.log(`Создан новый пользователь: ${msg.chat.id}`);
    } else {
      console.log(`Пользователь уже существует: ${msg.chat.id}, обновляем isActive`);
      await user.update({ isActive: true, last_activity: new Date() });
    }

    const welcomeMessage = `
👋 <b>Привет, ${msg.from.first_name}!</b> Я твой помощник в изучении английского.

📌 <b>Доступные режимы:</b>
1. <b>Свободное общение</b> - просто пиши мне на английском
2. <b>Ролевые игры</b> - общайся с разными персонажами
3. <b>Проверка ошибок</b> - я исправлю твои ошибки

🎮 <b>Игры и активность:</b>
🔤 Слово дня в 18:00
📚 Интересные факты в 17:00
💬 /topic - тема для обсуждения
🎭 /roleplay - ролевая игра

📊 /progress - твой прогресс
🏆 /top - таблица лидеров

Выбирай что тебе интересно и практикуй английский!`;

    await sendUserMessage(bot, msg.chat.id, welcomeMessage, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка при обработке команды /start:', error.message);
    await sendUserMessage(bot, msg.chat.id, '⚠️ Произошла ошибка при регистрации. Попробуйте еще раз.');
  }
}

export async function leaderboard(bot, msg) {
  try {
    await showLeaderboard(bot, msg.chat.id, msg.from.id);
  } catch (error) {
    console.error('Ошибка в команде /top:', error.message, error.stack);
    await sendUserMessage(
      bot,
      msg.chat.id,
      '⚠️ Не удалось загрузить таблицу лидеров. Попробуйте позже.',
      { parse_mode: 'HTML' }
    );
    await sendAdminMessage(
      bot,
      `‼️ Ошибка в команде /top:\n${error.message}\nStack: ${error.stack}`
    );
  }
}

export async function startRolePlayCommand(bot, msg, userSessions) {
  await startRolePlay(bot, msg.chat.id, userSessions);
}

export async function conversationTopic(bot, msg) {
  await sendConversationStarter(bot, msg.chat.id);
}

export async function setMode(bot, msg, userSessions, mode) {
  const validModes = ['free_talk', 'role_play', 'correction'];
  if (!validModes.includes(mode)) {
    await sendUserMessage(bot, msg.chat.id, '⚠️ Неверный режим. Доступные: free_talk, role_play, correction');
    return;
  }
  
  userSessions.conversationModes.set(msg.from.id, mode);
  await sendUserMessage(bot, msg.chat.id, `✅ Режим установлен: ${mode}`);
}

export async function showProgress(bot, msg) {
  try {
    const user = await User.findOne({ where: { telegram_id: msg.from.id } });
    if (!user) {
      await sendUserMessage(bot, msg.chat.id, 'ℹ️ Сначала запустите бота командой /start');
      return;
    }
    
    const progressMessage = `
📊 <b>Твой прогресс:</b>

🏅 Очков: ${user.points}
📅 Первый визит: ${user.first_activity.toLocaleDateString()}
🔄 Последняя активность: ${user.last_activity.toLocaleDateString()}

Продолжай практиковать английский!`;
    
    await sendUserMessage(bot, msg.chat.id, progressMessage, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка при отображении прогресса:', error.message);
    await sendUserMessage(bot, msg.chat.id, '⚠️ Произошла ошибка при загрузке прогресса.');
  }
}