const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SlideQuestionAttempt = sequelize.define('SlideQuestionAttempt', {
  attempt_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    references: {
      model: 'Users',
      key: 'user_id'
    },
    allowNull: false
  },
  material_id: {
    type: DataTypes.UUID,
    references: {
      model: 'CourseMaterials',
      key: 'material_id'
    },
    allowNull: false
  },
  classroom_id: {
    type: DataTypes.UUID,
    references: {
      model: 'Classrooms',
      key: 'classroom_id'
    },
    allowNull: false
  },
  course_section_id: {
    type: DataTypes.UUID,
    references: {
      model: 'CourseSections',
      key: 'course_section_id'
    },
    allowNull: false
  },
  questions_attempted: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  score: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  completed_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

module.exports = SlideQuestionAttempt;