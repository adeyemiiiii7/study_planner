const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Question = sequelize.define('Question', {
  question_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  material_id: {
    type: DataTypes.UUID,
    references: {
      model: 'CourseMaterials',
      key: 'material_id'
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
  classroom_id: {
    type: DataTypes.UUID,
    references: {
      model: 'Classrooms',
      key: 'classroom_id'
    },
    allowNull: false
  },
  material_number: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  question_text: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  options: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  correct_answer: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  question_type: {
    type: DataTypes.STRING,
    allowNull: false
  },
  difficulty_level: {
    type: DataTypes.ENUM('easy', 'medium', 'hard'),
    defaultValue: 'medium'
  },
  status: {
    type: DataTypes.ENUM('pending_review', 'approved', 'rejected'),
    defaultValue: 'pending_review'
  },
  feedback: {
    type: DataTypes.TEXT,
    allowNull: true
  }
});
 module.exports = Question;