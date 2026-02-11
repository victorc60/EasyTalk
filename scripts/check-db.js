/**
 * Диагностика подключения к БД.
 * Запуск: node scripts/check-db.js (из корня проекта, с загруженным .env или переменными Railway).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabaseUrl } from '../database/database.js';
import sequelize from '../database/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function mask(value) {
  if (!value || value.length < 4) return value ? '***' : '(не задано)';
  return value.slice(0, 2) + '***' + value.slice(-1);
}

console.log('=== Проверка переменных БД ===');
const vars = [
  'DATABASE_URL',
  'MYSQL_URL',
  'MYSQLHOST',
  'MYSQLPORT',
  'MYSQLUSER',
  'MYSQLPASSWORD',
  'MYSQLDATABASE',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
];
vars.forEach((name) => {
  const v = process.env[name];
  const status = v ? `задан (${mask(v)})` : 'не задан';
  console.log(`  ${name}: ${status}`);
});

const url = getDatabaseUrl();
if (!url) {
  console.error('\nОшибка: URL подключения не сформирован. Задайте DATABASE_URL, MYSQL_URL или MYSQLHOST+MYSQLUSER+MYSQLPASSWORD+MYSQLDATABASE (или DB_*).');
  process.exit(1);
}
// Показываем URL без пароля
const safeUrl = url.replace(/:[^:@]+@/, ':****@');
console.log('\nСобранный URL (без пароля):', safeUrl);

console.log('\n=== Проверка подключения ===');
try {
  await sequelize.authenticate();
  console.log('OK: подключение к БД успешно.');
  await sequelize.close();
  process.exit(0);
} catch (err) {
  console.error('Ошибка подключения:', err.message);
  process.exit(1);
}
