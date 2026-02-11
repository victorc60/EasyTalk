import Poll from '../models/Poll.js';
import PollDelivery from '../models/PollDelivery.js';
import PollResponse from '../models/PollResponse.js';
import User from '../models/User.js';
import { sendAdminMessage } from '../utils/botUtils.js';

const POLL_THROTTLE_MS = 300;

export async function createPoll(question, options, allowsMultiple = false) {
  return Poll.create({
    question,
    options,
    allows_multiple: allowsMultiple,
    is_anonymous: false,
    status: 'active'
  });
}

export async function sendPollToAllUsers(bot, poll) {
  const users = await User.findAll({
    where: { is_active: true },
    attributes: ['telegram_id']
  });

  let success = 0;
  let fails = 0;

  for (const user of users) {
    try {
      const message = await bot.sendPoll(
        user.telegram_id,
        poll.question,
        poll.options,
        {
          is_anonymous: false,
          allows_multiple_answers: poll.allows_multiple
        }
      );

      const telegramPollId = message?.poll?.id;
      if (telegramPollId) {
        await PollDelivery.create({
          poll_id: poll.id,
          telegram_poll_id: telegramPollId,
          chat_id: user.telegram_id,
          message_id: message.message_id
        });
      }

      await user.update({ last_activity: new Date() });
      success++;
    } catch (error) {
      fails++;
      if (error.response?.statusCode === 403) {
        await user.update({ is_active: false });
      }
      console.error(`Ошибка отправки опроса ${user.telegram_id}:`, error.message);
    }

    await new Promise(resolve => setTimeout(resolve, POLL_THROTTLE_MS));
  }

  return { success, fails };
}

export async function savePollAnswer(pollAnswer) {
  const telegramPollId = pollAnswer?.poll_id;
  const userId = pollAnswer?.user?.id;
  const optionIds = pollAnswer?.option_ids || [];

  if (!telegramPollId || !userId) {
    return { handled: false, reason: 'missing_data' };
  }

  const delivery = await PollDelivery.findOne({ where: { telegram_poll_id: telegramPollId } });
  if (!delivery) {
    return { handled: false, reason: 'delivery_not_found' };
  }

  const poll = await Poll.findByPk(delivery.poll_id);
  if (!poll) {
    return { handled: false, reason: 'poll_not_found' };
  }

  const existing = await PollResponse.findOne({ where: { poll_id: poll.id, user_id: userId } });
  if (existing) {
    existing.option_ids = optionIds;
    await existing.save();
  } else {
    await PollResponse.create({
      poll_id: poll.id,
      telegram_poll_id: telegramPollId,
      user_id: userId,
      option_ids: optionIds
    });
  }

  return { handled: true, poll };
}

export async function getLatestPoll() {
  return Poll.findOne({ order: [['created_at', 'DESC']] });
}

export async function getPollStats(pollId) {
  const poll = await Poll.findByPk(pollId);
  if (!poll) return null;

  const [deliveries, responses] = await Promise.all([
    PollDelivery.findAll({ where: { poll_id: pollId } }),
    PollResponse.findAll({ where: { poll_id: pollId } })
  ]);

  const optionCounts = Array.from({ length: poll.options.length }).fill(0);
  for (const response of responses) {
    const ids = Array.isArray(response.option_ids) ? response.option_ids : [];
    ids.forEach(idx => {
      if (optionCounts[idx] !== undefined) {
        optionCounts[idx] += 1;
      }
    });
  }

  return {
    poll,
    deliveriesCount: deliveries.length,
    responsesCount: responses.length,
    optionCounts
  };
}

export async function notifyPollError(bot, message) {
  try {
    await sendAdminMessage(bot, message);
  } catch (error) {
    console.error('Не удалось отправить сообщение админу:', error.message);
  }
}
