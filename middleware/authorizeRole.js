const auth = require('./auth');

const authorizeRole = (roles) => {
    return (req, res, next) => {
      auth(req, res, () => {
        const userRole = req.user.role;
        if (roles.includes(userRole)) {
          next();
        } else {
          res.status(403).json({ message: 'Forbidden' });
        }
      });
    };
  };
  
  module.exports = authorizeRole;