const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
     user: 'aladesuyides@gmail.com', 
     pass: 'kugi fihw cugc trye'
  },
  tls: {
    rejectUnauthorized: false
  }
});

const sendVerificationEmail = async (email, verificationCode) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Verify Your Email',
    html: `
      <h1>Welcome to Our Platform!</h1>
      <p>Please verify your email address by entering the following code:</p>
      <h2 style="color: #4CAF50; font-size: 24px;">${verificationCode}</h2>
      <p>This code will expire in 30 minutes.</p>
      <p>If you didn't create an account, please ignore this email.</p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send verification email');
  }
};

module.exports = { sendVerificationEmail };