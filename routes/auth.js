const { updateStreak } = require('../utils/updateStreak');
const express = require('express');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const authRouter = express.Router();
const validator = require('validator');
require('dotenv').config();
const{sendVerificationEmail} = require('../utils/emailService');

// Updated signup route in auth.js
authRouter.post('/api/users/signup', async (req, res) => {
    try {
        const { first_name, last_name, email, department, course_of_study, password, level, role } = req.body;
        const trimmedEmail = email.trim();
        console.log(`Received email: '${trimmedEmail}'`);

        // Validate email
        if (!validator.isEmail(trimmedEmail)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Ensure role is either "student" or "course_rep"
        if (role !== 'student' && role !== 'course_rep') {
            return res.status(400).json({ error: 'Invalid role. Role must be either "student" or "course_rep".' });
        }

        // Validate institutional email
        if (!trimmedEmail.endsWith('@student.babcock.edu.ng')) {
            return res.status(400).json({ error: 'Only @student.babcock.edu.ng emails are allowed' });
        }

        // Check if the user already exists
        const existingUser = await User.findOne({ where: { email: trimmedEmail } });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        const parsedLevel = parseInt(level, 10);
        if (isNaN(parsedLevel) || parsedLevel < 100 || parsedLevel > 600) {
            return res.status(400).json({ error: 'Invalid level. Must be an integer between 100 and 600.' });
        }

        // Generate verification code
        const verificationCode = Math.floor(10000 + Math.random() * 90000).toString();
        const verificationExpiry = new Date(Date.now() + 30 * 60 * 1000); 

        // Hash the password
        const hashedPassword = await bcryptjs.hash(password, 10);

        // Create the user
        const user = await User.create({
            first_name,
            last_name,
            email: trimmedEmail,
            department,
            course_of_study,
            password: hashedPassword,
            role,
            level: parsedLevel,
            verification_code: verificationCode,
            verification_code_expires_at: verificationExpiry,
            is_verified: false
        });

        // Send verification email
        await sendVerificationEmail(trimmedEmail, verificationCode);

        res.status(200).json({
            message: 'User created successfully. Please check your email for verification code.',
            user: {
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role: user.role,
                level: user.level,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

authRouter.post('/api/users/verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        const trimmedEmail = email.trim().toLowerCase();

        const user = await User.findOne({ where: { email: trimmedEmail } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.is_verified) {
            return res.status(400).json({ error: 'User is already verified' });
        }

        if (user.verification_code !== code) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        if (new Date() > new Date(user.verification_code_expires_at)) {
            return res.status(400).json({ error: 'Verification code has expired' });
        }

        // Update user verification status
        await user.update({
            is_verified: true,
            verification_code: null,
            verification_code_expires_at: null
        });

        res.status(200).json({
            message: 'Email verified successfully',
            user: {
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role: user.role,
                level: user.level,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update signin route to check verification
authRouter.post('/api/users/signin', async (req, res) => {
    try {
        const { email, password } = req.body;
        const trimmedEmail = email.trim().toLowerCase();

        const user = await User.findOne({ where: { email: trimmedEmail } });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!user.is_verified) {
            return res.status(401).json({ error: 'Please verify your email before signing in' });
        }

        const isPasswordValid = await bcryptjs.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        const token = jwt.sign(
            { id: user.user_id },
            process.env.JWT_SECRET || 'defaultSecret',
            { expiresIn: '1d' }
        );

        const updatedUser = await updateStreak(user.user_id);

        res.status(200).json({
            message: 'Sign-in successful',
            token,
            user: {
                id: updatedUser.user_id,
                first_name: updatedUser.first_name,
                last_name: updatedUser.last_name,
                email: updatedUser.email,
                department: updatedUser.department,
                course_of_study: updatedUser.course_of_study,
                role: updatedUser.role,
                current_streak: updatedUser.current_streak,
                highest_streak: updatedUser.highest_streak,
                total_active_days: updatedUser.total_active_days,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = authRouter;