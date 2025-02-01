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
studentRouter.post('/api/student/classrooms/join', 
    auth, 
    authorizeRole(['student']), 
    async (req, res) => {
      try {
        const { joinCode } = req.body;
        const student = req.user;
        
        const classroom = await Classroom.findOne({ 
          where: { join_code: joinCode } 
        });
    
        if (!classroom) {
          return res.status(404).json({ error: 'Invalid join code' });
        }
  
        // Check if level matches
        if (student.level !== classroom.level) {
          return res.status(403).json({ 
            error: 'You cannot join a classroom for a different level' 
          });
        }
  
        // // Check if department matches
        // if (student.department !== classroom.department) {
        //   return res.status(403).json({ 
        //     error: 'You cannot join a classroom from a different department' 
        //   });
        // }
  
        // Check if course of study matches
        if (student.course_of_study !== classroom.course_of_study) {
          return res.status(403).json({ 
            error: 'You cannot join a classroom from a different course of study' 
          });
        }
    
        const isStudentInClassroom = await ClassroomStudent.findOne({
          where: { 
            student_id: student.user_id, 
            classroom_id: classroom.classroom_id 
          },
        });
    
        if (isStudentInClassroom) {
          return res.status(400).json({ 
            error: 'You are already in this classroom' 
          });
        }
    
        await ClassroomStudent.create({
          student_id: student.user_id,
          classroom_id: classroom.classroom_id,
        });
    
        res.status(200).json({ 
          message: 'Joined classroom successfully',
          classroom: {
            id: classroom.classroom_id,
            name: classroom.name,
            level: classroom.level,
            // department: classroom.department,
            course_of_study: classroom.course_of_study,
            session: classroom.session
          }
        });
      } catch (error) {
        console.error('Error joining classroom:', error);
        res.status(500).json({ 
          error: 'An error occurred while joining the classroom',
          details: error.message 
        });
      }
  });
  
  module.exports = studentRouter;


