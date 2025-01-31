const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
    user_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
    },
    first_name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    last_name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    department: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    course_of_study: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    role: {
        type: DataTypes.ENUM('student', 'course_rep'),
        allowNull: false,
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    level: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    verification_code: {
        type: DataTypes.STRING(5),
        allowNull: true,
    },
    is_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
    },
    verification_code_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    last_active_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },
    current_streak: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    highest_streak: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    total_active_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
}, {
    tableName: 'Users',
    timestamps: true,
});

module.exports = User;