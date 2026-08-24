import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';
import DailySession from './DailySession.js';
import LearningItem from './LearningItem.js';

const SessionExercise = sequelize.define('SessionExercise', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  daily_session_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'daily_sessions',
      key: 'id',
    },
  },
  learning_item_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'learning_items',
      key: 'id',
    },
  },
  position: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  stage: {
    type: DataTypes.STRING(16),
    allowNull: false,
  },
  source_kind: {
    type: DataTypes.STRING(16),
    allowNull: false,
  },
  exercise_type: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  prompt: {
    type: DataTypes.JSON,
    allowNull: false,
  },
  expected_answer: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'session_exercises',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      name: 'uq_session_exercise_position',
      unique: true,
      fields: ['daily_session_id', 'position'],
    },
    {
      name: 'idx_session_exercise_session',
      fields: ['daily_session_id'],
    },
  ],
});

SessionExercise.belongsTo(DailySession, {
  foreignKey: 'daily_session_id',
  as: 'DailySession',
});

DailySession.hasMany(SessionExercise, {
  foreignKey: 'daily_session_id',
  as: 'exercises',
});

SessionExercise.belongsTo(LearningItem, {
  foreignKey: 'learning_item_id',
  as: 'LearningItem',
});

export default SessionExercise;
