import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';
import User from './User.js';

const DailySession = sequelize.define('DailySession', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'users',
      key: 'telegram_id',
    },
  },
  target_language: {
    type: DataTypes.STRING(8),
    allowNull: false,
  },
  current_level: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'unknown',
  },
  status: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'active',
  },
  current_position: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  total_exercises: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  summary: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'daily_sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      name: 'idx_daily_session_user_status',
      fields: ['user_id', 'status'],
    },
    {
      name: 'idx_daily_session_language',
      fields: ['target_language', 'status'],
    },
  ],
});

DailySession.belongsTo(User, {
  foreignKey: 'user_id',
  targetKey: 'telegram_id',
  as: 'User',
});

export default DailySession;
