import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

const WeeklyLeaderboardReward = sequelize.define('WeeklyLeaderboardReward', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  week_key: {
    type: DataTypes.STRING(32),
    allowNull: false,
    unique: true
  },
  week_start: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  week_end: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  awarded: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  awarded_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  rewards: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'weekly_leaderboard_reward',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      name: 'uq_wlr_week_key',
      unique: true,
      fields: ['week_key']
    }
  ]
});

export default WeeklyLeaderboardReward;
