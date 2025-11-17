import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';
import Poll from './Poll.js';

const PollDelivery = sequelize.define('PollDelivery', {
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
    allowNull: false,
    unique: true
  },
  chat_id: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  message_id: {
    type: DataTypes.BIGINT,
    allowNull: true
  }
}, {
  tableName: 'poll_delivery',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['poll_id'] },
    { fields: ['chat_id'] }
  ]
});

PollDelivery.belongsTo(Poll, { foreignKey: 'poll_id' });

export default PollDelivery;
