import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

export default sequelize.define('BankMaintenanceRun', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  bank: { type: DataTypes.STRING(32), allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'processing' },
  result: { type: DataTypes.JSON, allowNull: true },
}, {
  tableName: 'bank_maintenance_runs', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
  indexes: [{ unique: true, fields: ['bank', 'date'] }],
});
