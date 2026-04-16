// utils/bankUtils.js
// Pure bank utility — no side effects, no external APIs.
// Used by contentGenerators.js and unit tests.

import fs from 'fs';
import path from 'path';

export function readBankFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`Не удалось прочитать банк ${path.basename(filePath)}:`, err.message);
    return [];
  }
}

export function writeJsonArray(filePath, rows) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf8');
}

// Pick a random unused item from the bank file and immediately mark it as used.
// If all items are used — resets all to isUsed: false and starts over.
export function pickFromBank(filePath) {
  let rows = readBankFile(filePath);
  if (!rows.length) return null;

  let available = rows.filter(r => !r.isUsed);
  if (!available.length) {
    rows = rows.map(r => ({ ...r, isUsed: false }));
    available = rows;
    console.log(`🔄 Банк ${path.basename(filePath)} сброшен — все элементы снова доступны`);
  }

  const chosen = available[Math.floor(Math.random() * available.length)];

  const idx = rows.indexOf(chosen);
  if (idx !== -1) {
    rows[idx] = { ...rows[idx], isUsed: true };
  }
  writeJsonArray(filePath, rows);

  return chosen;
}
