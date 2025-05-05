import { Sequelize } from 'sequelize';
import config from '../config/constants.js';

// Инициализация Sequelize
const sequelize = new Sequelize(
  config.DB_NAME,
  config.DB_USER,
  config.DB_PASSWORD,
  {
    host: config.DB_HOST,
    port: config.DB_PORT,
    dialect: 'postgres',
    logging: config.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Тестовое подключение
sequelize.authenticate()
  .then(() => console.log('Database connection established'))
  .catch(err => console.error('Unable to connect to the database:', err));

export { sequelize };