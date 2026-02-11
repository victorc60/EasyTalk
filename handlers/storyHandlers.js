// handlers/storyHandlers.js
import { sendUserMessage } from '../utils/botUtils.js';
import { StoryService } from '../services/storyService.js';
import { awardPoints } from '../services/userServices.js';

export class StoryHandlers {
  constructor(openai) {
    this.storyService = new StoryService(openai);
    this.userSessions = new Map(); // Store user story generation sessions
  }

  async handleStoryCommand(bot, msg, userSessions) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text?.trim();

    try {
      // Check if user is in a story generation session
      if (this.userSessions.has(userId)) {
        const session = this.userSessions.get(userId);
        return await this.handleStorySession(bot, msg, session);
      }

      // Parse command arguments
      const args = text.split(' ').slice(1);
      const topic = args.length > 0 ? args.join(' ') : null;

      if (topic) {
        // Direct story generation with topic
        await this.generateStoryWithTopic(bot, chatId, userId, topic);
      } else {
        // Show story menu
        await this.showStoryMenu(bot, chatId);
      }
    } catch (error) {
      console.error('Error in handleStoryCommand:', error);
      await sendUserMessage(bot, chatId, '⚠️ Произошла ошибка при обработке команды. Попробуйте позже.');
    }
  }

  async showStoryMenu(bot, chatId) {
    const topics = this.storyService.getStoryTopics();
    const lengths = this.storyService.getStoryLengths();

    const keyboard = {
      inline_keyboard: [
        // Topic selection
        [
          { text: '🎭 Adventure', callback_data: 'story_topic_Adventure' },
          { text: '😂 Comedy', callback_data: 'story_topic_Comedy' }
        ],
        [
          { text: '🐾 Animals', callback_data: 'story_topic_Animals' },
          { text: '💻 Technology', callback_data: 'story_topic_Technology' }
        ],
        [
          { text: '✈️ Travel', callback_data: 'story_topic_Travel' },
          { text: '🍕 Food', callback_data: 'story_topic_Food' }
        ],
        [
          { text: '🎵 Music', callback_data: 'story_topic_Music' },
          { text: '🎨 Art', callback_data: 'story_topic_Art' }
        ],
        [
          { text: '🌿 Nature', callback_data: 'story_topic_Nature' },
          { text: '👫 Friendship', callback_data: 'story_topic_Friendship' }
        ],
        [
          { text: '🎲 Surprise me!', callback_data: 'story_topic_Surprise me!' }
        ],
        // Length selection
        [
          { text: '📏 Story Length:', callback_data: 'story_length_info' }
        ],
        [
          { text: '⚡ Short (1-2 min)', callback_data: 'story_length_short' },
          { text: '📖 Medium (2-3 min)', callback_data: 'story_length_medium' },
          { text: '📚 Long (3-5 min)', callback_data: 'story_length_long' }
        ]
      ]
    };

    const message = `📚 <b>Voice Story Generator</b>

🎯 Choose a topic for your humorous story, or let me surprise you!

📏 Choose the length of your story:
• <b>Short</b>: Quick laugh (1-2 minutes)
• <b>Medium</b>: Good story (2-3 minutes) 
• <b>Long</b>: Extended experience (3-5 minutes)

✨ I'll create a funny story and convert it to audio for you to listen to!`;

    await sendUserMessage(bot, chatId, message, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }

  async handleStoryCallback(bot, callbackQuery, userSessions) {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    try {
      if (data.startsWith('story_topic_')) {
        const topic = data.replace('story_topic_', '');
        await this.handleTopicSelection(bot, chatId, userId, topic);
      } else if (data.startsWith('story_length_')) {
        const length = data.replace('story_length_', '');
        await this.handleLengthSelection(bot, chatId, userId, length);
      } else if (data === 'story_length_info') {
        await this.showLengthInfo(bot, chatId);
      } else if (data === 'story_generate') {
        await this.generateStoryFromSession(bot, chatId, userId);
      } else if (data === 'story_text_only') {
        await this.generateStoryTextOnly(bot, chatId, userId);
      }

      await bot.answerCallbackQuery(callbackQuery.id);
    } catch (error) {
      console.error('Error in handleStoryCallback:', error);
      await sendUserMessage(bot, chatId, '⚠️ Произошла ошибка. Попробуйте позже.');
      await bot.answerCallbackQuery(callbackQuery.id);
    }
  }

  async handleTopicSelection(bot, chatId, userId, topic) {
    // Store or update user session
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, { topic: null, length: 'short' });
    }
    this.userSessions.get(userId).topic = topic;

    await sendUserMessage(bot, chatId, `✅ Topic selected: <b>${topic}</b>\n\nNow choose the length of your story!`, {
      parse_mode: 'HTML'
    });
  }

  async handleLengthSelection(bot, chatId, userId, length) {
    // Store or update user session
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, { topic: null, length: 'short' });
    }
    this.userSessions.get(userId).length = length;

    const lengthNames = {
      'short': 'Short (1-2 minutes)',
      'medium': 'Medium (2-3 minutes)',
      'long': 'Long (3-5 minutes)'
    };

    const session = this.userSessions.get(userId);
    const topic = session.topic || 'Random topic';

    const keyboard = {
      inline_keyboard: [
        [
          { text: '🎧 Generate Audio Story', callback_data: 'story_generate' },
          { text: '📝 Text Only', callback_data: 'story_text_only' }
        ]
      ]
    };

    await sendUserMessage(bot, chatId, `✅ Length selected: <b>${lengthNames[length]}</b>\n\nTopic: <b>${topic}</b>\n\nReady to create your story! Choose how you want to receive it:`, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }

  async showLengthInfo(bot, chatId) {
    const message = `📏 <b>Story Length Guide:</b>

⚡ <b>Short (1-2 minutes)</b>
• Perfect for a quick laugh
• Under 200 words
• Great for busy moments

📖 <b>Medium (2-3 minutes)</b>
• Good story development
• Under 400 words
• Balanced experience

📚 <b>Long (3-5 minutes)</b>
• Extended storytelling
• Under 600 words
• Full narrative experience

Choose your preferred length!`;

    await sendUserMessage(bot, chatId, message, { parse_mode: 'HTML' });
  }

  async generateStoryFromSession(bot, chatId, userId) {
    const session = this.userSessions.get(userId);
    if (!session) {
      await sendUserMessage(bot, chatId, '⚠️ Session expired. Please start over with /story');
      return;
    }

    await bot.sendChatAction(chatId, 'typing');
    await sendUserMessage(bot, chatId, '🎭 Creating your story... This may take a moment!');

    const result = await this.storyService.generateStoryWithAudio(
      session.topic === 'Surprise me!' ? null : session.topic,
      session.length
    );

    if (!result.success) {
      await sendUserMessage(bot, chatId, `❌ Error creating story: ${result.error}`);
      this.userSessions.delete(userId);
      return;
    }

    try {
      // Send the story text first
      await sendUserMessage(bot, chatId, `📚 <b>Your Story:</b>\n\n${result.story}`, {
        parse_mode: 'HTML'
      });

      // Send the audio file
      await bot.sendAudio(chatId, result.audioPath, {
        title: `${result.topic} Story`,
        performer: 'EasyTalk Bot',
        caption: `🎧 Listen to your story: "${result.topic}"`
      });

      // Award points for using the feature
      await awardPoints(userId, 10);
      await sendUserMessage(bot, chatId, '🎉 Story created successfully! +10 points for using the story feature!');

      // Clean up the audio file
      await this.storyService.cleanupAudioFile(result.audioPath);

    } catch (error) {
      console.error('Error sending story:', error);
      await sendUserMessage(bot, chatId, `📚 <b>Your Story:</b>\n\n${result.story}\n\n⚠️ Audio couldn't be sent, but here's your story text!`, {
        parse_mode: 'HTML'
      });
      await this.storyService.cleanupAudioFile(result.audioPath);
    }

    // Clear the session
    this.userSessions.delete(userId);
  }

  async generateStoryTextOnly(bot, chatId, userId) {
    const session = this.userSessions.get(userId);
    if (!session) {
      await sendUserMessage(bot, chatId, '⚠️ Session expired. Please start over with /story');
      return;
    }

    await bot.sendChatAction(chatId, 'typing');
    await sendUserMessage(bot, chatId, '📝 Creating your story...');

    const result = await this.storyService.generateStory(
      session.topic === 'Surprise me!' ? null : session.topic,
      session.length
    );

    if (!result.success) {
      await sendUserMessage(bot, chatId, `❌ Error creating story: ${result.error}`);
      this.userSessions.delete(userId);
      return;
    }

    await sendUserMessage(bot, chatId, `📚 <b>Your Story:</b>\n\n${result.story}`, {
      parse_mode: 'HTML'
    });

    await awardPoints(userId, 5);
    await sendUserMessage(bot, chatId, '🎉 Story created successfully! +5 points!');

    // Clear the session
    this.userSessions.delete(userId);
  }

  async generateStoryWithTopic(bot, chatId, userId, topic) {
    await bot.sendChatAction(chatId, 'typing');
    await sendUserMessage(bot, chatId, `🎭 Creating a "${topic}" story with audio... This may take a moment!`);

    const result = await this.storyService.generateStoryWithAudio(topic, 'short');

    if (!result.success) {
      await sendUserMessage(bot, chatId, `❌ Error creating story: ${result.error}`);
      return;
    }

    try {
      // Send the story text first
      await sendUserMessage(bot, chatId, `📚 <b>Your "${topic}" Story:</b>\n\n${result.story}`, {
        parse_mode: 'HTML'
      });

      // Send the audio file
      await bot.sendAudio(chatId, result.audioPath, {
        title: `${topic} Story`,
        performer: 'EasyTalk Bot',
        caption: `🎧 Listen to your "${topic}" story!`
      });

      await awardPoints(userId, 10);
      await sendUserMessage(bot, chatId, '🎉 Story created successfully! +10 points!');

      // Clean up the audio file
      await this.storyService.cleanupAudioFile(result.audioPath);

    } catch (error) {
      console.error('Error sending story:', error);
      await sendUserMessage(bot, chatId, `📚 <b>Your "${topic}" Story:</b>\n\n${result.story}\n\n⚠️ Audio couldn't be sent, but here's your story text!`, {
        parse_mode: 'HTML'
      });
      await this.storyService.cleanupAudioFile(result.audioPath);
    }
  }

  // Cleanup method for inactive sessions
  cleanupInactiveSessions() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [userId, session] of this.userSessions.entries()) {
      if (now - session.createdAt > maxAge) {
        this.userSessions.delete(userId);
      }
    }
  }
}

export default StoryHandlers;
