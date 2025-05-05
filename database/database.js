import { Sequelize } from 'sequelize';
import mysql2 from 'mysql2'; // Импортируем mysql2 через ES Modules

// Инициализация подключения
const sequelizeInstance = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    dialectModule: mysql2, // Передаем импортированный модуль
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Функция для проверки подключения
export async function initializeDatabase() {
  try {
    await sequelizeInstance.authenticate();
    console.log('✅ Соединение с БД установлено');
    await sequelizeInstance.sync({ alter: true });
    console.log('✅ Модели синхронизированы');
    return sequelizeInstance;
  } catch (error) {
    console.error('❌ Ошибка БД:', error);
    throw error;
  }
}

export default sequelizeInstance;