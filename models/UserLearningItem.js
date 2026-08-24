import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';
import User from './User.js';
import LearningItem from './LearningItem.js';

const UserLearningItem = sequelize.define('UserLearningItem', {
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
    allowNull: false,
    references: {
      model: 'learning_items',
      key: 'id',
    },
  },
  state: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'new',
  },
  attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  correct_attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  incorrect_attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  recognition_score: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  production_score: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  mastery_score: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  first_seen_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_seen_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_correct_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  last_incorrect_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  next_review_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  ease_factor: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 2.3,
  },
  last_exercise_type: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
}, {
  tableName: 'user_learning_items',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      name: 'uq_uli_user_language_item',
      unique: true,
      fields: ['user_id', 'target_language', 'learning_item_id'],
    },
    {
      name: 'idx_uli_language_state',
      fields: ['target_language', 'state'],
    },
    {
      name: 'idx_uli_review',
      fields: ['user_id', 'target_language', 'next_review_at'],
    },
  ],
});

UserLearningItem.belongsTo(User, {
  foreignKey: 'user_id',
  targetKey: 'telegram_id',
  as: 'User',
});

UserLearningItem.belongsTo(LearningItem, {
  foreignKey: 'learning_item_id',
  as: 'LearningItem',
});

LearningItem.hasMany(UserLearningItem, {
  foreignKey: 'learning_item_id',
  as: 'userStates',
});

export default UserLearningItem;
