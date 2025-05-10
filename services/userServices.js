// services/userServices.js
import User from '../models/User.js';
import sequelize from '../database/database.js';
import { Op } from 'sequelize'; 
import { sendAdminMessage, sendUserMessage } from '../utils/botUtils.js';

export async function sendToAllUsers(bot, messageGenerator, errorHandler) {
  try {
    const users = await User.findAll({ 
      attributes: ['telegram_id']
    });
    let results = { success: 0, fails: 0 };

    if (users.length === 0) {
      console.log('Нет зарегистрированных пользователей для рассылки');
      await sendAdminMessage(
        bot,
        '⚠️ Рассылка не выполнена: нет зарегистрированных пользователей в базе данных'
      );
      return results;
    }

    console.log(`Найдено пользователей для рассылки: ${users.length}`);

    for (const user of users) {
      if (!user.telegram_id || isNaN(user.telegram_id)) {
        console.error(`Некорректный telegram_id для пользователя: ${JSON.stringify(user)}`);
        results.fails++;
        continue;
      }

      try {
        const content = await messageGenerator(user.telegram_id);
        if (!content) {
          console.error(`Пустой контент для пользователя ${user.telegram_id}`);
          results.fails++;
          continue;
        }

        await sendUserMessage(bot, user.telegram_id, content);
        await user.update({ last_activity: new Date() });
        results.success++;
        console.log(`Сообщение успешно отправлено пользователю ${user.telegram_id}`);
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        results.fails++;
        console.error(`Ошибка отправки пользователю ${user.telegram_id}:`, error.message);
        if (errorHandler) {
          errorHandler(error, user);
        }
        if (error.response?.statusCode === 403) {
          console.log(`Пользователь ${user.telegram_id} заблокировал бота`);
          await user.update({ isActive: false });
        }
      }
    }

    return results;
  } catch (error) {
    console.error('Ошибка массовой рассылки:', error.message);
    await sendAdminMessage(
      bot,
      `‼️ Ошибка массовой рассылки: ${error.message}`
    );
    return { success: 0, fails: 0 };
  }
}

export async function cleanupInactiveUsers() {
  const inactivePeriod = new Date();
  inactivePeriod.setMonth(inactivePeriod.getMonth() - 3);
  
  try {
    const users = await User.findAll({
      where: {
        last_activity: { [Op.lt]: inactivePeriod }
      }
    });
    
    for (const user of users) {
      await user.update({ isActive: false });
      console.log(`Пользователь ${user.telegram_id} помечен как неактивный`);
    }
  } catch (error) {
    console.error('Ошибка очистки неактивных пользователей:', error.message);
    await sendAdminMessage(
      bot,
      `‼️ Ошибка очистки неактивных пользователей: ${error.message}`
    );
  }
}

export async function awardPoints(userId, points) {
  try {
    await User.increment('points', {
      where: { telegram_id: userId },
      by: points
    });
    return true;
  } catch (error) {
    console.error('Ошибка начисления очков:', error.message);
    return false;
  }
}

export async function getLeaderboard() {
  try {
    return await User.findAll({
      where: {
        isActive: true,
        points: { [Op.gt]: 0 } // Используем Op.gt
      },
      order: [['points', 'DESC']],
      limit: 10,
      attributes: ['id', 'telegram_id', 'username', 'first_name', 'points']
    });
  } catch (error) {
    console.error('Ошибка при получении таблицы лидеров:', error);
    throw error;
  }
}