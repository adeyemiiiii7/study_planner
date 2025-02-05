const express = require('express');
const questRouter = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/user');
const authorizeRole = require('../middleware/authorizeRole');
const { updateStreak } = require('../utils/updateStreak');

const QUEST_REWARDS = {
    completedDailyStudySession: { xp: 40, title: 'Complete Your Study Daily Session' }
};


// Get all quests status (both system and personal)
questRouter.get('/api/quests/status', auth, authorizeRole(['student', 'course_rep']), async (req, res) => {
  try {
    const user = await User.findByPk(req.user.user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString()
      .split('T')[0];
    
    await updateStreak(req.user.user_id);
    
    // Initialize or reset quests if it's a new day
    if (!user.last_quest_reset || user.last_quest_reset !== today) {
      // Get user's hidden quests
      const PersonalQuests = user.personal_quests || [];
      
      // Filter out hidden quests from default quests
      const visibleDefaultQuests = Object.entries(QUEST_REWARDS)
        .filter(([questId]) => !PersonalQuests.includes(questId))
        .reduce((acc, [key, value]) => ({ ...acc, [key]: false }), {});

      // Reset quests for the new day
      const defaultStatus = {
        ...visibleDefaultQuests,
        personalQuests: {} // Reset personal quests
      };
      
      await User.update(
        {
          daily_quest_status: defaultStatus,
          last_quest_reset: today
        },
        {
          where: { user_id: user.user_id },
          returning: true
        }
      );
      
      user.daily_quest_status = defaultStatus;
    }
    
    res.json({
      xp: user.xp,
      questStatus: user.daily_quest_status,
      PersonalQuests: user.personal_quests || []
    });
  } catch (error) {
    console.error('Error fetching quest status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete quest (both default and personal)
questRouter.delete('/api/quests/:questId', auth, authorizeRole(['student', 'course_rep']), async (req, res) => {
  try {
    const { questId } = req.params;
    const user = await User.findByPk(req.user.user_id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const dailyQuestStatus = { ...user.daily_quest_status };
    const PersonalQuests = [...(user.personal_quests || [])];

    // Handle personal quest deletion
    if (dailyQuestStatus.personalQuests?.[questId]) {
      delete dailyQuestStatus.personalQuests[questId];
    } 
    // Handle default quest deletion
    else if (QUEST_REWARDS[questId]) {
      // Add to hidden quests if not already hidden
      if (!PersonalQuests.includes(questId)) {
       PersonalQuests.push(questId);
      }
      // Remove from daily quest status
      delete dailyQuestStatus[questId];
    } else {
      return res.status(404).json({ error: 'Quest not found' });
    }

    // Update user with the modified quest status and hidden quests
    const [updatedRows] = await User.update(
      { 
        daily_quest_status: dailyQuestStatus,
        personal_quests: PersonalQuests
      },
      {
        where: { user_id: user.user_id },
        returning: true
      }
    );

    if (updatedRows === 0) {
      throw new Error('Failed to update user quest status');
    }
    
    res.json({
      message: 'Quest deleted successfully',
      updatedQuestStatus: dailyQuestStatus,
      hiddenQuests
    });
  } catch (error) {
    console.error('Error deleting quest:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add personal quest
questRouter.post('/api/quests/add', auth, authorizeRole(['student', 'course_rep']), async (req, res) => {
  try {
    const { title, description } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const user = await User.findByPk(req.user.user_id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString()
      .split('T')[0];
    
    const questId = Date.now().toString();
    const dailyQuestStatus = { ...user.daily_quest_status };
    
    if (!dailyQuestStatus.personalQuests) {
      dailyQuestStatus.personalQuests = {};
    }

    // Add new personal quest
    dailyQuestStatus.personalQuests[questId] = {
      title,
      description,
      completed: false,
      xp_reward: 50,
      created_at: today
    };

    // Update the user with the new quest status
    const [updatedRows] = await User.update(
      { daily_quest_status: dailyQuestStatus },
      {
        where: { user_id: user.user_id },
        returning: true
      }
    );

    if (updatedRows === 0) {
      throw new Error('Failed to update user quest status');
    }
    
    res.status(200).json({
      message: 'Personal quest added successfully',
      quest: {
        id: questId,
        title,
        description,
        xp_reward: 50,
        created_at: today
      }
    });
  } catch (error) {
    console.error('Error adding personal quest:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});



// Complete quest (both system and personal)
questRouter.post('/api/quests/complete/:questId', auth, authorizeRole(['student', 'course_rep']), async (req, res) => {
  try {
    const { questId } = req.params;
    const user = await User.findByPk(req.user.user_id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString()
      .split('T')[0];
    
    // Update streak when completing a quest
    await updateStreak(req.user.user_id);
    
    const dailyQuestStatus = { ...user.daily_quest_status };
    let xpGained = 0;

    // Handle system quest completion
    if (QUEST_REWARDS[questId]) {
      if (dailyQuestStatus[questId]) {
        return res.status(400).json({ error: 'Quest already completed today' });
      }
      
      xpGained = QUEST_REWARDS[questId].xp;
      dailyQuestStatus[questId] = true;
    } 
    // Handle personal quest completion
    else {
      const personalQuest = dailyQuestStatus.personalQuests?.[questId];
      if (!personalQuest) {
        return res.status(404).json({ error: 'Personal quest not found' });
      }
      
      if (personalQuest.completed) {
        return res.status(400).json({ error: 'Personal quest already completed' });
      }
      
      if (personalQuest.created_at !== today) {
        return res.status(400).json({ error: 'Personal quest expired' });
      }
      
      xpGained = personalQuest.xp_reward;
      dailyQuestStatus.personalQuests[questId].completed = true;
    }
    
    // Update user with new XP and quest status
    const [updatedRows] = await User.update(
      {
        xp: user.xp + xpGained,
        daily_quest_status: dailyQuestStatus,
        last_quest_reset: today
      },
      {
        where: { user_id: user.user_id },
        returning: true
      }
    );

    if (updatedRows === 0) {
      throw new Error('Failed to update user quest status');
    }
    
    res.json({
      message: 'Quest completed successfully',
      xp: user.xp + xpGained,
      xpGained,
      questStatus: dailyQuestStatus
    });
  } catch (error) {
    console.error('Error completing quest:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = questRouter;