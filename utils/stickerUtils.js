import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STICKERS_FILE = path.join(__dirname, '../data/stickers.json');

function loadStickers() {
  try {
    const raw = fs.readFileSync(STICKERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { correct: [], chat: [] };
  }
}

export function saveSticker(category, fileId) {
  const data = loadStickers();
  if (!data[category]) data[category] = [];
  if (!data[category].includes(fileId)) {
    data[category].push(fileId);
    fs.writeFileSync(STICKERS_FILE, JSON.stringify(data, null, 2), 'utf8');
  }
}

export function removeSticker(category, fileId) {
  const data = loadStickers();
  if (!data[category]) return;
  data[category] = data[category].filter(id => id !== fileId);
  fs.writeFileSync(STICKERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Отправляет случайный стикер из категории.
 * @param {Object} bot
 * @param {number} chatId
 * @param {'correct'|'chat'} category
 * @param {number} [probability=1] - вероятность отправки (0..1)
 */
export async function sendRandomSticker(bot, chatId, category, probability = 1) {
  try {
    if (Math.random() > probability) return;
    const data = loadStickers();
    const list = data[category];
    if (!list || list.length === 0) return;
    const fileId = list[Math.floor(Math.random() * list.length)];
    await bot.sendSticker(chatId, fileId);
  } catch (error) {
    console.error(`Ошибка отправки стикера (${category}):`, error.message);
  }
}

export function getStickerStats() {
  const data = loadStickers();
  return {
    correct: (data.correct || []).length,
    chat: (data.chat || []).length
  };
}
