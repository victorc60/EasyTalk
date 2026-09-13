import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

const ContentDelivery = sequelize.define('ContentDelivery', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  daily_log_id: { type: DataTypes.INTEGER, allowNull: false },
  queue_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.BIGINT, allowNull: false },
  status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'pending' },
  retry_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  message_id: { type: DataTypes.BIGINT, allowNull: true },
}, {
  tableName: 'content_deliveries', timestamps: true,
  createdAt: 'created_at', updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['daily_log_id', 'user_id'] },
    { fields: ['daily_log_id', 'status'] },
  ],
});

export default ContentDelivery;
