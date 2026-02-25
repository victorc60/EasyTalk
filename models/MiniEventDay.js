import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

const MiniEventDay = sequelize.define('MiniEventDay', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  event_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    unique: true
  },
  total_questions: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10
  },
  question_ids: {
    type: DataTypes.JSON,
    allowNull: false
  },
  invite_sent_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  is_closed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  finalized_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'mini_event_days',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['event_date'] },
    { fields: ['is_closed'] }
  ]
});

export default MiniEventDay;
