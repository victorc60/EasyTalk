import { Sequelize } from 'sequelize';
// 

export async function syncDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✅ Соединение с базой данных успешно установлено');
    await sequelize.sync({ force: false }); // force: false сохраняет существующие данные
    console.log('✅ Таблицы синхронизированы с базой данных');
  } catch (error) {
    console.error('❌ Ошибка подключения к базе данных:', error);
    throw error; // пробрасываем ошибку для обработки снаружи
  }
}