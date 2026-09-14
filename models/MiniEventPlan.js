import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

export default sequelize.define('MiniEventPlan', {
  event_date: { type: DataTypes.DATEONLY, primaryKey: true },
  questions: { type: DataTypes.JSON, allowNull: false },
  reserve: { type: DataTypes.JSON, allowNull: false },
  repeated: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'mini_event_plans', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
});
