// models/DailyLog.js
import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

const DailyLog = sequelize.define('DailyLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  type: {
    type: DataTypes.ENUM('word', 'quiz', 'idiom', 'phrasal', 'fact'),
    allowNull: false
  },
  content_id: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  }
}, {
  timestamps: false,
  tableName: 'daily_log',
  indexes: [
    {
      name: 'unique_type_date',
      fields: ['type', 'date'],
      unique: true
    }
  ]
});

export default DailyLog;
