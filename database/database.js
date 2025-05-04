import { Sequelize } from 'sequelize';
import UserModel from '../models/User.js';

export const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'postgres',
    logging: false
  }
);
const User = UserModel(sequelize);

export async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    console.log('✅ База данных подключена и синхронизирована');
  } catch (error) {
    console.error('❌ Ошибка базы данных:', error);
    process.exit(1);
  }
}