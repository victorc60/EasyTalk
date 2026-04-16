// models/DailyBonus.js
import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

const DailyBonus = sequelize.define('DailyBonus', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  bonus_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  points: {
    type: DataTypes.INTEGER,
    defaultValue: 20
  }
}, {
  tableName: 'daily_bonuses',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['user_id', 'bonus_date'] }
  ]
});

export default DailyBonus;
