import { User } from '../models/User.js';
import { sequelize } from '../database/database.js';
import constants from '../config/constants.js';
import logger from '../utils/logger.js';
import { Op } from 'sequelize';

export const userServices = {
  /**
   * Регистрация/получение пользователя
   */
  async findOrCreateUser(telegramId, userData) {
    try {
      const [user, created] = await User.findOrCreate({
        where: { telegram_id: telegramId },
        defaults: {
          username: userData.username,
          first_name: userData.firstName,
          last_name: userData.lastName,
          points: 0,
          is_active: true,
          first_activity: new Date(),
          last_activity: new Date()
        }
      });

      if (!created) {
        await user.update({
          last_activity: new Date(),
          is_active: true,
          ...(userData.username && { username: userData.username }),
          ...(userData.firstName && { first_name: userData.firstName }),
          ...(userData.lastName && { last_name: userData.lastName })
        });
      }

      logger.info(`User ${telegramId} ${created ? 'created' : 'updated'}`);
      return user;
    } catch (error) {
      logger.error(`User findOrCreate error: ${error.message}`, { telegramId });
      throw error;
    }
  },

  /**
   * Начисление очков пользователю
   */
  async awardPoints(telegramId, points) {
    try {
      if (!Number.isInteger(points) || points <= 0) {
        throw new Error('Invalid points value');
      }

      const result = await User.increment('points', {
        by: points,
        where: { telegram_id: telegramId },
        returning: true
      });

      if (result[0][1] === 0) {
        throw new Error('User not found');
      }

      logger.info(`Awarded ${points} points to user ${telegramId}`);
      return result[0][1];
    } catch (error) {
      logger.error(`Award points error: ${error.message}`, { telegramId });
      throw error;
    }
  },

  /**
   * Получение таблицы лидеров
   */
  async getLeaderboard(limit = 10) {
    try {
      return await User.findAll({
        where: { is_active: true },
        order: [['points', 'DESC']],
        limit: parseInt(limit),
        attributes: ['telegram_id', 'username', 'first_name', 'points']
      });
    } catch (error) {
      logger.error(`Leaderboard error: ${error.message}`);
      throw error;
    }
  },

  /**
   * Получение информации о пользователе
   */
  async getUserInfo(telegramId) {
    try {
      return await User.findOne({
        where: { telegram_id: telegramId },
        attributes: [
          'username',
          'first_name',
          'last_name',
          'points',
          'first_activity',
          'last_activity',
          'is_active'
        ]
      });
    } catch (error) {
      logger.error(`Get user info error: ${error.message}`, { telegramId });
      throw error;
    }
  },

  /**
   * Деактивация неактивных пользователей
   */
  async deactivateInactiveUsers(inactiveDays = 90) {
    try {
      const inactiveDate = new Date();
      inactiveDate.setDate(inactiveDate.getDate() - inactiveDays);

      const result = await User.update(
        { is_active: false },
        {
          where: {
            last_activity: { [Op.lt]: inactiveDate },
            is_active: true
          }
        }
      );

      logger.info(`Deactivated ${result[0]} inactive users`);
      return result[0];
    } catch (error) {
      logger.error(`Deactivate users error: ${error.message}`);
      throw error;
    }
  },

  /**
   * Обновление данных пользователя
   */
  async updateUser(telegramId, updateData) {
    try {
      const result = await User.update(updateData, {
        where: { telegram_id: telegramId },
        returning: true
      });

      if (result[0] === 0) {
        throw new Error('User not found');
      }

      logger.info(`Updated user ${telegramId}`, { updateData });
      return result[1][0];
    } catch (error) {
      logger.error(`Update user error: ${error.message}`, { telegramId });
      throw error;
    }
  },

  /**
   * Получение количества активных пользователей
   */
  async getActiveUsersCount() {
    try {
      return await User.count({ where: { is_active: true } });
    } catch (error) {
      logger.error(`Active users count error: ${error.message}`);
      throw error;
    }
  },

  /**
   * Поиск пользователя по имени/username
   */
  async searchUsers(query, limit = 5) {
    try {
      return await User.findAll({
        where: {
          is_active: true,
          [Op.or]: [
            { username: { [Op.iLike]: `%${query}%` } },
            { first_name: { [Op.iLike]: `%${query}%` } },
            { last_name: { [Op.iLike]: `%${query}%` } }
          ]
        },
        limit: parseInt(limit),
        attributes: ['telegram_id', 'username', 'first_name', 'last_name']
      });
    } catch (error) {
      logger.error(`User search error: ${error.message}`, { query });
      throw error;
    }
  },

  /**
   * Массовая рассылка сообщения пользователям
   */
  async broadcastMessage(bot, messageGenerator, errorHandler) {
    try {
      const users = await User.findAll({ where: { is_active: true } });
      let results = { success: 0, fails: 0 };

      for (const user of users) {
        try {
          if (!user.telegram_id) continue;

          const content = await messageGenerator();
          await bot.sendMessage(user.telegram_id, content, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
          });

          await user.update({ last_activity: new Date() });
          results.success++;

          // Задержка между сообщениями
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          results.fails++;
          logger.error(`Broadcast to ${user.telegram_id} failed: ${error.message}`);

          if (errorHandler) {
            errorHandler(error, user);
          }

          // Если пользователь заблокировал бота
          if (error.response?.body?.error_code === 403) {
            await user.update({ is_active: false });
          }
        }
      }

      logger.info(`Broadcast completed`, results);
      return results;
    } catch (error) {
      logger.error(`Broadcast failed: ${error.message}`);
      throw error;
    }
  }
};