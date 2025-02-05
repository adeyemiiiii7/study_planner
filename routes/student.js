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
const StudentService = require('../utils/StudentService');
const UserStudyPreference = require('../models/userStudyPreference');
const UserCourse = require('../models/userCourse');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const { Op } = require('sequelize');
const SlideQuestionAttempt = require('../models/slideQuestionAttempt');
const Question = require('../models/question');

studentRouter.get('/api/student/classrooms/:classroomId/sections/:sectionId/slides/:slideId/test',
    auth, 
    authorizeRole(['student', 'course_rep']), 
    async (req, res) => {
      try {
        const { classroomId, sectionId, materialId } = req.params;
        
        // Get all questions for the slide - including pending_review for testing
        const allQuestions = await Question.findAll({
          where: {
            material_id: materialId,
            course_section_id: sectionId,
            classroom_id: classroomId,
            status: {
              [Op.in]: ['approved', 'pending_review'] 
            }
          }
        });
  
        console.log('Questions found:', {
          total: allQuestions.length,
          byStatus: allQuestions.reduce((acc, q) => {
            acc[q.status] = (acc[q.status] || 0) + 1;
            return acc;
          }, {})
        });
  
        if (allQuestions.length === 0) {
          return res.status(200).json({
            message: 'No questions available for this slide',
            debug: {
              queryParams: {
                material_id: materialId,
                course_section_id: sectionId,
                classroom_id: classroomId
              }
            }
          });
        }
       // Backend: Shuffling logic (already correct)
  const shuffledQuestions = allQuestions.map(q => {
    const shuffledOptions = q.options
      .map((value, originalIndex) => ({ 
        value, 
        originalIndex,
        sort: Math.random() 
      }))
      .sort((a, b) => a.sort - b.sort);
  
    const optionMapping = shuffledOptions.map(opt => opt.originalIndex);
  
    return {
      question_id: q.question_id,
      question_text: q.question_text,
      options: shuffledOptions.map(opt => opt.value),
      correct_answer: q.correct_answer,
      option_mapping: optionMapping 
    };
  })
        .sort(() => 0.5 - Math.random())
        .slice(0, 25);
  
        res.status(200).json({
          message: 'Test questions retrieved successfully',
          questions: shuffledQuestions,
          debug: {
            totalQuestions: allQuestions.length,
            returnedQuestions: shuffledQuestions.length
          }
        });
      } catch (error) {
        console.error('Error fetching test questions:', error);
        res.status(500).json({ 
          error: 'Internal server error',
          debug: {
            message: error.message
          }
        });
      }
  });
  studentRouter.post('/api/student/classrooms/:classroomId/sections/:sectionId/slides/:slideId/submit-test',
    auth, 
    authorizeRole(['student', 'course_rep']), 
    async (req, res) => {
      try {
        const { classroomId, sectionId, materialId } = req.params;
        const { userAnswers } = req.body;
  
        // Validate userAnswers
        if (!Array.isArray(userAnswers) || userAnswers.length === 0) {
          return res.status(400).json({ error: 'Invalid user answers format' });
        }
  
        // Verify classroom membership for students
        if (req.user.role === 'student') {
          const classroomStudent = await ClassroomStudent.findOne({
            where: { 
              student_id: req.user.user_id, 
              classroom_id: classroomId 
            }
          });
  
          if (!classroomStudent) {
            return res.status(403).json({ error: 'Not enrolled in this classroom' });
          }
        }
  
        // Fetch the full questions to verify answers
        const questions = await Question.findAll({
          where: {
            material_id: materialId,
            course_section_id: sectionId,
            classroom_id: classroomId,
            question_id: userAnswers.map(a => a.question_id)
          }
        });
  
        if (questions.length === 0) {
          return res.status(404).json({ error: 'No questions found' });
        }
  
      // Backend: Scoring logic (no changes needed)
  const scoredAnswers = userAnswers.map(userAnswer => {
    const question = questions.find(q => q.question_id === userAnswer.question_id);
  
    if (!question) {
      console.error(`Question not found for ID: ${userAnswer.question_id}`);
      return null;
    }
  
    // The selected_option is already the original index
    const originalOptionIndex = userAnswer.selected_option;
  
    // Validate that both the answer and correct_answer exist
    const isCorrect = question.correct_answer !== undefined && 
                     originalOptionIndex !== undefined && 
                     question.correct_answer === originalOptionIndex;
  
    return {
      question_id: userAnswer.question_id,
      question_text: question.question_text,
      user_selected_option: originalOptionIndex, // Original index
      correct_answer: question.correct_answer,
      correct_option: question.options[question.correct_answer],
      is_correct: isCorrect,
      options: question.options
    };
  }).filter(answer => answer !== null);
  
        if (scoredAnswers.length === 0) {
          return res.status(400).json({ error: 'No valid answers could be processed' });
        }
  
        const score = (scoredAnswers.filter(a => a.is_correct).length / scoredAnswers.length) * 100;
  
        // Record the attempt
        await SlideQuestionAttempt.create({
          user_id: req.user.user_id,
            material_id: materialId,
          classroom_id: classroomId,
          course_section_id: sectionId,
          questions_attempted: scoredAnswers,
          score
        });
  
        res.status(200).json({
          message: 'Test submitted successfully',
          score,
          attempts: scoredAnswers
        });
      } catch (error) {
        console.error('Error submitting test:', error);
        res.status(500).json({ 
          error: 'Internal server error',
        });
      }
  });
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

  studentRouter.get('/api/student/classrooms', 
    auth, 
    authorizeRole(['student']), 
    async (req, res) => {
      try {
        const user = await User.findOne({
          where: { user_id: req.user.user_id },
          include: [{
            model: Classroom,
            as: 'classrooms',
            through: { attributes: [] }, 
            include: [{
              model: CourseSection,
              as: 'courseSections',
              attributes: ['course_section_id', 'course_title', 'course_code']
            }],
            attributes: [
              'classroom_id',
              'name',
              'level',
              'department',
              'session'
            ]
          }]
        });
  
        if (!user) {
          return res.status(404).json({
            error: 'User not found'
          });
        }
  
        res.status(200).json({
          message: 'Classrooms retrieved successfully',
          classrooms: user.classrooms
        });
      } catch (error) {
        console.error('Error fetching classrooms:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
  });
  
  // Get all classrooms the student is enrolled in
  studentRouter.get('/api/student/classrooms/:classroomId', 
    auth, 
    authorizeRole(['student']), 
    async (req, res) => {
      const { classroomId } = req.params;
      
      try {
        // First verify the student is part of this classroom
        const classroomStudent = await ClassroomStudent.findOne({
          where: {
            student_id: req.user.user_id,
            classroom_id: classroomId
          }
        });
  
        if (!classroomStudent) {
          return res.status(404).json({
            error: 'Classroom not found or you do not have permission to access it'
          });
        }
  
        // Then fetch the classroom details
        const classroom = await Classroom.findOne({
          where: { classroom_id: classroomId },
          attributes: [
            'classroom_id',
            'name',
            'level',
            'department',
            'session'
          ],
          include: [{
            model: CourseSection,
            as: 'courseSections',
            attributes: ['course_section_id', 'course_title', 'course_code']
          }]
        });
  
        if (!classroom) { 
          return res.status(404).json({
            error: 'Classroom not found'
          });
        }
  
        res.status(200).json({
          message: 'Classroom fetched successfully',
          classroom
        });
      } catch (error) {
        console.error('Error fetching classroom:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
  });
  
  // Get course sections in a classroom
studentRouter.get('/api/student/classrooms/:classroomId/sections', auth, authorizeRole(['student']), async (req, res) => {
    try {
      const studentClassroom = await ClassroomStudent.findOne({
        where: { 
          student_id: req.user.user_id, 
          classroom_id: req.params.classroomId 
        }
      });
  
      if (!studentClassroom) {
        return res.status(404).json({ error: 'You are not enrolled in this classroom' });
      }
  
      const sections = await CourseSection.findAll({
        where: { classroom_id: req.params.classroomId }
      });
  
      res.status(200).json({
        message: 'Sections retrieved successfully',
        sections
      });
    } catch (error) {
      console.error('Error fetching sections:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
// Get Course Materials in a course section
studentRouter.get('/api/student/classrooms/:classroomId/sections/:sectionId/slides', 
    auth, authorizeRole(['student']), async (req, res) => {
    try {
      const studentClassroom = await ClassroomStudent.findOne({
        where: { 
          student_id: req.user.user_id, 
          classroom_id: req.params.classroomId 
        }
      });
  
      if (!studentClassroom) {
        return res.status(404).json({ error: 'You are not enrolled in this classroom' });
      }
  
      const courseMaterials = await CourseMaterial.findAll({
        where: { 
          classroom_id: req.params.classroomId,
          course_section_id: req.params.sectionId
        }
      });
  
      res.status(200).json({
        message: 'Course Material retrieved successfully',
        slides
      });
    } catch (error) {
      console.error('Error fetching course material:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  // Get past questions in a course section
studentRouter.get('/api/student/classrooms/:classroomId/sections/:sectionId/past-questions', 
    auth, authorizeRole(['student']), async (req, res) => {
    try {
      const studentClassroom = await ClassroomStudent.findOne({
        where: { 
          student_id: req.user.user_id, 
          classroom_id: req.params.classroomId 
        }
      });
  
      if (!studentClassroom) {
        return res.status(404).json({ error: 'You are not enrolled in this classroom' });
      }
  
      const pastQuestions = await PastQuestion.findAll({
        where: { 
          classroom_id: req.params.classroomId,
          course_section_id: req.params.sectionId
        }
      });
  
      res.status(200).json({
        message: 'Past questions retrieved successfully',
        pastQuestions
      });
    } catch (error) {
      console.error('Error fetching past questions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Get announcements for a classroom
  studentRouter.get('/api/student/classrooms/:classroomId/announcements', 
    auth,
     authorizeRole(['student']),
      async (req, res) => {
    try {
      const studentClassroom = await ClassroomStudent.findOne({
        where: { 
          student_id: req.user.user_id, 
          classroom_id: req.params.classroomId 
        }
      });
  
      if (!studentClassroom) {
        return res.status(404).json({ error: 'You are not enrolled in this classroom' });
      }
  
      const announcements = await Announcement.findAll({
        where: { classroom_id: req.params.classroomId },
        order: [['date', 'DESC']]
      });
  
      res.status(200).json({
        message: 'Announcements retrieved successfully',
        announcements
      });
    } catch (error) {
      console.error('Error fetching announcements:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  // Set study preferences
  studentRouter.post('/api/student/study/preferences',
    auth,
    authorizeRole(['student', 'course_rep']),
    async (req, res) => {
      try {
        // Check if there's an existing schedule
        const hasSchedule = await StudentService.checkExistingSchedule(req.user.user_id);
        if (hasSchedule) {
          return res.status(400).json({
            error: 'Cannot modify preferences while a study schedule exists. Please delete the current schedule first.'
          });
        }
  
        const { preferences } = req.body;
        
        // Convert array format to object format
        const daily_preferences = preferences.reduce((acc, { day, slots }) => {
          acc[day] = slots;
          return acc;
        }, {
          Monday: [],
          Tuesday: [],
          Wednesday: [],
          Thursday: [],
          Friday: [],
          Saturday: [],
          Sunday: []
        });
  
        await UserStudyPreference.upsert({
          user_id: req.user.user_id,
          daily_preferences
        });
  
        res.status(200).json({
          message: 'Study preferences set successfully',
          preferences: daily_preferences
        });
      } catch (error) {
        console.error('Error setting preferences:', error);
        res.status(500).json({
          error: 'Failed to set study preferences',
          details: error.message
        });
      }
  });
  
  
  
  const checkExistingSchedule = async (userId) => {
    const existingCourses = await UserCourse.findOne({
      where: { user_id: userId }
    });
    return !!existingCourses;
  };
  
  
  // Get user's selected study preferences
  studentRouter.get('/api/student/study/preferences/selected',
    auth,
    authorizeRole(['student', 'course_rep']),
    async (req, res) => {
      try {
        const userPreferences = await UserStudyPreference.findOne({
          where: { user_id: req.user.user_id }
        });
  
        if (!userPreferences) {
          return res.status(404).json({
            message: 'No study preferences found'
          });
        }
  
        // Convert preferences to a more readable format
        const formattedPreferences = Object.entries(userPreferences.daily_preferences)
          .map(([day, slots]) => {
            const timeSlots = slots.map(slot => {
              const times = {
                morning: "8:00 AM - 11:15 AM",
                afternoon: "2:00 PM - 5:15 PM",
                evening: "6:00 PM - 9:15 PM"
              };
              return {
                period: slot,
                time: times[slot]
              };
            });
  
            return {
              day,
              selected_slots: timeSlots
            };
          })
          .filter(pref => pref.selected_slots.length > 0);
  
        res.status(200).json({
          message: 'Study preferences retrieved successfully',
          preferences: formattedPreferences
        });
      } catch (error) {
        console.error('Error fetching selected preferences:', error);
        res.status(500).json({ error: 'Failed to fetch study preferences' });
      }
  });
  

  
  
  
  // Add courses for study schedule
  studentRouter.post('/api/student/study/courses',
    auth,
    authorizeRole(['student', 'course_rep']),
    async (req, res) => {
      try {
        // Check if courses already exist
        const existingCourses = await UserCourse.findOne({
          where: { user_id: req.user.user_id }
        });
  
        if (existingCourses) {
          return res.status(400).json({
            error: 'A study schedule already exists. Please delete the current schedule before creating a new one.'
          });
        }
  
        const { courses } = req.body;
  
        // Validate total units
        const totalUnits = courses.reduce((sum, course) => sum + course.course_units, 0);
        if (totalUnits > 24) {
          return res.status(400).json({ error: 'Total course units cannot exceed 24' });
        }
  
        if (courses.length > 10) {
          return res.status(400).json({ error: 'Maximum number of courses is 10' });
        }
  
        // Check if preferences exist
        const preferences = await UserStudyPreference.findOne({
          where: { user_id: req.user.user_id }
        });
  
        if (!preferences) {
          return res.status(400).json({
            error: 'Please set your study preferences before creating a schedule'
          });
        }
  
        await UserCourse.bulkCreate(
          courses.map(course => ({
            user_id: req.user.user_id,
            ...course
          }))
        );
  
        const schedule = await StudentService.generateSchedule(req.user.user_id);
        // Get tomorrow's schedule immediately after creation
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDay = tomorrow.toLocaleString('en-us', { weekday: 'long' });
      
      if (schedule[tomorrowDay]) {
        const formattedSessions = formatScheduleForEmail(schedule[tomorrowDay]);
        await sendScheduleEmail(
          req.user.email,
          req.user.first_name,
          tomorrowDay,
          formattedSessions
        );
      }
        res.status(201).json({
          message: 'Courses added and schedule generated successfully',
          schedule
        });
      } catch (error) {
        console.error('Error adding courses:', error);
        res.status(500).json({ error: 'Failed to add courses' });
      }
  });
  // Get study schedule
  studentRouter.get('/api/student/study/schedule',
    auth,
    authorizeRole(['student', 'course_rep']), 
    async (req, res) => {
      try {
        const schedule = await StudentService.generateSchedule(req.user.user_id);
  
        if (!schedule) {
          return res.status(404).json({
            message: 'No study schedule found'
          });
        }
  
        res.status(200).json({
          message: 'Study schedule retrieved successfully',
          schedule
        });
      } catch (error) {
        console.error('Error fetching schedule:', error);
        res.status(500).json({ error: 'Failed to fetch study schedule' });
      }
  });
  // Get current study schedule with detailed information

  studentRouter.get('/api/student/study/schedule/detailed',
    auth,
    authorizeRole(['student', 'course_rep']),
    async (req, res) => {
      try {
        const schedule = await StudentService.generateSchedule(req.user.user_id);
        
        if (!schedule || Object.keys(schedule).length === 0) {
          return res.status(404).json({
            message: 'No study schedule found'
          });
        }
  
        const courses = await UserCourse.findAll({
          where: { user_id: req.user.user_id }
        });
  
        const totalUnits = courses.reduce((sum, course) => sum + course.course_units, 0);
        const courseCount = courses.length;
  
        // Get schedule analysis
        const scheduleAnalysis = await StudentService.analyzeScheduleCompleteness(
          req.user.user_id,
          schedule,
          courses
        );
  
        const scheduleSummary = {
          total_courses: courseCount,
          total_units: totalUnits,
          schedule_days: Object.keys(schedule).length,
          courses: courses.map(c => ({
            code: c.course_code,
            units: c.course_units
          })),
          schedule_status: {
            is_complete: scheduleAnalysis.complete,
            unscheduled_courses: scheduleAnalysis.unscheduled_courses,
            partially_scheduled: scheduleAnalysis.partially_scheduled,
            recommendations: scheduleAnalysis.recommendations
          }
        };
  
        res.status(200).json({
          message: 'Study schedule retrieved successfully',
          summary: scheduleSummary,
          schedule,
          analysis: scheduleAnalysis
        });
      } catch (error) {
        console.error('Error fetching detailed schedule:', error);
        res.status(500).json({ error: 'Failed to fetch study schedule' });
      }
  });
  
  // Initialize schedule notifications with error handling
  const initializeScheduleNotifications = () => {
    try {
      cron.schedule('0 20 * * *', async () => {
        try {
          const studentsWithSchedules = await User.findAll({
            where: {
              role: 'student',
              is_verified: true
            },
            include: [{
              model: UserCourse,
              required: true
            }]
          });
  
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowDay = tomorrow.toLocaleString('en-us', { weekday: 'long' });
  
          for (const student of studentsWithSchedules) {
            try {
              const fullSchedule = await StudentService.generateSchedule(student.user_id);
              const tomorrowSchedule = fullSchedule[tomorrowDay];
  
              if (tomorrowSchedule && Object.keys(tomorrowSchedule).length > 0) {
                const formattedSessions = StudentService.formatScheduleForEmail(tomorrowSchedule);
                await StudentService.sendScheduleEmail(
                  student.email,
                  student.first_name,
                  tomorrowDay,
                  formattedSessions
                );
              }
            } catch (studentError) {
              console.error(`Error processing schedule for student ${student.user_id}:`, studentError);
              // Continue with next student
            }
          }
        } catch (error) {
          console.error('Error in schedule notification cron job:', error);
        }
      });
      console.log('Schedule notifications initialized successfully');
    } catch (error) {
      console.error('Error initializing schedule notifications:', error);
    }
  };

  // Add delete schedule endpoint
studentRouter.delete('/api/student/study/schedule',
    auth,
    authorizeRole(['student', 'course_rep']),
    async (req, res) => {
      try {
        await UserCourse.destroy({
          where: { user_id: req.user.user_id }
        });
  
        res.status(200).json({
          message: 'Study schedule deleted successfully'
        });
      } catch (error) {
        console.error('Error deleting schedule:', error);
        res.status(500).json({ error: 'Failed to delete study schedule' });
      }
  });


  module.exports = {
    studentRouter,
    initializeScheduleNotifications
  };


