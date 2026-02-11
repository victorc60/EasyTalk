import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';
import Poll from './Poll.js';

const PollResponse = sequelize.define('PollResponse', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  poll_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Poll,
      key: 'id'
    }
  },
  telegram_poll_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  option_ids: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  }
}, {
  tableName: 'poll_responses',
  timestamps: true,
  createdAt: 'answered_at',
  updatedAt: false,
  indexes: [
    { fields: ['poll_id'] },
    { fields: ['telegram_poll_id'] },
    {
      fields: ['poll_id', 'user_id'],
      unique: true
    }
  ]
});

PollResponse.belongsTo(Poll, { foreignKey: 'poll_id' });

export default PollResponse;
