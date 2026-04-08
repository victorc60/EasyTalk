import { Sequelize } from 'sequelize';

/**
 * Формирует URL подключения к MySQL.
 * Поддерживает: DATABASE_URL, MYSQL_URL (Railway), MYSQLHOST/... (Railway), DB_HOST/... (legacy).
 */
function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.MYSQL_URL) return process.env.MYSQL_URL;

  const host = process.env.MYSQLHOST || process.env.DB_HOST;
  const port = process.env.MYSQLPORT || process.env.DB_PORT || '3306';
  const user = process.env.MYSQLUSER || process.env.DB_USER;
  const password = process.env.MYSQLPASSWORD || '';
  const database = process.env.MYSQLDATABASE || process.env.DB_NAME;

  if (host && user && database) {
    const enc = encodeURIComponent;
    return `mysql://${enc(user)}:${enc(password)}@${host}:${port}/${enc(database)}`;
  }

  return process.env.DATABASE_URL || '';
}

const connectionUrl = getDatabaseUrl();
if (!connectionUrl) {
  throw new Error(
    'Не задана конфигурация БД: нужен DATABASE_URL, MYSQL_URL или MYSQLHOST+MYSQLUSER+MYSQLPASSWORD+MYSQLDATABASE (или DB_HOST+DB_NAME+DB_USER+MYSQLPASSWORD)'
  );
}

const sequelize = new Sequelize(connectionUrl, {
  dialect: 'mysql',
  timezone: '+03:00', // Europe/Chisinau (summer EEST = UTC+3)
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
    connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000,
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 15000,
    idle: 10000,
  },
  define: {
    freezeTableName: true,
  },
});

export default sequelize;
export { getDatabaseUrl };
