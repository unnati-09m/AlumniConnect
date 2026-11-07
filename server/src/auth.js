import jwt from 'jsonwebtoken';
import { pool } from './db.js';

/**
 * authenticate — verifies the Bearer JWT, loads live status from the DB,
 * and blocks suspended accounts. Pending accounts are allowed through only
 * for GET /api/auth/me so the UI can display the pending state.
 */
export const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Please sign in first.' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    const account = await pool.query('SELECT status FROM users WHERE id=$1', [req.user.id]);
    if (!account.rows[0] || account.rows[0].status === 'suspended') {
      return res.status(401).json({ message: 'This account is no longer active. Please contact your institution.' });
    }
    req.user.status = account.rows[0].status;
    if (req.user.status === 'pending' && req.path !== '/api/auth/me') {
      return res.status(403).json({ message: 'Your account is awaiting institution verification.' });
    }
    next();
  } catch {
    return res.status(401).json({ message: 'Your session is invalid or has expired.' });
  }
};

/**
 * allowRoles — restricts a route to one or more user roles.
 * Must be used after authenticate.
 */
export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

/**
 * requireActive — rejects pending or suspended accounts.
 * Use after authenticate when pending users should not access a route.
 */
export function requireActive(req, res, next) {
  if (req.user?.status !== 'active') {
    return res.status(403).json({ message: 'Your account is awaiting verification or has been suspended.' });
  }
  next();
}

// Alias used internally for concise route declarations
export const authMiddleware = authenticate;
