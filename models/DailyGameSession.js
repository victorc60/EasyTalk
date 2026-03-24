import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

const DailyGameSession = sequelize.define('DailyGameSession', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  game_type: {
    type: DataTypes.STRING(20),
    allowNull: false
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
  session_id: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  prompt: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  translation: {
    type: DataTypes.TEXT,
    allowNull: true
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
  meta: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'daily_game_session',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['game_type', 'game_date', 'slot']
    },
    {
      fields: ['game_type', 'session_id']
    }
  ]
});

export default DailyGameSession;
