// models/ContentQueue.js
import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

const ContentQueue = sequelize.define('ContentQueue', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  type: {
    type: DataTypes.ENUM('word', 'quiz', 'idiom', 'phrasal', 'fact'),
    allowNull: false
  },
  content_id: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  content: {
    type: DataTypes.JSON,
    allowNull: false
  },
  used: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  used_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  tableName: 'content_queue',
  indexes: [
    {
      name: 'idx_type_used',
      fields: ['type', 'used', 'id']
    }
  ]
});

export default ContentQueue;
