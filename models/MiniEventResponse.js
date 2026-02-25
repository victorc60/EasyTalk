import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

const MiniEventResponse = sequelize.define('MiniEventResponse', {
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
    allowNull: false
  },
  question_index: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  question_id: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  selected_option_index: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  is_correct: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  response_time_ms: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  answered_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'mini_event_responses',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['event_date', 'user_id', 'question_index'] },
    { fields: ['event_date', 'user_id'] },
    { fields: ['event_date', 'question_id'] }
  ]
});

export default MiniEventResponse;
