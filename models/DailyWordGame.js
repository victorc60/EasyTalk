import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

const DailyWordGame = sequelize.define('DailyWordGame', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  game_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  slot: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'default'
  },
  word: {
    type: DataTypes.STRING,
    allowNull: false
  },
  translation: {
    type: DataTypes.STRING,
    allowNull: false
  },
  options: {
    type: DataTypes.JSON,
    allowNull: false
  },
  correct_index: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  example: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  fact: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  mistakes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'daily_word_game',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['game_date', 'slot']
    }
  ]
});

export default DailyWordGame;
