import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';
import SessionExercise from './SessionExercise.js';
import User from './User.js';

const ExerciseAttempt = sequelize.define('ExerciseAttempt', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  session_exercise_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'session_exercises',
      key: 'id',
    },
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: 'users',
      key: 'telegram_id',
    },
  },
  answer_text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_correct: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
  },
  score: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  feedback: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  recognition_delta: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  production_delta: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: 'exercise_attempts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      name: 'idx_exercise_attempt_session_exercise',
      fields: ['session_exercise_id'],
    },
    {
      name: 'idx_exercise_attempt_user',
      fields: ['user_id'],
    },
  ],
});

ExerciseAttempt.belongsTo(SessionExercise, {
  foreignKey: 'session_exercise_id',
  as: 'SessionExercise',
});

ExerciseAttempt.belongsTo(User, {
  foreignKey: 'user_id',
  targetKey: 'telegram_id',
  as: 'User',
});

SessionExercise.hasMany(ExerciseAttempt, {
  foreignKey: 'session_exercise_id',
  as: 'attempts',
});

export default ExerciseAttempt;
