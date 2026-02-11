// services/storyService.js
import { OpenAI } from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class StoryService {
  constructor(openai) {
    this.openai = openai;
    this.tempDir = path.join(__dirname, '..', 'temp');
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Error creating temp directory:', error);
    }
  }

  async generateStory(topic = null, length = 'short') {
    try {
      const lengthInstructions = {
        'short': 'Keep the story under 200 words, perfect for a quick audio story.',
        'medium': 'Keep the story under 400 words, good for a longer audio experience.',
        'long': 'Keep the story under 600 words, for an extended audio story.'
      };

      const storyPrompt = `Create a humorous and entertaining short story in English. 
${topic ? `Topic/theme: ${topic}` : 'Choose any amusing topic or situation.'}
${lengthInstructions[length] || lengthInstructions.short}

Requirements:
- Make it funny and engaging
- Use simple, clear English (suitable for English learners)
- Include dialogue when appropriate
- Have a clear beginning, middle, and end
- Make it memorable and entertaining
- Avoid offensive content
- Focus on everyday situations with a humorous twist

Format the story with clear paragraphs and engaging storytelling.`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are a creative storyteller who specializes in writing humorous, engaging short stories. Your stories are perfect for audio narration and appeal to English learners and native speakers alike."
          },
          {
            role: "user",
            content: storyPrompt
          }
        ],
        temperature: 0.8,
        max_tokens: 800
      });

      const storyText = response.choices[0]?.message?.content;
      return {
        success: true,
        story: storyText,
        topic: topic || 'Random humorous story'
      };
    } catch (error) {
      console.error('Error generating story:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generateStoryWithAudio(topic = null, length = 'short') {
    try {
      // Step 1: Generate the story
      const storyResult = await this.generateStory(topic, length);
      if (!storyResult.success) {
        return storyResult;
      }

      // Step 2: Convert to audio
      const audioResult = await this.textToSpeech(storyResult.story);
      if (!audioResult.success) {
        return {
          success: false,
          error: `Story generated but audio conversion failed: ${audioResult.error}`,
          story: storyResult.story // Return the story text even if audio fails
        };
      }

      return {
        success: true,
        story: storyResult.story,
        audioPath: audioResult.audioPath,
        topic: storyResult.topic
      };
    } catch (error) {
      console.error('Error in generateStoryWithAudio:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async textToSpeech(text) {
    try {
      const timestamp = Date.now();
      const audioPath = path.join(this.tempDir, `story_${timestamp}.mp3`);

      const mp3 = await this.openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy", // Options: alloy, echo, fable, onyx, nova, shimmer
        input: text,
        response_format: "mp3"
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      await fs.writeFile(audioPath, buffer);

      return {
        success: true,
        audioPath: audioPath
      };
    } catch (error) {
      console.error('Error in textToSpeech:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async cleanupAudioFile(audioPath) {
    try {
      if (audioPath && await fs.access(audioPath).then(() => true).catch(() => false)) {
        await fs.unlink(audioPath);
        console.log('Audio file cleaned up:', audioPath);
      }
    } catch (error) {
      console.error('Error cleaning up audio file:', error);
    }
  }

  async cleanupOldFiles() {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      const maxAge = 30 * 60 * 1000; // 30 minutes

      for (const file of files) {
        if (file.startsWith('story_') && file.endsWith('.mp3')) {
          const filePath = path.join(this.tempDir, file);
          const stats = await fs.stat(filePath);
          if (now - stats.mtime.getTime() > maxAge) {
            await fs.unlink(filePath);
            console.log('Cleaned up old audio file:', file);
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up old files:', error);
    }
  }

  // Get available story topics for user selection
  getStoryTopics() {
    return [
      'Adventure',
      'Comedy',
      'Animals',
      'Technology',
      'Travel',
      'Food',
      'Sports',
      'Music',
      'Art',
      'Nature',
      'Friendship',
      'Surprise me!'
    ];
  }

  // Get story length options
  getStoryLengths() {
    return [
      { id: 'short', label: 'Short (1-2 minutes)', description: 'Perfect for a quick laugh' },
      { id: 'medium', label: 'Medium (2-3 minutes)', description: 'Good for a longer story' },
      { id: 'long', label: 'Long (3-5 minutes)', description: 'Extended storytelling experience' }
    ];
  }
}

export default StoryService;
