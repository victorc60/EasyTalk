import { DataTypes } from 'sequelize';
import { sequelize } from '../database/database.js';

const User = sequelize.define('User', {
  telegram_id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    allowNull: false
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true
  },
  first_activity: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  last_activity: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: false,
  tableName: 'users'
});

export default User;