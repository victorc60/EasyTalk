import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';
import User from './User.js';
import LearningItem from './LearningItem.js';

const MistakeMemory = sequelize.define('MistakeMemory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'users',
      key: 'telegram_id',
    },
  },
  target_language: {
    type: DataTypes.STRING(8),
    allowNull: false,
  },
  learning_item_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'learning_items',
      key: 'id',
    },
  },
  category: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  pattern_key: {
    type: DataTypes.STRING(191),
    allowNull: false,
  },
  source_text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  corrected_text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  explanation: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  first_seen_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  last_seen_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  next_review_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'mistake_memories',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      name: 'uq_mm_user_language_pattern',
      unique: true,
      fields: ['user_id', 'target_language', 'category', 'pattern_key'],
    },
    {
      name: 'idx_mm_user_language',
      fields: ['user_id', 'target_language'],
    },
    {
      name: 'idx_mm_review',
      fields: ['user_id', 'target_language', 'next_review_at'],
    },
  ],
});

MistakeMemory.belongsTo(User, {
  foreignKey: 'user_id',
  targetKey: 'telegram_id',
  as: 'User',
});

MistakeMemory.belongsTo(LearningItem, {
  foreignKey: 'learning_item_id',
  as: 'LearningItem',
});

export default MistakeMemory;
