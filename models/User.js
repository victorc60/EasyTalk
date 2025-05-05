import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js'; 
// Определение модели
const User = sequelize.define('User', {
  telegram_id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    allowNull: false,
    unique: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      len: [3, 32]
    }
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  points: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  first_activity: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  last_activity: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: false,
  tableName: 'users',
  indexes: [
    {
      fields: ['username']
    },
    {
      fields: ['is_active']
    }
  ]
});

// Экспорт модели
export default User;