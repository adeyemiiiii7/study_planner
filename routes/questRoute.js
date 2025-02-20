const express = require('express');
const questRouter = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/user');
const authorizeRole = require('../middleware/authorizeRole');
const { updateStreak } = require('../utils/updateStreak');

// Get user's quests
questRouter.get('/api/quests', auth, authorizeRole(['student', 'course_rep']), async (req, res) => {
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
    
    // Initialize empty quest status if it's a new day
    if (!user.last_quest_reset || user.last_quest_reset !== today) {
      await User.update(
        {
          daily_quest_status: { personalQuests: {} },
          last_quest_reset: today
        },
        {
          where: { user_id: user.user_id }
        }
      );
      
      user.daily_quest_status = { personalQuests: {} };
    }
    
    // Get today's quests
    const todayQuests = Object.entries(user.daily_quest_status.personalQuests || {})
      .filter(([_, quest]) => quest.created_at === today)
      .map(([id, quest]) => ({
        id,
        title: quest.title,
        description: quest.description,
        xp_reward: quest.xp_reward,
        completed: quest.completed,
        created_at: quest.created_at
      }));
    
    res.json({
      xp: user.xp,
      quests: todayQuests
    });
  } catch (error) {
    console.error('Error fetching quests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add new quest
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

    // Add new quest
    dailyQuestStatus.personalQuests[questId] = {
      title,
      description,
      completed: false,
      xp_reward: 50, // Default XP reward
      created_at: today
    };

    await User.update(
      { daily_quest_status: dailyQuestStatus },
      {
        where: { user_id: user.user_id }
      }
    );
    
    res.status(201).json({
      message: 'Quest added successfully',
      quest: {
        id: questId,
        title,
        description,
        xp_reward: 50,
        completed: false,
        created_at: today
      }
    });
  } catch (error) {
    console.error('Error adding quest:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Complete quest
questRouter.post('/api/quests/:questId/complete', auth, authorizeRole(['student', 'course_rep']), async (req, res) => {
  try {
    const { questId } = req.params;
    const user = await User.findByPk(req.user.user_id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const dailyQuestStatus = { ...user.daily_quest_status };
    const quest = dailyQuestStatus.personalQuests?.[questId];
    
    if (!quest) {
      return res.status(404).json({ error: 'Quest not found' });
    }
    
    if (quest.completed) {
      return res.status(400).json({ error: 'Quest already completed' });
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString()
      .split('T')[0];
    
    if (quest.created_at !== today) {
      return res.status(400).json({ error: 'Quest expired' });
    }

    // Complete the quest and award XP
    dailyQuestStatus.personalQuests[questId].completed = true;
    const newXp = user.xp + quest.xp_reward;

    await User.update(
      {
        daily_quest_status: dailyQuestStatus,
        xp: newXp
      },
      {
        where: { user_id: user.user_id }
      }
    );
    
    res.json({
      message: 'Quest completed successfully',
      xp: newXp,
      xp_gained: quest.xp_reward
    });
  } catch (error) {
    console.error('Error completing quest:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete quest
questRouter.delete('/api/quests/:questId', auth, authorizeRole(['student', 'course_rep']), async (req, res) => {
  try {
    const { questId } = req.params;
    const user = await User.findByPk(req.user.user_id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const dailyQuestStatus = { ...user.daily_quest_status };
    
    if (!dailyQuestStatus.personalQuests?.[questId]) {
      return res.status(404).json({ error: 'Quest not found' });
    }

    delete dailyQuestStatus.personalQuests[questId];

    await User.update(
      { daily_quest_status: dailyQuestStatus },
      {
        where: { user_id: user.user_id }
      }
    );
    
    res.json({
      message: 'Quest deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting quest:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = questRouter;