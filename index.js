const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const sequelize = require('./config/database');
const authRouter = require('./routes/auth');
const courseRepRouter = require('./routes/course_representative');
const app = express();
app.use(express.json());
// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(authRouter);
app.use(courseRepRouter);



sequelize
  .sync({ alter: true }) 
  .then(() => {
    console.log('Database & tables created/updated!');
  })
  .catch(err => console.log('Error syncing database:', err));

 const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
  
