const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserCourse = sequelize.define('UserCourse', {
    course_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'user_id'
      }
    },
    course_code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    course_units: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 4
      }
    }
  }, {
    tableName: 'UserCourses',
    timestamps: true,
  });
module.exports = UserCourse;