// handlers/commandHandlers.js
import User from '../models/User.js';
import { sendUserMessage, sendAdminMessage } from '../utils/botUtils.js';
import { startRolePlay, showLeaderboard, sendConversationStarter, broadcastMessage } from '../features/botFeatures.js';

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
        is_active: true
      }
    });

    if (created) {
      console.log(`Создан новый пользователь: ${msg.chat.id}`);
    } else {
      console.log(`Пользователь уже существует: ${msg.chat.id}, обновляем is_active`);
      await user.update({ is_active: true, last_activity: new Date() });
    }

    const welcomeMessage = `
👋 <b>Привет, ${msg.from.first_name}!</b> Я твой помощник в изучении английского.

📌 <b>Доступные режимы:</b>
1. <b>Свободное общение</b> - /mode_free_talk
2. <b>Ролевые игры</b> - /mode_role_play
3. <b>Проверка ошибок</b> - /mode_correction
📋 Показать режимы с выбором: /mode

🎮 <b>Игры и активность:</b>
🔤 Слово дня в 18:30
📚 Интересные факты в 17:30
💬 /topic - тема для обсуждения
🎭 /roleplay - ролевая игра

📊 /progress - твой прогресс
🏆 /leaders - таблица лидеров

Выбирай что тебе интересно и практикуй английский!`;

    await sendUserMessage(bot, msg.chat.id, welcomeMessage, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Ошибка при обработке команды /start:', error);
    await sendUserMessage(bot, msg.chat.id, '⚠️ Произошла ошибка при регистрации. Попробуйте еще раз.');
    await sendAdminMessage(bot, `‼️ Ошибка команды /start: ${error.message}`);
  }
}

export async function leaderboard(bot, msg) {
  try {
    await showLeaderboard(bot, msg.chat.id, msg.from.id);
  } catch (error) {
    console.error('Ошибка в команде /leaders:', error);
    await sendUserMessage(
      bot,
      msg.chat.id,
      '⚠️ Не удалось загрузить таблицу лидеров. Попробуйте позже.',
      { parse_mode: 'HTML' }
    );
    await sendAdminMessage(
      bot,
      `‼️ Ошибка в команде /leaders: ${error.message}\nStack: ${error.stack}`
    );
  }
}

export async function startRolePlayCommand(bot, msg, userSessions) {
  try {
    await startRolePlay(bot, msg.chat.id, userSessions);
  } catch (error) {
    console.error('Ошибка в команде /roleplay:', error);
    await sendUserMessage(
      bot,
      msg.chat.id,
      '⚠️ Не удалось начать ролевую игру. Попробуйте позже.',
      { parse_mode: 'HTML' }
    );
    await sendAdminMessage(
      bot,
      `‼️ Ошибка в команде /roleplay: ${error.message}\nStack: ${error.stack}`
    );
  }
}

export async function conversationTopic(bot, msg) {
  try {
    await sendConversationStarter(bot, msg.chat.id);
  } catch (error) {
    console.error('Ошибка в команде /topic:', error);
    await sendUserMessage(
      bot,
      msg.chat.id,
      '⚠️ Не удалось загрузить тему. Попробуйте позже.',
      { parse_mode: 'HTML' }
    );
    await sendAdminMessage(
      bot,
      `‼️ Ошибка в команде /topic: ${error.message}\nStack: ${error.stack}`
    );
  }
}

export async function setMode(bot, msg, userSessions, mode) {
  const validModes = ['free_talk', 'role_play', 'correction'];
  
  if (!mode) {
    await showModeSelection(bot, msg.chat.id);
    return;
  }

  if (!validModes.includes(mode)) {
    await sendUserMessage(
      bot,
      msg.chat.id,
      `⚠️ Неверный режим. Доступные: ${validModes.join(', ')}`,
      { parse_mode: 'HTML' }
    );
    return;
  }
  
  userSessions.conversationModes.set(msg.from.id, mode);
  await sendUserMessage(
    bot,
    msg.chat.id,
    `✅ Режим установлен: <b>${mode}</b>`,
    { parse_mode: 'HTML' }
  );
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
    console.error('Ошибка при отображении прогресса:', error);
    await sendUserMessage(bot, msg.chat.id, '⚠️ Произошла ошибка при загрузке прогресса.');
    await sendAdminMessage(
      bot,
      `‼️ Ошибка в команде /progress: ${error.message}\nStack: ${error.stack}`
    );
  }
}

export async function broadcast(bot, msg, userSessions) {
  try {
    const userId = msg.from.id.toString();
    if (userId !== process.env.ADMIN_ID && userId !== "340048933") {
      await sendUserMessage(
        bot,
        msg.chat.id,
        '⚠️ Эта команда доступна только администратору.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    userSessions.broadcastPending = true;
    userSessions.broadcastContent = { text: null, photo: null };
    await sendUserMessage(
      bot,
      msg.chat.id,
      '📢 Отправьте текст, картинку или оба для рассылки всем пользователям.',
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    console.error('Ошибка при обработке команды /broadcast:', error);
    await sendUserMessage(
      bot,
      msg.chat.id,
      '⚠️ Произошла ошибка при подготовке рассылки.',
      { parse_mode: 'HTML' }
    );
    await sendAdminMessage(bot, `‼️ Ошибка команды /broadcast: ${error.message}`);
  }
}