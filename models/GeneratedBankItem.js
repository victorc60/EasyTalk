import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

export default sequelize.define('GeneratedBankItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  bank: { type: DataTypes.STRING(32), allowNull: false },
  fingerprint: { type: DataTypes.STRING(64), allowNull: false },
  content: { type: DataTypes.JSON, allowNull: false },
}, {
  tableName: 'generated_bank_items', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
  indexes: [{ unique: true, fields: ['bank', 'fingerprint'] }],
});
