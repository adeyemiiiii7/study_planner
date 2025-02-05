const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserStudyPreference = sequelize.define('UserStudyPreference', {
  preference_id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
    references: {
      model: 'Users',
      key: 'user_id'
    }
  },
  daily_preferences: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: [],
      Saturday: [],
      Sunday: []
    },
    validate: {
      isValidPreferences(value) {
        const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const validTimes = ['morning', 'afternoon', 'evening'];
        
        // Check if all days are valid
        const days = Object.keys(value);
        if (!days.every(day => validDays.includes(day))) {
          throw new Error('Invalid day in preferences');
        }

        // Check if all time slots are valid
        days.forEach(day => {
          if (!Array.isArray(value[day])) {
            throw new Error('Time slots must be an array');
          }
          if (!value[day].every(time => validTimes.includes(time))) {
            throw new Error('Invalid time slot');
          }
        });
      }
    }
  }
}, {
  tableName: 'UserStudyPreferences',
  timestamps: true,
});
module.exports = UserStudyPreference;