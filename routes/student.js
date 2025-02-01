const express = require('express');
const Classroom = require('../models/classroom');
const ClassroomStudent = require('../models/classroomStudent');
const authorizeRole = require('../middleware/authorizeRole');
const studentRouter = express.Router();
const auth = require('../middleware/auth');
const CourseSection = require('../models/courseSection');
const CourseMaterial = require('../models/courseMaterial');
const PastQuestion = require('../models/pastQuestion');
const Announcement = require('../models/annocements');
const User = require('../models/user');
const { Op } = require('sequelize');

// Join a classroom
studentRouter.post('/api/student/classrooms/join', auth, authorizeRole(['student']), async (req, res) => {
    try {
      const { joinCode } = req.body;
      const studentLevel = req.user.level;
      
      const classroom = await Classroom.findOne({ 
        where: { join_code: joinCode } 
      });
  
      if (!classroom) {
        return res.status(404).json({ error: 'Invalid join code' });
      }
  
      if (studentLevel !== classroom.level) {
        return res.status(403).json({ error: 'You cannot join a classroom for a different level' });
      }
  
      const isStudentInClassroom = await ClassroomStudent.findOne({
        where: { 
          student_id: req.user.user_id, 
          classroom_id: classroom.classroom_id 
        },
      });
  
      if (isStudentInClassroom) {
        return res.status(400).json({ error: 'You are already in this classroom' });
      }
  
      await ClassroomStudent.create({
        student_id: req.user.user_id,
        classroom_id: classroom.classroom_id,
      });
  
      res.status(200).json({ message: 'Joined classroom successfully' });
    } catch (error) {
      console.error('Error joining classroom:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  module.exports = studentRouter;

