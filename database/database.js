import { Sequelize } from 'sequelize';

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'mysql',
  logging: console.log, // Логируем SQL-запросы для отладки
  dialectOptions: {
    ssl: { // Обязательно для Railway
      require: true,
      rejectUnauthorized: false
    }
  },
  define: {
    freezeTableName: true // Отключаем автоматическое добавление множественного числа
  }
});

export default sequelize;