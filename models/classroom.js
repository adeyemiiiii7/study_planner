const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Classroom = sequelize.define('Classroom', {
  classroom_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  level: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 100,
      max: 800,
    },
  },
  department: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  course_of_study: {  // Changed from course_name to match your routes
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  join_code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  session: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  course_rep_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {  
      model: 'Users',
      key: 'user_id'
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  }
}, {
  indexes: [
    {
      unique: true,
      fields: ['course_rep_id', 'level', 'department', 'course_of_study'],
    },
  ],
});

module.exports = Classroom;