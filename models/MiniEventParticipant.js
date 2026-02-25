import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';
import User from './User.js';

const MiniEventParticipant = sequelize.define('MiniEventParticipant', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  event_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'users',
      key: 'telegram_id'
    }
  },
  joined_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  current_question_index: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  answered_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  correct_answers: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  quiz_points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  reward_points: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  waiting_for_answer: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  next_question_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_question_sent_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_answer_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'active'
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  award_granted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'mini_event_participants',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['event_date', 'user_id'] },
    { fields: ['event_date', 'status'] },
    { fields: ['event_date', 'next_question_at'] },
    { fields: ['user_id', 'event_date'] }
  ]
});

MiniEventParticipant.belongsTo(User, {
  foreignKey: 'user_id',
  targetKey: 'telegram_id',
  as: 'User'
});

export default MiniEventParticipant;
