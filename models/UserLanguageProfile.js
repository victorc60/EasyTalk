import { DataTypes } from 'sequelize';
import sequelize from '../database/database.js';
import User from './User.js';

const UserLanguageProfile = sequelize.define('UserLanguageProfile', {
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
  current_level: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'unknown',
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  last_activity: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  current_streak: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  onboarding_completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'user_language_profiles',
  timestamps: false,
  indexes: [
    {
      name: 'uq_ulp_user_language',
      unique: true,
      fields: ['user_id', 'target_language'],
    },
    {
      name: 'idx_ulp_language',
      fields: ['target_language'],
    },
  ],
});

UserLanguageProfile.belongsTo(User, {
  foreignKey: 'user_id',
  targetKey: 'telegram_id',
  as: 'User',
});

User.hasMany(UserLanguageProfile, {
  foreignKey: 'user_id',
  sourceKey: 'telegram_id',
  as: 'languageProfiles',
});

export default UserLanguageProfile;
