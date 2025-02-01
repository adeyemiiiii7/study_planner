const express = require('express');
const {generateJoinCode }= require('../utils/generateJoinCode');
const auth = require('../middleware/auth');
const authorizeRole = require('../middleware/authorizeRole');
const courseRepRouter = express.Router();
const nodemailer = require('nodemailer');
const Classroom = require('../models/classroom');
const ClassroomStudent = require('../models/classroomStudent');
const User = require('../models/user');
const sequelize = require('../config/database');
require('dotenv').config();
const { getClassroomCreatedTemplate } = require('../utils/emailTemplates');
const CourseSection = require('../models/courseSection');
const upload = require('../middleware/upload');
const CourseMaterial = require('../models/courseMaterial');
const PastQuestion = require('../models/pastQuestion');
const Announcement = require('../models/annocements');
const { fetchLeaderboard } = require('../utils/fetchLeaderboard');
// Route for creating a classroom
courseRepRouter.post('/api/course-rep/classrooms/create', auth, authorizeRole(['course_rep']), async (req, res) => {
    const { name, level, department, session, course_of_study } = req.body;
    try {
      console.log('Request Body:', req.body);
  
      if (!req.user || !req.user.user_id) {
        return res.status(400).json({ error: 'User information is missing' });
      }
  
      if (!course_of_study) {  
        return res.status(400).json({ error: 'Course of study is required' });
    }
      // Check if course rep already has an active classroom
      const existingActiveClassroom = await Classroom.findOne({
        where: {
          course_rep_id: req.user.user_id,
          is_active: true
        }
      });
  
      if (existingActiveClassroom) {
        return res.status(409).json({ 
          error: 'You already have an active classroom. Please deactivate your current classroom before creating a new one.'
        });
      }
  
      // Sanitize email
      const courseRepEmail = req.user.email
        .trim()
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
        .normalize('NFKC');
  
      if (!courseRepEmail || typeof courseRepEmail !== 'string' || !courseRepEmail.includes('@')) {
        return res.status(400).json({ error: 'Invalid course representative email' });
      }
  
      const existingClassroom = await Classroom.findOne({
        where: {
         course_of_study,
          level,
          department,
          session,
          course_rep_id: req.user.user_id,
        },
      });
  
      if (existingClassroom) {
        return res.status(409).json({ 
          error: 'A classroom with this course, department and level already exists for this course representative' 
        });
      }
  
      const joinCode = generateJoinCode();
      // Create email transporter with proper configuration
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'aladesuyides@gmail.com', 
          pass: 'kugi fihw cugc trye'
        },
        tls: {
          rejectUnauthorized: false // Allow self-signed certificates
        }
      });
      const mailOptions = {
        from: 'Classroom Management',
        to: courseRepEmail.trim(), 
        subject: 'Classroom Join Code',
        headers: {
          'Priority': 'high',
          'X-MS-Exchange-Organization-AuthAs': 'Internal'
        },
        html: getClassroomCreatedTemplate(req.user, {
            name,
            department,
            level,
            joinCode
          })
        };
        try {
        const emailResult = await new Promise((resolve, reject) => {
          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.error('Detailed Email Error:', {
                error: error.message,
                code: error.code,
                command: error.command,
                responseCode: error.responseCode,
                response: error.response
              });
              reject(error);
            } else {
              console.log('Email sent successfully:', info.response);
              resolve(info);
            }
          });
        });
  
        const classroom = await Classroom.create({
          name,
          level,
          department,
         course_of_study,
          session,
          join_code: joinCode,
          course_rep_id: req.user.user_id,
          is_active: true
        });
  
        res.status(200).json({
          message: 'Classroom created successfully and notification email sent',
          classroom,
        });
  
      } catch (emailError) {
        console.error('Failed to send email:', emailError);
        return res.status(500).json({ 
          error: 'Failed to send notification email. Classroom was not created.',
          details: emailError.message 
        });
      }
  
    } catch (error) {
      console.error('Error Creating Classroom:', error);
      res.status(500).json({ 
        error: 'An error occurred while creating the classroom',
        details: error.message 
      });
    }
  });
  // Route for deactivating a classroom
  courseRepRouter.delete('/api/course-rep/classrooms/:classroomId', 
    auth, 
    authorizeRole(['course_rep']), 
    async (req, res) => {
      const t = await sequelize.transaction();
      
      try {
        const classroom = await Classroom.findOne({
          where: {
            classroom_id: req.params.classroomId,
            course_rep_id: req.user.user_id
          },
          transaction: t
        });
  
        if (!classroom) {
          await t.rollback();
          return res.status(404).json({ error: 'Classroom not found or unauthorized' });
        }
  
        // Delete all associated records within transaction
        await Promise.all([
          CourseSection.destroy({
            where: { classroom_id: req.params.classroomId },
            transaction: t
          }),
          ClassroomStudent.destroy({
            where: { classroom_id: req.params.classroomId },
            transaction: t
          }),
          Announcement.destroy({
            where: { classroom_id: req.params.classroomId },
            transaction: t
          })
        ]);
  
        await classroom.destroy({ transaction: t });
        await t.commit();
  
        res.status(200).json({ message: 'Classroom deleted successfully' });
      } catch (error) {
        await t.rollback();
        console.error('Error deleting classroom:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
  });
  // Route for creating a course section inside a classroom
courseRepRouter.post('/api/course-rep/classrooms/:classroomId/course-sections/create',
    auth, authorizeRole(['course_rep']), async (req, res) => {
   const { classroomId } = req.params;
   const { courseTitle, courseCode } = req.body;
 
   try {
     const classroom = await Classroom.findOne({
       where: {
         classroom_id: classroomId,
         course_rep_id: req.user.user_id,
       },
     });
 
     if (!classroom) {
       return res.status(404).json({ error: 'Classroom not found or you are not the course rep' });
     }
     const section = await CourseSection.create({
       course_title: courseTitle,
       course_code: courseCode,
       classroom_id: classroomId,
     });
     res.status(200).json({
       message: 'Section created successfully',
       section,
     });
   } catch (error) {
     console.error('Error Creating Section:', error);
     res.status(500).json({ error: 'An error occurred while creating the section' });
   }
 });

 //route to delete a course section
 courseRepRouter.delete('/api/course-rep/classrooms/:classroomId/course-sections/:sectionId', 
    auth, 
    authorizeRole(['course_rep']), 
    async (req, res) => {
      const t = await sequelize.transaction();
      try {
        const section = await CourseSection.findOne({
          where: {
            course_section_id: req.params.sectionId,
            classroom_id: req.params.classroomId
          }
        });
  
        if (!section) {
          await t.rollback();
          return res.status(404).json({ error: 'Course section not found or unauthorized' });
        }
  
        // First, delete Questions referencing Slides in this section
        await Question.destroy({
          where: { 
            course_section_id: section.course_section_id 
          },
          transaction: t
        });
  
        // Then delete associated records
        await Promise.all([
          CourseMaterial.destroy({
            where: { course_section_id: section.course_section_id },
            transaction: t
          }),
          PastQuestion.destroy({
            where: { course_section_id: section.course_section_id },
            transaction: t
          })
        ]);
  
        // Finally delete the section
        await section.destroy({ transaction: t });
        await t.commit();
  
        res.status(200).json({ message: 'Course section deleted successfully' });
      } catch (error) {
        await t.rollback();
        console.error('Error deleting course section:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
  });
  
 
 // Route to get all classrooms managed by the course rep
 courseRepRouter.get('/api/course-rep/classrooms', 
   auth, authorizeRole(['course_rep']), async (req, res) => {
   try {
     const classrooms = await Classroom.findAll({
       where: { course_rep_id: req.user.user_id },
       include: {
         model: CourseSection,
         as: 'courseSections',
         attributes: ['course_section_id', 'course_title', 'course_code'],
       }
     });
     res.status(200).json({
       message: 'Classrooms fetched successfully',
       classrooms,
     });
   } catch (error) {
     console.error('Error Fetching Classrooms:', error);
     res.status(500).json({ error: 'An error occurred while fetching classrooms' });
   }
 });
// Route to get a specific classroom details
courseRepRouter.get('/api/course-rep/classrooms/:classroomId', 
    auth, 
    authorizeRole(['course_rep']), 
    async (req, res) => {
      const { classroomId } = req.params;
  
      try {
        const classroom = await Classroom.findOne({
          where: {
            classroom_id: classroomId,
            course_rep_id: req.user.user_id
          },
          attributes: ['classroom_id', 'name', 'level', 'department', 'session']
        });
  
        if (!classroom) {
          return res.status(404).json({ 
            error: 'Classroom not found or you do not have permission to access it' 
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
  // Route to fetch sections under a specific classroom
  courseRepRouter.get('/api/course-rep/classrooms/:classroomId/course-sections', 
    auth, authorizeRole(['course_rep']), async (req, res) => {
    const { classroomId } = req.params;
  
    try {
      const classroom = await Classroom.findOne({
        where: {
          classroom_id: classroomId,
          course_rep_id: req.user.user_id,
        },
      });
  
      if (!classroom) {
        return res.status(404).json({ error: 'Classroom not found or you are not the course rep' });
      }
  
      const sections = await CourseSection.findAll({
        where: { classroom_id: classroomId },
        attributes: ['course_section_id', 'course_title', 'course_code'],
      });
  
      res.status(200).json({
        message: 'Course Sections fetched successfully',
        sections,
      });
    } catch (error) {
      console.error('Error Fetching Sections:', error);
      res.status(500).json({ error: 'An error occurred while fetching sections' });
    }
  });

// Route to get a specific course section's details
courseRepRouter.get('/api/course-rep/classrooms/:classroomId/course-sections/:courseSectionId', 
    auth, 
    authorizeRole(['course_rep']), 
    async (req, res) => {
      const { classroomId, courseSectionId } = req.params;
  
      try {
        const section = await CourseSection.findOne({
          where: {
            course_section_id: courseSectionId,
            classroom_id: classroomId
          },
          attributes: ['course_section_id', 'course_title', 'course_code']
        });
  
        if (!section) {
          return res.status(404).json({ 
            error: 'Course section not found' 
          });
        }
  
        res.status(200).json({
          message: 'Course section fetched successfully',
          section
        });
      } catch (error) {
        console.error('Error fetching course section:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
  });
  

// Route to upload a course material to a course section
courseRepRouter.post('/api/course-rep/classrooms/:classroomId/course-sections/:courseSectionId/course-materials/upload', 
    auth, authorizeRole(['course_rep']), upload.single('file'), async (req, res) => {
    try {
      const { classroomId, courseSectionId } = req.params;
      const { material_name, material_number } = req.body;
      const file_url = req.file.path;
  
      const courseSection = await CourseSection.findOne({
        where: {
          course_section_id: courseSectionId,
          classroom_id: classroomId,
        },
      });
  
      if (!courseSection) {
        return res.status(400).json({ error: 'Course section not found' });
      }
  
      if (!material_number || isNaN(material_number)) {
        return res.status(400).json({ error: 'Invalid material number. Please provide a valid number.' });
      }
  
      const existingMaterial = await CourseMaterial.findOne({
        where: {
          course_section_id: courseSection.course_section_id,
         material_number: parseInt(material_number),
        },
      });
      if (existingMaterial) {
        return res.status(400).json({ error: 'Material Number already exists in this course section. Please use a different number.' });
      }
  
      const newCourseMaterial = await CourseMaterial.create({
       material_name,
        file_name: req.file.originalname,
        file_url,
        material_number: parseInt(material_number),
        course_section_id: courseSection.course_section_id,
        classroom_id: classroomId,
      });
  
      res.json({ message: 'Course Material uploaded successfully', CourseMaterial: newCourseMaterial });
    } catch (error) {
      console.error('Error uploading Course Material:', error);
      res.status(500).json({ error: 'Failed to upload Course Material' });
    }
  });
  //Fetch Slides by Sections
courseRepRouter.get('/api/course-rep/classrooms/:classroomId/course-sections/:courseSectionId/course-materals', 
    auth, authorizeRole(['course_rep']), async (req, res) => {
    const { classroomId, courseSectionId } = req.params;
    try {
      const courseMaterials = await CourseMaterial.findAll({
        where: { course_section_id: courseSectionId, classroom_id: classroomId },
        attributes: ['material_id', 'material_name', 'file_name', 'file_url', 'material_number'],
      });
  
      res.status(200).json({
        message: 'Course Materials fetched successfully',
       courseMaterials
      });
    } catch (error) {
      console.error('Error Fetching Course Materials:', error);
      res.status(500).json({ error: 'An error occurred while fetching Course Materials' });
    }
  });
  // Delete Course Materials
courseRepRouter.delete('/api/course-rep/classrooms/:classroomId/slides/:slideId',
    auth,
    authorizeRole(['course_rep']),
    async (req, res) => {
     const t = await sequelize.transaction();
     try {
       const courseMaterials = await CourseMaterial.findOne({
         where: {
           material_id: req.params.materialId,
           classroom_id: req.params.classroomId
         }
       });
  
       if (!courseMaterials) {
         await t.rollback();
         return res.status(404).json({ error: 'Course Material not found' });
       }
  
       // First, delete associated questions
       await Question.destroy({
         where: { slide_id: slide.slide_id },
         transaction: t
       });
  
       // Then delete the course material
       await courseMaterials.destroy({ transaction: t });
       
       await t.commit();
       res.status(200).json({ message: 'Course Material deleted successfully' });
     } catch (error) {
       await t.rollback();
       console.error('Error deleting Course Material:', error);
       res.status(500).json({ 
         error: 'Internal server error', 
         details: error.message 
       });
     }
    }
  );
//Route to post past questions
courseRepRouter.post('/api/course-rep/classrooms/:classroomId/course-sections/:courseSectionId/past-questions/upload',
    auth,
    authorizeRole(['course_rep']),
    upload.array('files', 5),
    async (req, res) => {
      try {
        const { classroomId, courseSectionId } = req.params;
        const { past_question_name } = req.body;
  
        if (!req.files || req.files.length === 0) {
          return res.status(400).json({ error: 'No files uploaded' });
        }
  
        const courseSection = await CourseSection.findOne({
          where: {
            course_section_id: courseSectionId,
            classroom_id: classroomId,
          },
        });
  
        if (!courseSection) {
          return res.status(400).json({ error: 'Course section not found' });
        }
        const file_names = req.files.map(file => file.originalname);
        // Cloudinary returns the URL in the path property
        const file_urls = req.files.map(file => file.path); 
        const newPastQuestion = await PastQuestion.create({
          past_question_name,
          file_names,
          file_urls,
          course_section_id: courseSection.course_section_id,
          classroom_id: classroomId,
        });
  
        res.status(201).json(
          { message: 'Past Question uploaded successfully', past_question: newPastQuestion });
      } catch (error) {
        console.error('Error uploading past question:', error);
        res.status(500).json({ error: 'Failed to upload past question' });
      }
    }
  );
  //Fetch Past Questions by Sections
  courseRepRouter.get('/api/course-rep/classrooms/:classroomId/course-sections/:courseSectionId/past-questions',
    auth,
    authorizeRole(['course_rep']),
    async (req, res) => {
      const { classroomId, courseSectionId } = req.params;
      
      try {
        // Verify classroom exists and user has access
        const classroom = await Classroom.findOne({
          where: {
            classroom_id: classroomId,
            course_rep_id: req.user.user_id
          }
        });
  
        if (!classroom) {
          return res.status(403).json({ 
            error: 'You do not have access to this classroom' 
          });
        }
  
        // Verify course section exists
        const courseSection = await CourseSection.findOne({
          where: {
            course_section_id: courseSectionId,
            classroom_id: classroomId
          }
        });
  
        if (!courseSection) {
          return res.status(404).json({ 
            error: 'Course section not found' 
          });
        }
  
        const pastQuestions = await PastQuestion.findAll({
          where: { 
            course_section_id: courseSectionId,
            classroom_id: classroomId 
          },
          attributes: [
            'past_question_id',
            'past_question_name',
            'file_names',
            'file_urls'
          ]
        });
  
        res.status(200).json({
          message: 'Past questions fetched successfully',
          pastQuestions
        });
        
      } catch (error) {
        console.error('Error fetching past questions:', error);
        res.status(500).json({ 
          error: 'An error occurred while fetching past questions' 
        });
      }
    }
  );
// Delete past question
courseRepRouter.delete('/api/course-rep/classrooms/:classroomId/past-questions/:questionId', 
    auth, 
    authorizeRole(['course_rep']), 
    async (req, res) => {
      try {
        const question = await PastQuestion.findOne({
          where: {
            past_question_id: req.params.questionId,
            classroom_id: req.params.classroomId
          }
        });
  
        if (!question) {
          return res.status(404).json({ error: 'Past question not found' });
        }
  
        await question.destroy();
  
        res.status(200).json({ message: 'Past question deleted successfully' });
      } catch (error) {
        console.error('Error deleting past question:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
  });
//route to  get past questions
  courseRepRouter.get('/api/course-rep/classrooms/:classroomId/course-sections/:courseSectionId/past-questions',
    auth,
    authorizeRole(['course_rep']),
    async (req, res) => {
      const { classroomId, courseSectionId } = req.params;
      
      try {
        // Verify classroom exists and user has access
        const classroom = await Classroom.findOne({
          where: {
            classroom_id: classroomId,
            course_rep_id: req.user.user_id
          }
        });
  
        if (!classroom) {
          return res.status(403).json({ 
            error: 'You do not have access to this classroom' 
          });
        }
  
        // Verify course section exists
        const courseSection = await CourseSection.findOne({
          where: {
            course_section_id: courseSectionId,
            classroom_id: classroomId
          }
        });
  
        if (!courseSection) {
          return res.status(404).json({ 
            error: 'Course section not found' 
          });
        }
  
        const pastQuestions = await PastQuestion.findAll({
          where: { 
            course_section_id: courseSectionId,
            classroom_id: classroomId 
          },
          attributes: [
            'past_question_id',
            'past_question_name',
            'file_names',
            'file_urls'
          ]
        });
  
        res.status(200).json({
          message: 'Past questions fetched successfully',
          pastQuestions
        });
        
      } catch (error) {
        console.error('Error fetching past questions:', error);
        res.status(500).json({ 
          error: 'An error occurred while fetching past questions' 
        });
      }
    }
  );
  
// Route for creating an announcement
courseRepRouter.post('/api/course-rep/classrooms/:classroomId/announcements', 
    auth, 
    authorizeRole(['course_rep']),
    upload.array('files', 5),
    async (req, res) => {
      const { classroomId } = req.params;
      const { content, tag, links } = req.body;
  
      try {
        const classroom = await Classroom.findOne({
          where: {
            classroom_id: classroomId,
            course_rep_id: req.user.user_id,
          },
        });
  
        if (!classroom) {
          return res.status(404).json({ error: 'Classroom not found or unauthorized' });
        }
  
        const files = req.files?.map(file => ({
          fileName: file.originalname,
          fileUrl: file.path
        })) || [];
  
        const parsedLinks = links ? JSON.parse(links) : [];
  
        const now = new Date();
        const announcement = await Announcement.create({
          content,
          classroom_id: classroomId,
          date: now,
          time: now.toTimeString().split(' ')[0],
          tag: tag || 'general',
          files,
          links: parsedLinks
        });
  
        res.status(200).json({
          message: 'Announcement created successfully',
          announcement,
        });
      } catch (error) {
        console.error('Error creating announcement:', error);
        res.status(500).json({ error: 'Failed to create announcement' });
      }
    }
  );
  
// Get all announcements in a classroom
courseRepRouter.get('/api/course-rep/classrooms/:classroomId/announcements', 
    auth, 
    authorizeRole(['course_rep']), 
    async (req, res) => {
      const { tag, startDate, endDate } = req.query;
      
      try {
        const classroom = await Classroom.findOne({
          where: {
            classroom_id: req.params.classroomId,
            course_rep_id: req.user.user_id
          }
        });
  
        if (!classroom) {
          return res.status(404).json({ error: 'Classroom not found or unauthorized' });
        }
  
        let whereClause = { classroom_id: req.params.classroomId };
        
        if (tag) {
          whereClause.tag = tag;
        }
        
        if (startDate && endDate) {
          whereClause.date = {
            [Op.between]: [startDate, endDate]
          };
        }
  
        const announcements = await Announcement.findAll({
          where: whereClause,
          order: [['date', 'DESC'], ['time', 'DESC']],
          attributes: [
            'announcement_id',
            'content',
            'date',
            'time',
            'tag',
            'files',
            'links'
          ]
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

  //fetch leaderboard
  courseRepRouter.get(
    '/api/course-rep/classrooms/:classroomId/leaderboard',
    auth,
    authorizeRole(['course_rep']),
    async (req, res) => {
      const { classroomId } = req.params;
  
      try {
        // Verify the course rep manages this specific classroom
        const classroom = await Classroom.findOne({
          where: {
            classroom_id: classroomId,
            course_rep_id: req.user.user_id,
          },
        });
  
        if (!classroom) {
          return res.status(403).json({
            error: 'You are not authorized to view this classroom\'s leaderboard'
          });
        }
  
        // Fetch leaderboard data
        const leaderboard = await fetchLeaderboard(classroomId);
  
        // Add ranking to the leaderboard data
        const rankedLeaderboard = leaderboard.map((entry, index) => ({
          rank: index + 1,
          ...entry
        }));
  
        res.status(200).json({
          message: 'Leaderboard fetched successfully',
          leaderboard: rankedLeaderboard,
        });
  
      } catch (error) {
        console.error('Error Fetching Leaderboard:', error);
        res.status(500).json({
          error: 'An error occurred while fetching the leaderboard',
          details: error.message
        });
      }
    }
  );
  

   module.exports = courseRepRouter;