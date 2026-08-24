import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';

const LearningItem = sequelize.define('LearningItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  language_code: {
    type: DataTypes.STRING(8),
    allowNull: false,
  },
  source_type: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  source_key: {
    type: DataTypes.STRING(191),
    allowNull: false,
  },
  level: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'A1',
  },
  type: {
    type: DataTypes.STRING(32),
    allowNull: false,
  },
  base_form: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  text: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  translation: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  example: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  example_translation: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  topic: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  difficulty: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  grammar_metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  tableName: 'learning_items',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      name: 'uq_learning_item_source',
      unique: true,
      fields: ['language_code', 'source_type', 'source_key'],
    },
    {
      name: 'idx_learning_item_language_level',
      fields: ['language_code', 'level'],
    },
    {
      name: 'idx_learning_item_language_type',
      fields: ['language_code', 'type'],
    },
  ],
});

export default LearningItem;
