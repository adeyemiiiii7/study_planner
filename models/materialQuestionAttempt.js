const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MaterialQuestionAttempt = sequelize.define('MaterialQuestionAttempt', {
  attempt_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  user_id: {
    type: DataTypes.UUID,
    references: {
      model: 'Users',
      key: 'user_id'
    },
    allowNull: false
  },
  material_id: {
    type: DataTypes.UUID,
    references: {
      model: 'CourseMaterials',
      key: 'material_id'
    },
    allowNull: false
  },
  classroom_id: {
    type: DataTypes.UUID,
    references: {
      model: 'Classrooms',
      key: 'classroom_id'
    },
    allowNull: false
  },
  course_section_id: {
    type: DataTypes.UUID,
    references: {
      model: 'CourseSections',
      key: 'course_section_id'
    },
    allowNull: false
  },
  questions_attempted: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  score: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  completed_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
});

// Class methods for progress tracking
MaterialQuestionAttempt.getLastAttempts = async function(userId, materialId, limit = 5) {
  return await this.findAll({
    where: {
      user_id: userId,
      material_id: materialId
    },
    order: [['completed_at', 'DESC']],
    limit: limit
  });
};

// Get performance analysis
MaterialQuestionAttempt.getPerformanceAnalysis = async function(userId, materialId) {
  const attempts = await this.getLastAttempts(userId, materialId);
  
  if (attempts.length === 0) {
    return {
      attempts: [],
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
      improvementNeeded: true,
      message: "No attempts recorded yet. Try taking the quiz to track your progress."
    };
  }
  
  const scores = attempts.map(attempt => attempt.score);
  const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const latestScore = scores[0];
  
  return {
    attempts: attempts,
    averageScore: averageScore,
    highestScore: Math.max(...scores),
    lowestScore: Math.min(...scores),
    improvementNeeded: latestScore < 60,
    message: latestScore < 60 
      ? "Your latest score is below 60%. Focus on reviewing the course material before trying again."
      : latestScore >= 80
        ? "Great job! You're showing strong understanding of this material."
        : "You're making progress. Continue reviewing the challenging topics to improve your score."
  };
};

module.exports = MaterialQuestionAttempt;