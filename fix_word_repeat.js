// fix_word_repeat.js - Script to manually add words to used words history
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const WORD_HISTORY_FILE = path.resolve(process.cwd(), 'data/word_history.json');

function hashString(str) {
  if (!str) return '';
  return crypto.createHash('md5').update(str).digest('hex').substring(0, 16);
}

function loadUsedWordsFromDisk() {
  const usedWordsCache = new Set();
  try {
    if (fs.existsSync(WORD_HISTORY_FILE)) {
      const raw = fs.readFileSync(WORD_HISTORY_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const word of parsed) {
          if (typeof word === 'string' && word.trim()) {
            usedWordsCache.add(word.trim().toLowerCase());
          }
        }
        console.log(`📚 Loaded ${usedWordsCache.size} words from history`);
      }
    } else {
      console.log('📚 No word history file found, creating new one');
    }
  } catch (error) {
    console.error('Error loading word history:', error.message);
  }
  return usedWordsCache;
}

function saveUsedWordsToDisk(usedWordsCache) {
  try {
    const dir = path.dirname(WORD_HISTORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const wordsArray = Array.from(usedWordsCache);
    fs.writeFileSync(WORD_HISTORY_FILE, JSON.stringify(wordsArray, null, 2), 'utf8');
    console.log(`💾 Saved ${wordsArray.length} words to history`);
  } catch (error) {
    console.error('Error saving word history:', error.message);
  }
}

// Words to add to prevent repetition
const wordsToAdd = [
  'whisper', 'ephemeral', 'quintessential', 'serendipity', 'ubiquitous',
  'eloquent', 'resilient', 'authentic', 'profound', 'mysterious',
  'brilliant', 'courageous', 'delicate', 'elegant', 'fascinating',
  'generous', 'harmonious', 'inspiring', 'joyful', 'knowledgeable',
  'luminous', 'magnificent', 'nurturing', 'optimistic', 'passionate',
  'radiant', 'serene', 'tranquil', 'uplifting', 'vibrant',
  'wonderful', 'exquisite', 'graceful', 'majestic', 'peaceful'
];

console.log('🔧 Adding words to prevent repetition...');

const usedWordsCache = loadUsedWordsFromDisk();

// Add all the words
wordsToAdd.forEach(word => {
  const wordLower = word.trim().toLowerCase();
  usedWordsCache.add(wordLower);
  console.log(`✅ Added: "${word}"`);
});

// Save the updated history
saveUsedWordsToDisk(usedWordsCache);

console.log('\n🎉 Done! These words will no longer be used in daily word games.');
console.log('🔄 Restart your bot to see the changes take effect.');
console.log(`📁 Word history saved to: ${WORD_HISTORY_FILE}`);
