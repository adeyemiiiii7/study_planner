const User = require('../models/user');
const Classroom = require('../models/classroom');
const ClassroomStudent = require('../models/classroomStudent');
const CourseSection = require('../models/courseSection');
const CourseMaterial = require('../models/courseMaterial');
const Question = require('../models/question');
const Announcement = require('../models/annocements');
const PastQuestion = require('../models/pastQuestion');

function setupAssociations() {
  // Many-to-Many: User <-> Classroom (via ClassroomStudent)
  User.belongsToMany(Classroom, {
    through: ClassroomStudent,
    foreignKey: 'student_id',
    otherKey: 'classroom_id',
    as: 'classrooms'
  });
  
  Classroom.belongsToMany(User, {
    through: ClassroomStudent,
    foreignKey: 'classroom_id',
    otherKey: 'student_id',
    as: 'enrolledStudents'
  });

  // ClassroomStudent associations
  ClassroomStudent.belongsTo(User, { foreignKey: 'student_id', as: 'student' });
  ClassroomStudent.belongsTo(Classroom, { foreignKey: 'classroom_id', as: 'classroom' });

  // Course Rep managing multiple Classrooms
  User.hasMany(Classroom, { foreignKey: 'course_rep_id', as: 'managedClassrooms' });
  Classroom.belongsTo(User, { foreignKey: 'course_rep_id', as: 'courseRep' });

  // Classroom and Course Sections with Cascade
  Classroom.hasMany(CourseSection, { as: 'courseSections', foreignKey: 'classroom_id', onDelete: 'CASCADE' });
  CourseSection.belongsTo(Classroom, { as: 'classroomDetail', foreignKey: 'classroom_id' });

  // Classroom and Course Materials with Cascade
  Classroom.hasMany(CourseMaterial, {
    as: 'classroomMaterials',
    foreignKey: 'classroom_id',
    onDelete: 'CASCADE'
  });
  
  CourseMaterial.belongsTo(Classroom, {
    as: 'classroomDetail',
    foreignKey: 'classroom_id'
  });

  // Classroom and Announcements with Cascade
  Classroom.hasMany(Announcement, {
    as: 'classroomAnnouncements',
    foreignKey: 'classroom_id',
    onDelete: 'CASCADE'
  });
  
  Announcement.belongsTo(Classroom, {
    as: 'classroomDetail',
    foreignKey: 'classroom_id'
  });

  // Classroom and Classroom Students with Cascade
  Classroom.hasMany(ClassroomStudent, {
    as: 'classroomStudents',
    foreignKey: 'classroom_id',
    onDelete: 'CASCADE'
  });

  // Course Section and Course Materials with Cascade
  CourseSection.hasMany(CourseMaterial, {
    as: 'courseSectionMaterials',
    foreignKey: 'course_section_id',
    onDelete: 'CASCADE'
  });
  
  CourseMaterial.belongsTo(CourseSection, {
    as: 'courseSectionDetail',
    foreignKey: 'course_section_id'
  });

  // Course Section and Questions with Cascade
  CourseSection.hasMany(Question, {
    as: 'courseSectionQuestions',
    foreignKey: 'course_section_id',
    onDelete: 'CASCADE'
  });

  Question.belongsTo(CourseSection, {
    as: 'courseSectionDetail',
    foreignKey: 'course_section_id'
  });

  // Course Section and Past Questions with Cascade
  CourseSection.hasMany(PastQuestion, {
    as: 'courseSectionPastQuestions',
    foreignKey: 'course_section_id',
    onDelete: 'CASCADE'
  });
  
  PastQuestion.belongsTo(CourseSection, {
    as: 'courseSectionDetail',
    foreignKey: 'course_section_id'
  });
}

module.exports = setupAssociations;
