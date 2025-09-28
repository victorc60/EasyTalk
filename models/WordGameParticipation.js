import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';
import User from './User.js';

// Определение модели для отслеживания участия в ежедневной игре со словами
const WordGameParticipation = sequelize.define('WordGameParticipation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'users',
      key: 'telegram_id'
    }
  },
  game_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  word: {
    type: DataTypes.STRING,
    allowNull: false
  },
  answered: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  correct: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  points_earned: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  response_time: {
    type: DataTypes.INTEGER, // время ответа в миллисекундах
    allowNull: true
  }
}, {
  timestamps: false,
  tableName: 'word_game_participation',
  indexes: [
    {
      fields: ['user_id', 'game_date'],
      unique: true
    },
    {
      fields: ['game_date']
    },
    {
      fields: ['answered']
    }
  ]
});

// Define associations
WordGameParticipation.belongsTo(User, {
  foreignKey: 'user_id',
  targetKey: 'telegram_id',
  as: 'User'
});

export default WordGameParticipation;
