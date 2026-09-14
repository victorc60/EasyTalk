import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

// Kept independently of queue flags so reimports cannot make old content fresh.
export default sequelize.define('ContentIdentity', {
  fingerprint: { type: DataTypes.STRING(64), primaryKey: true },
  queue_id: { type: DataTypes.INTEGER, allowNull: true },
  used_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'content_identities', timestamps: false });
