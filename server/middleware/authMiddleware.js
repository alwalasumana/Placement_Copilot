import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Verify JWT and attach req.user + req.sessionId (user._id as string).
 * All downstream controllers use req.sessionId instead of x-session-id header.
 */
export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Not authenticated. Please log in.' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
      }
      return res.status(401).json({ success: false, error: 'Invalid token. Please log in again.' });
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ success: false, error: 'User no longer exists.' });
    }

    req.user = user;
    req.sessionId = user._id.toString(); // used by all controllers instead of x-session-id
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    res.status(500).json({ success: false, error: 'Authentication error' });
  }
};
