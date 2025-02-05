const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const sequelize = require('./config/database');
const authRouter = require('./routes/auth');
const courseRepRouter = require('./routes/course_representative');
const {studentRouter} = require('./routes/student');

// Import the initialization function
const { initializeScheduleNotifications } = require('./routes/student');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

// Routes
app.use(authRouter);
app.use(courseRepRouter);
app.use(studentRouter);

// Database initialization
sequelize
  .sync({ alter: true })
  .then(() => {
    console.log('Database & tables created/updated!');
  })
  .catch(err => console.log('Error syncing database:', err));

const PORT = process.env.PORT || 4000;

// Start server and initialize notifications
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  
  // Initialize schedule notifications after server starts
  try {
    initializeScheduleNotifications();
    console.log('Schedule notifications initialized successfully');
  } catch (error) {
    console.error('Failed to initialize schedule notifications:', error);
  }
});