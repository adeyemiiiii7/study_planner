const express = require('express');
const wellnessRouter = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/user');
const authorizeRole = require('../middleware/authorizeRole');
const COOLDOWN_DURATION = 45 * 60 * 1000; // 45 minutes in milliseconds

// Start focus mode session
wellnessRouter.post('/api/focus-mode/start', auth, authorizeRole(['student', 'course_rep']), async (req, res) => {
  try {
    const { duration, stressLevel, workType } = req.body;

    if (!duration) {
      return res.status(400).json({ message: 'Duration is required' });
    }

    const user = await User.findByPk(req.user.user_id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is in cooldown period
    const focusData = user.focus_mode_data;
    if (focusData.cooldownEnd && new Date(focusData.cooldownEnd) > new Date()) {
      const remainingCooldown = new Date(focusData.cooldownEnd) - new Date();
      return res.status(403).json({
        message: 'Focus mode is in cooldown period',
        remainingCooldown
      });
    }

    // Convert duration to milliseconds if it's in seconds
    const durationMs = duration * 1000;

    // Update focus mode data
    const focusModeData = {
      lastSessionStart: new Date().toISOString(),
      duration: durationMs,
      isActive: true,
      stressLevel,
      workType,
      cooldownEnd: null
    };

    await User.update(
      { focus_mode_data: focusModeData },
      { where: { user_id: req.user.user_id } }
    );

    res.json({
      success: true,
      message: 'Focus mode session started',
      focusModeData
    });
  } catch (error) {
    console.error('Error starting focus mode:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get focus mode status
wellnessRouter.get('/api/focus-mode/status', auth, authorizeRole(['student', 'course_rep']), async (req, res) => {
  try {
    const user = await User.findByPk(req.user.user_id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const focusData = user.focus_mode_data;
    const now = new Date();

    // Check cooldown period first
    if (focusData.cooldownEnd && new Date(focusData.cooldownEnd) > now) {
      const remainingCooldown = new Date(focusData.cooldownEnd) - now;
      return res.json({
        available: false,
        isActive: false,
        inCooldown: true,
        remainingTime: remainingCooldown
      });
    }

    // Clear expired cooldown
    if (focusData.cooldownEnd && new Date(focusData.cooldownEnd) <= now) {
      await User.update(
        {
          focus_mode_data: {
            ...focusData,
            cooldownEnd: null
          }
        },
        { where: { user_id: req.user.user_id } }
      );
    }

    // Check active session
    if (!focusData.lastSessionStart || !focusData.isActive) {
      return res.json({
        available: true,
        isActive: false,
        inCooldown: false,
        timeRemaining: 0
      });
    }

    const lastStart = new Date(focusData.lastSessionStart);
    const timeElapsed = now - lastStart;
    const remainingTime = Math.max(0, focusData.duration - timeElapsed);

    if (remainingTime === 0) {
      // Session ended - start cooldown period
      const cooldownEnd = new Date(now.getTime() + COOLDOWN_DURATION);
      
      await User.update(
        {
          focus_mode_data: {
            lastSessionStart: null,
            duration: null,
            isActive: false,
            cooldownEnd: cooldownEnd.toISOString()
          }
        },
        { where: { user_id: req.user.user_id } }
      );

      return res.json({
        available: false,
        isActive: false,
        inCooldown: true,
        remainingTime: COOLDOWN_DURATION
      });
    }

    res.json({
      available: false,
      isActive: true,
      inCooldown: false,
      timeRemaining: remainingTime,
      duration: focusData.duration
    });
  } catch (error) {
    console.error('Error getting focus mode status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// End focus mode session
wellnessRouter.post('/api/focus-mode/end', auth, authorizeRole(['student', 'course_rep']), async (req, res) => {
  try {
    const user = await User.findByPk(req.user.user_id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const cooldownEnd = new Date(Date.now() + COOLDOWN_DURATION);

    await User.update(
      {
        focus_mode_data: {
          lastSessionStart: null,
          duration: null,
          isActive: false,
          cooldownEnd: cooldownEnd.toISOString()
        }
      },
      { where: { user_id: req.user.user_id } }
    );

    res.json({
      success: true,
      message: 'Focus mode session ended',
      cooldownEnd: cooldownEnd.toISOString()
    });
  } catch (error) {
    console.error('Error ending focus mode:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
// Helper function to generate recommendations
function generateFeedback(answers) {
    const feedback = {
      wellnessAdvice: '',
      studyRecommendation: '',
      timeManagement: ''
    };
  
    // Sleep and energy level recommendations
    const sleepHours = answers[1]; // How many hours did you sleep
    const energyLevel = answers[2]; // How's your energy level
    
    if (energyLevel === "Tired" || energyLevel === "A bit low") {
     feedback.wellnessAdvice = sleepHours === "Less than 6"
        ? "Your tiredness might be due to lack of sleep. Try to get at least 7 hours tonight."
        : "Consider taking a short 15-minute power nap or a brief walk outside.";
    }
  
    // Screen time recommendations
    const screenTime = answers[3];
    if (screenTime === "6-8 hours" || screenTime === "8+ hours") {
     feedback.timeManagement = "High screen time detected. Try the 20-20-20 rule: Every 20 minutes, look at something 20 feet away for 20 seconds.";
    }
  
    // Learning focus recommendations
    const learningFocus = answers[4];
    switch (learningFocus) {
      case "Academic":
       feedback.studyRecommendation = "Try teaching this topic to someone else to reinforce your understanding.";
        break;
      case "Personal Skill":
     feedback.studyRecommendation = "Document your progress and set specific milestones for this skill.";
        break;
      case "New Hobby":
        feedback.studyRecommendation = "Consider joining a community or finding a mentor in this area.";
        break;
      case "Life Lesson":
        feedback.studyRecommendation = "Take a moment to journal about this experience.";
        break;
      default:
     feedback.studyRecommendation = "Set specific goals for what you want to learn next.";
    }
  
    return feedback;
  }
  
 wellnessRouter.post('/api/study-smart/check-in', auth, async (req, res) => {
    try {
      const { answers } = req.body;
      const user = await User.findByPk(req.user.user_id);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      const feedback = generateFeedback(answers);
  
      const studySmartData = {
        lastCheckIn: new Date().toISOString(),
        feedback,
        answers
      };
  
      await User.update(
        { study_smart_data: studySmartData },
        { where: { user_id: req.user.user_id } }
      );
  
      res.json({
        message: 'Check-in completed',
        feedback,
        nextAvailableIn: 24
      });
    } catch (error) {
      console.error('Error submitting study smart check-in:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  // Update status endpoint
 wellnessRouter.get('/api/study-smart/status', auth, async (req, res) => {
    try {
      const user = await User.findByPk(req.user.user_id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      const studyData = user.study_smart_data;
      if (!studyData.lastCheckIn) {
        return res.json({ 
          available: true,
          message: "Ready for your first check-in!"
        });
      }
  
      const lastCheckIn = new Date(studyData.lastCheckIn);
      const now = new Date();
      const hoursSinceCheckIn = (now - lastCheckIn) / (1000 * 60 * 60);
  
      if (hoursSinceCheckIn >= 24) {
        return res.json({ 
          available: true,
          message: "Ready for your daily check-in!",
          lastFeedback: studyData.feedback
        });
      }
  
      res.json({
        available: false,
        feedback: studyData.feedback,
        nextAvailableIn: Math.ceil(24 - hoursSinceCheckIn),
        message: `Next check-in available in ${Math.ceil(24 - hoursSinceCheckIn)} hours`
      });
    } catch (error) {
      console.error('Error getting study smart status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
module.exports = wellnessRouter;