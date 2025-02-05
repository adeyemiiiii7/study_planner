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
const { Groq } = require('groq-sdk'); 
const Question = require('../models/question');
require('dotenv').config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
  });
  async function generateQuestionsWithGroq(materialContent, materialNumber) {
    const prompt = `IMPORTANT: Provide ONLY a valid JSON array. Do not include any explanatory text before or after.
  
  Generate 25 multiple choice questions based on the following structured slide content.
  Ensure questions cover different aspects and difficulty levels.
  
  Main Concepts: ${materialContent.split('Main Concepts:')[1]?.split('Key Definitions:')[0] || ''}
  Key Definitions: ${materialContent.split('Key Definitions:')[1]?.split('Examples:')[0] || ''}
  Examples: ${materialContent.split('Examples:')[1]?.split('Additional Notes:')[0] || ''}
  Additional Notes: ${materialContent.split('Additional Notes:')[1] || ''}
  
  Generate questions in this EXACT JSON format:
  [
    {
      "question_text": "Precise question about the content",
      "options": ["option A", "option B", "option C", "option D"],
      "correct_answer": 0,
      "question_type": "definition",
      "difficulty_level": "medium"
    }
  ]
  
  Slide ${materialNumber} content: ${materialContent}
  
  JSON ARRAY:`;
  
    let response;
    try {
      response = await groq.chat.completions.create({
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        max_tokens: 3000
      });
  
      const responseText = response.choices[0]?.message?.content?.trim();
      
      if (!responseText) {
        throw new Error('Empty response from Groq API');
      }
  
      const jsonMatch = responseText.match(/\[.*\]/s);
      
      if (!jsonMatch) {
        throw new Error('No valid JSON array found in response');
      }
  
      const questions = JSON.parse(jsonMatch[0]);
      return questions.map(q => ({
        ...q,
        material_number: materialNumber
      }));
  
    } catch (error) {
      console.error('Detailed error generating questions:', {
        message: error.message,
        responseText: response?.choices?.[0]?.message?.content || 'No response available',
        error: error.stack
      });
      
      // Re-throw with more context
      throw new Error(`Failed to generate questions: ${error.message}`);
    }
  }
  // Get questions endpoint with slide-specific filtering and improved error handling
courseRepRouter.get('/api/course-rep/classrooms/:classroomId/course-sections/:courseSectionId/slides/:slideId/questions',
    auth,
    authorizeRole(['course_rep']),
    async (req, res) => {
      try {
        const { classroomId, courseSectionId, slideId } = req.params;
  
        // Validate slide existence first
        const courseMaterial = await CourseMaterial.findOne({
          where: {
            material_id:  materialId,
            course_section_id: courseSectionId,
            classroom_id: classroomId
          }
        });
  
        if (!courseMaterial) {
          return res.status(404).json({ 
            error: 'Course Material not found or unauthorized access',
            questions: [] 
          });
        }
  
        // Fetch questions for the specific slide
        const questions = await Question.findAll({
          where: {
            material_id:  materialId,
            course_section_id: courseSectionId,
            classroom_id: classroomId
          },
          order: [['material_number', 'ASC']],
          attributes: [
            'question_id', 
            'question_text', 
            'options', 
            'correct_answer', 
            'question_type', 
            'difficulty_level',
            'material_number'
          ]
        });
  
        res.status(200).json({
          message: 'Questions retrieved successfully',
          questions: questions.length > 0 ? questions : [],
          courseMaterial: {
            material_id:  materialId,
            material_name: courseMaterial.material_name,
            material_number: courseMaterial.material_number
          }
        });
      } catch (error) {
        console.error('Error fetching questions:', error);
        res.status(500).json({ 
          error: 'Failed to fetch questions',
          questions: []
        });
      }
  });
  
  // Updated generate questions endpoint with more robust error handling
  courseRepRouter.post('/api/course-rep/classrooms/:classroomId/course-sections/:courseSectionId/slides/:slideId/generate-questions',
    auth,
    authorizeRole(['course_rep']),
    async (req, res) => {
      const transaction = await sequelize.transaction();
      try {
        const { classroomId, courseSectionId, materialId} = req.params;
        const {materialContent, materialNumber } = req.body;
        
        // Validate inputs
        if (!slideContent) {
          return res.status(400).json({ 
            error: 'Slide content is required for generating questions',
            questions: []
          });
        }
  
        // Validate slide existence and ownership
        const courseMaterial = await CourseMaterial.findOne({
          where: {
            material_id: materialId,
            course_section_id: courseSectionId,
            classroom_id: classroomId
          },
          transaction
        });
  
        if (!courseMaterial) {
          await transaction.rollback();
          return res.status(404).json({ 
            error: 'Course Material not found or unauthorized access',
            questions: []
          });
        }
  
        // First, delete any existing questions for this slide
        await Question.destroy({
          where: {
            material_id: materialId,
            course_section_id: courseSectionId,
            classroom_id: classroomId
          },
          transaction
        });
  
        // Generate new questions
        const generatedQuestions = await generateQuestionsWithGroq(slideContent, slideNumber);
        
        // Save generated questions
        const savedQuestions = await Promise.all(
          generatedQuestions.map(q => Question.create({
            ...q,
            material_id: courseMaterial.material_id,
            course_section_id: courseSectionId,
            classroom_id: classroomId
          }, { transaction }))
        );
  
        // Commit transaction
        await transaction.commit();
  
        res.status(200).json({
          message: 'Questions generated successfully',
          questions: savedQuestions,
          courseMaterial: {
            material_id: courseMaterial.material_id,
            material_name: courseMaterial.slide_name,
            material_number: courseMaterial.slide_number
          }
        });
  
      } catch (error) {
        // Rollback transaction in case of error
        if (transaction) await transaction.rollback();
        
        console.error('Error generating questions:', error);
        res.status(500).json({ 
          error: 'Failed to generate questions',
          details: error.message,
          questions: []
        });
      }
  });
  
  // Edit question endpoint with additional validation
  courseRepRouter.put('/api/course-rep/classrooms/:classroomId/questions/:questionId',
    auth,
    authorizeRole(['course_rep']),
    async (req, res) => {
      try {
        const { classroomId } = req.params;
        const {
          question_text,
          options,
          correct_answer,
          question_type,
          difficulty_level,
          status,
          feedback
        } = req.body;
  
        const question = await Question.findOne({
          where: {
            question_id: req.params.questionId,
            classroom_id: classroomId
          },
          include: [{
            model: CourseMaterial,
            where: { classroom_id: classroomId }
          }]
        });
  
        if (!question) {
          return res.status(404).json({ error: 'Question not found or unauthorized access' });
        }
  
        await question.update({
          question_text: question_text || question.question_text,
          options: options || question.options,
          correct_answer: (correct_answer !== undefined) ? correct_answer : question.correct_answer,
          question_type: question_type || question.question_type,
          difficulty_level: difficulty_level || question.difficulty_level,
          status: status || question.status,
          feedback: feedback || question.feedback
        });
  
        res.status(200).json({
          message: 'Question updated successfully',
          question
        });
  
      } catch (error) {
        console.error('Error updating question:', error);
        res.status(500).json({ error: 'Failed to update question' });
      }
  });
  
  // Delete question endpoint with classroom validation
  courseRepRouter.delete('/api/course-rep/classrooms/:classroomId/questions/:questionId',
    auth,
    authorizeRole(['course_rep']),
    async (req, res) => {
      try {
        const { classroomId } = req.params;
  
        const question = await Question.findOne({
          where: {
            question_id: req.params.questionId,
            classroom_id: classroomId
          }
        });
  
        if (!question) {
          return res.status(404).json({ error: 'Question not found or unauthorized access' });
        }
  
        await question.destroy();
        res.status(200).json({
          message: 'Question deleted successfully'
        });
  
      } catch (error) {
        res.status(500).json({ error: 'Failed to delete question' });
      }
  });
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
     // First check if the classroom exists and belongs to the course rep
     const classroom = await Classroom.findOne({
       where: {
         classroom_id: classroomId,
         course_rep_id: req.user.user_id,
       },
     });
 
     if (!classroom) {
       return res.status(404).json({ error: 'Classroom not found or you are not the course rep' });
     }

     // Check for existing course section with the same title and code
     const existingSection = await CourseSection.findOne({
       where: {
         classroom_id: classroomId,
         course_title: courseTitle,
         course_code: courseCode
       }
     });

     if (existingSection) {
       return res.status(409).json({ 
         error: 'A course section with this title and code already exists in this classroom' 
       });
     }

     // Create the new section if no duplicate exists
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
     res.status(500).json({ 
       error: 'An error occurred while creating the section',
       details: error.message 
     });
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