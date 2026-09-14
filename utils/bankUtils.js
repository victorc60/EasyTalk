// utils/bankUtils.js
// Pure bank utility — no side effects, no external APIs.
// Used by contentGenerators.js and unit tests.

import fs from 'fs';
import path from 'path';
import { bankEntryKey } from './bankMerge.js';

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
// Exhaustion returns null; published content must never be recycled.
export function pickFromBank(filePath) {
  let rows = readBankFile(filePath);
  if (!rows.length) return null;

  const used = new Set(rows.filter(row => row.isUsed).map(bankEntryKey));
  const available = rows.filter(row => !used.has(bankEntryKey(row)));
  if (!available.length) return null;

  const chosen = available[Math.floor(Math.random() * available.length)];

  const key = bankEntryKey(chosen);
  rows = rows.map(row => bankEntryKey(row) === key ? { ...row, isUsed: true } : row);
  writeJsonArray(filePath, rows);

  return chosen;
}
