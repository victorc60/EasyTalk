// models/Streak.js
import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

const Streak = sequelize.define('Streak', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  game_type: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  last_date: {
    type: DataTypes.STRING(10),
    allowNull: true,
    defaultValue: null
  }
}, {
  timestamps: false,
  tableName: 'streaks',
  indexes: [
    { unique: true, fields: ['user_id', 'game_type'] }
  ]
});

export default Streak;
