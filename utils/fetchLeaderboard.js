const { Op } = require('sequelize');
const User = require('../models/user');
const ClassroomStudent = require('../models/classroomStudent');
const Classroom = require('../models/classroom');

const fetchLeaderboard = async (classroomId) => {
  try {
    // Get the classroom with its course rep
    const classroom = await Classroom.findByPk(classroomId, {
      include: [{
        model: User,
        as: 'courseRep',
        attributes: [
          'user_id',
          'first_name',
          'last_name',
          'role',
          'current_streak',
          'highest_streak',
          'total_active_days'
        ],
        required: true 
      }]
    });

    // Get students from ClassroomStudent
    const students = await ClassroomStudent.findAll({
      where: { classroom_id: classroomId },
      include: [{
        model: User,
        as: 'student',
        attributes: [
          'user_id',
          'first_name',
          'last_name',
          'role',
          'current_streak',
          'highest_streak',
          'total_active_days'
        ]
      }],
    });

    // Combine course rep and students data
    const leaderboardData = [
      // Add course rep (always exists)
      {
        user_id: classroom.courseRep.user_id,
        name: `${classroom.courseRep.first_name} ${classroom.courseRep.last_name}`,
        role: classroom.courseRep.role,
        current_streak: classroom.courseRep.current_streak,
        highest_streak: classroom.courseRep.highest_streak,
        total_active_days: classroom.courseRep.total_active_days
      },
      // Add students
      ...students.map(student => ({
        user_id: student.student.user_id,
        name: `${student.student.first_name} ${student.student.last_name}`,
        role: student.student.role,
        current_streak: student.student.current_streak,
        highest_streak: student.student.highest_streak,
        total_active_days: student.student.total_active_days
      }))
    ].sort((a, b) => {
      // Primary sort by highest streak
      if (b.highest_streak !== a.highest_streak) return b.highest_streak - a.highest_streak;
      // Secondary sort by current streak
      if (b.current_streak !== a.current_streak) return b.current_streak - a.current_streak;
      // Tertiary sort by total active days
      return b.total_active_days - a.total_active_days;
    });

    return leaderboardData;
  } catch (error) {
    console.error('Error in fetchLeaderboard:', error.message);
    throw error;
  }
};

module.exports = { fetchLeaderboard };