const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CourseMaterial = sequelize.define('Slide', {
   material_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  material_number: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  file_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  file_url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  course_section_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'CourseSections',
      key: 'course_section_id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  classroom_id: {
    type: DataTypes.UUID,
    references: {
      model: 'Classrooms', 
      key: 'classroom_id',
    },
    allowNull: false,
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  material_name: {
    type: DataTypes.TEXT,
    allowNull: true,
  }
}, {
  tableName: 'CourseMaterials',
  timestamps: true,
});

module.exports = CourseMaterial;