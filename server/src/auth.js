import jwt from 'jsonwebtoken';
import { pool } from './db.js';

/**
 * Middleware: authenticate
 * 1. Reads the Bearer JWT token from the Authorization request header.
 * 2. Verifies the token using the secret key (JWT_SECRET).
 * 3. Checks the user's live status in PostgreSQL:
 *    - 'active': Allowed to access protected routes.
 *    - 'suspended': Blocked immediately with HTTP 401.
 *    - 'pending': Allowed ONLY for GET /api/auth/me so the frontend can show the pending verification page.
 */
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ message: 'Please sign in first.' });
  }

  try {
    // Decode and verify JWT
    const decodedUser = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decodedUser;

    // Check account status in the database
    const dbResult = await pool.query('SELECT status FROM users WHERE id=$1', [decodedUser.id]);
    const account = dbResult.rows[0];

    if (!account || account.status === 'suspended') {
      return res.status(401).json({ message: 'This account is no longer active. Please contact your institution.' });
    }

    req.user.status = account.status;

    // Check if the current request is the /me endpoint
    const isMeEndpoint = req.originalUrl?.split('?')[0] === '/api/auth/me' || req.path === '/me' || req.path === '/api/auth/me';

    // Pending users can only check their own status on /api/auth/me
    if (req.user.status === 'pending' && !isMeEndpoint) {
      return res.status(403).json({ message: 'Your account is awaiting institution verification.' });
    }

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Your session is invalid or has expired.' });
  }
};

/**
 * Middleware: allowRoles
 * Restricts an API route to specific roles (e.g. allowRoles('admin'), allowRoles('alumni', 'admin')).
 */
export function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

/**
 * Middleware: requireActive
 * Ensures the user's account is verified and active (not pending and not suspended).
 */
export function requireActive(req, res, next) {
  if (req.user?.status !== 'active') {
    return res.status(403).json({ message: 'Your account is awaiting verification or has been suspended.' });
  }
  next();
}

// Alias for convenience
export const authMiddleware = authenticate;
