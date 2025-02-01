const jwt = require('jsonwebtoken');
const User = require('../models/user');
require('dotenv').config();

// Constants for error messages and status codes
const AUTH_ERRORS = {
  HEADER_MISSING: 'Authorization header is required',
  INVALID_FORMAT: 'Invalid authorization format. Format should be: Bearer [token]',
  TOKEN_MISSING: 'Access token is required',
  TOKEN_INVALID: 'Invalid or expired access token',
  USER_NOT_FOUND: 'User not found',
  INVALID_TOKEN_PAYLOAD: 'Invalid token: missing user ID',
  SERVER_ERROR: 'Internal server error occurred'
};

const STATUS_CODES = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  SERVER_ERROR: 500
};

/**
 * Authentication middleware to verify JWT tokens and attach user to request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const auth = async (req, res, next) => {
  try {
    // Extract and validate authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(STATUS_CODES.UNAUTHORIZED)
        .json({ message: AUTH_ERRORS.HEADER_MISSING });
    }

    // Validate Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(STATUS_CODES.UNAUTHORIZED)
        .json({ message: AUTH_ERRORS.INVALID_FORMAT });
    }

    // Extract token
    const [, token] = authHeader.split(' ');
    if (!token) {
      return res.status(STATUS_CODES.UNAUTHORIZED)
        .json({ message: AUTH_ERRORS.TOKEN_MISSING });
    }

    try {
      // Verify JWT token
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
      
      // Validate token payload
      if (!decodedToken.id) {
        return res.status(STATUS_CODES.UNAUTHORIZED)
          .json({ message: AUTH_ERRORS.INVALID_TOKEN_PAYLOAD });
      }

      // Find user in database
      const user = await User.findOne({ 
        where: { user_id: decodedToken.id },
        attributes: { exclude: ['password'] } // Exclude sensitive data
      });

      if (!user) {
        return res.status(STATUS_CODES.NOT_FOUND)
          .json({ message: AUTH_ERRORS.USER_NOT_FOUND });
      }

      // Attach user to request object
      req.user = user;
      next();

    } catch (jwtError) {
      console.error('JWT Verification Error:', {
        error: jwtError.message,
        stack: jwtError.stack,
        token: token.substring(0, 10) + '...' // Log partial token for debugging
      });

      return res.status(STATUS_CODES.UNAUTHORIZED)
        .json({ 
          message: AUTH_ERRORS.TOKEN_INVALID,
          error: process.env.NODE_ENV === 'development' ? jwtError.message : undefined
        });
    }

  } catch (error) {
    console.error('Authentication Middleware Error:', {
      error: error.message,
      stack: error.stack
    });

    return res.status(STATUS_CODES.SERVER_ERROR)
      .json({ 
        message: AUTH_ERRORS.SERVER_ERROR,
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
  }
};

module.exports = auth;