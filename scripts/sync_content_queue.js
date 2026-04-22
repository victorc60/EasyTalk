import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

const BANKS = [
  { type: 'word', file: 'word_bank.json', key: (item) => item?.word },
  { type: 'quiz', file: 'quiz_bank.json', key: (item) => item?.id || item?.question },
  { type: 'idiom', file: 'idiom_bank.json', key: (item) => item?.idiom },
  { type: 'phrasal', file: 'phrasal_verbs_bank.json', key: (item) => item?.phrasalVerb || item?.verb },
  { type: 'fact', file: 'facts_bank.json', key: (item) => item?.id || item?.claim },
];

function parseArgs(argv) {
  const dryRun = argv.includes('--dry-run');
  const requestedTypes = argv.filter(arg => !arg.startsWith('--'));
  return { dryRun, requestedTypes };
}

function readJsonArray(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${path.basename(filePath)} должен быть JSON-массивом`);
  }
  return parsed;
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function getContentKey(type, content = {}) {
  switch (type) {
    case 'word': return content.word;
    case 'quiz': return content.id || content.question;
    case 'idiom': return content.idiom;
    case 'phrasal': return content.phrasalVerb || content.verb;
    case 'fact': return content.id || content.claim;
    default: return null;
  }
}

function makeStableContentId(type, item, sourceKey) {
  if (item?.id) return String(item.id).slice(0, 50);

  const source = String(sourceKey || type);
  const hash = crypto.createHash('sha1').update(source).digest('hex').slice(0, 8);
  const prefix = `${type}_`;
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'item';
  const maxSlugLength = Math.max(1, 50 - prefix.length - hash.length - 1);

  return `${prefix}${slug.slice(0, maxSlugLength)}_${hash}`;
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function syncBank({ bank, ContentQueue, buildQueueRecord, dataDir, dryRun }) {
  const filePath = path.join(dataDir, bank.file);
  const bankData = readJsonArray(filePath);
  const existingRows = await ContentQueue.findAll({
    where: { type: bank.type },
    order: [['id', 'ASC']]
  });

  const existingByKey = new Map();
  let duplicateRows = 0;

  for (const row of existingRows) {
    const key = normalizeKey(getContentKey(bank.type, row.content));
    if (!key) continue;
    if (existingByKey.has(key)) {
      duplicateRows++;
      continue;
    }
    existingByKey.set(key, row);
  }

  const sourceKeys = new Set();
  const stats = {
    type: bank.type,
    source: bankData.length,
    existing: existingRows.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    stale: 0,
    duplicateRows,
  };

  for (let index = 0; index < bankData.length; index++) {
    const item = bankData[index];
    const sourceKey = bank.key(item);
    const normalized = normalizeKey(sourceKey);

    if (!normalized) {
      stats.skipped++;
      continue;
    }

    sourceKeys.add(normalized);
    const nextRecord = buildQueueRecord(bank.type, item, index, bankData);
    const existing = existingByKey.get(normalized);

    if (existing) {
      if (sameJson(existing.content, nextRecord.content)) {
        stats.unchanged++;
        continue;
      }

      stats.updated++;
      if (!dryRun) {
        await existing.update({ content: nextRecord.content });
      }
      continue;
    }

    stats.created++;
    if (!dryRun) {
      await ContentQueue.create({
        type: bank.type,
        content_id: makeStableContentId(bank.type, item, sourceKey),
        content: nextRecord.content,
        used: false,
        used_at: null
      });
    }
  }

  for (const row of existingRows) {
    const key = normalizeKey(getContentKey(bank.type, row.content));
    if (key && !sourceKeys.has(key)) stats.stale++;
  }

  return stats;
}

async function main() {
  const { dryRun, requestedTypes } = parseArgs(process.argv.slice(2));
  const selectedBanks = requestedTypes.length
    ? BANKS.filter(bank => requestedTypes.includes(bank.type))
    : BANKS;
  const unknownTypes = requestedTypes.filter(type => !BANKS.some(bank => bank.type === type));

  if (unknownTypes.length) {
    throw new Error(`Неизвестный тип: ${unknownTypes.join(', ')}. Доступно: ${BANKS.map(bank => bank.type).join(', ')}`);
  }

  const [{ DATA_DIR }, { default: sequelize }, { default: ContentQueue }, { buildQueueRecord }] = await Promise.all([
    import('../utils/projectPaths.js'),
    import('../database/database.js'),
    import('../models/ContentQueue.js'),
    import('../services/queueService.js'),
  ]);

  await sequelize.authenticate();

  try {
    console.log(`[QUEUE:SYNC] ${dryRun ? 'Dry run: ' : ''}синхронизация ${selectedBanks.map(bank => bank.type).join(', ')}`);

    for (const bank of selectedBanks) {
      const stats = await syncBank({ bank, ContentQueue, buildQueueRecord, dataDir: DATA_DIR, dryRun });
      const staleNote = stats.stale > 0 ? `, stale=${stats.stale} (не удалены)` : '';
      const duplicateNote = stats.duplicateRows > 0 ? `, duplicates=${stats.duplicateRows}` : '';
      console.log(
        `[QUEUE:SYNC] ${stats.type}: source=${stats.source}, existing=${stats.existing}, ` +
        `created=${stats.created}, updated=${stats.updated}, unchanged=${stats.unchanged}, skipped=${stats.skipped}` +
        `${staleNote}${duplicateNote}`
      );
    }

    console.log('[QUEUE:SYNC] Готово');
  } finally {
    await sequelize.close();
  }
}

function formatError(error) {
  const parts = [
    error?.message,
    error?.name,
    error?.original?.code,
    error?.original?.message,
    error?.parent?.code,
    error?.parent?.message,
  ].filter(Boolean);

  return parts.join(' | ') || String(error);
}

main().catch((error) => {
  console.error('[QUEUE:SYNC] Ошибка:', formatError(error));
  process.exit(1);
});
