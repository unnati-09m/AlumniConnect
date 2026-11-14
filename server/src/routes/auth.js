import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { authenticate as auth } from '../auth.js';

const router = Router();

// Simple helper to catch async errors and pass them to Express error handler
const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

// Simple helper to clean text input (trim spaces)
const cleanText = (value) => {
  return typeof value === 'string' ? value.trim() : '';
};

// Generate a JSON Web Token (JWT) with user id, name, role and status
const issueToken = (user) => {
  return jwt.sign(
    { id: user.id, name: user.name, role: user.role, status: user.status },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
};

// Send an in-app notification to a user
const notify = async (userId, title, body) => {
  await pool.query(
    'INSERT INTO notifications (user_id, title, body) VALUES ($1, $2, $3)',
    [userId, title, body]
  );
};

// Send notification to all active institution administrators
const notifyAdmins = async (title, body) => {
  const admins = await pool.query("SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
  for (const admin of admins.rows) {
    await notify(admin.id, title, body);
  }
};

/**
 * Registration Handler
 * Handles both /api/auth/register (canonical) and /api/auth (alias)
 */
const registerHandler = asyncRoute(async (req, res) => {
  const name = cleanText(req.body.name);
  const email = cleanText(req.body.email).toLowerCase();
  const password = req.body.password;
  const role = req.body.role || 'student';

  // 1. Validate common fields
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name || !email || !emailRegex.test(email) || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'Enter a valid name, email and password of at least 8 characters.' });
  }

  // 2. Validate role: only student and alumni can register publicly
  if (!['student', 'alumni'].includes(role)) {
    return res.status(400).json({
      message: 'Public registration is available for students and alumni only. Admin accounts are provisioned by the institution.'
    });
  }

  // 3. Validate student-specific academic fields
  if (role === 'student') {
    const studentId = cleanText(req.body.student_id);
    const department = cleanText(req.body.department);
    const degree = cleanText(req.body.degree);
    const currentYear = cleanText(req.body.current_year);
    if (!studentId || !department || !degree || !currentYear) {
      return res.status(400).json({
        message: 'Student ID, department, degree and current academic year are required for student registration.'
      });
    }
  }

  // 4. Validate alumni-specific fields
  if (role === 'alumni') {
    const department = cleanText(req.body.department);
    const graduationYear = req.body.graduation_year;
    if (!department || !graduationYear) {
      return res.status(400).json({
        message: 'Department and graduation year are required for alumni registration.'
      });
    }
  }

  // 5. Determine initial status: student is active immediately; alumni requires admin verification
  const status = role === 'student' ? 'active' : 'pending';

  // 6. Hash password with bcrypt (12 salt rounds)
  const passwordHash = await bcrypt.hash(password, 12);

  // 7. Insert user and role profile inside a database transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert user record
    const insertUserResult = await client.query(
      'INSERT INTO users (name, email, password_hash, role, status) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, status',
      [name, email, passwordHash, role, status]
    );
    const newUser = insertUserResult.rows[0];

    if (role === 'student') {
      // Helper for comma-separated skills/interests
      const parseList = (val) => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string' && val.trim()) {
          return val.split(',').map((item) => item.trim()).filter(Boolean);
        }
        return [];
      };

      await client.query(
        'INSERT INTO student_profiles (user_id, student_id, department, degree, current_year, graduation_year, skills, interests, career_interests, bio) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [
          newUser.id,
          cleanText(req.body.student_id),
          cleanText(req.body.department),
          cleanText(req.body.degree),
          cleanText(req.body.current_year),
          req.body.graduation_year ? Number(req.body.graduation_year) : null,
          parseList(req.body.skills),
          parseList(req.body.interests),
          parseList(req.body.career_interests),
          cleanText(req.body.bio)
        ]
      );
    } else if (role === 'alumni') {
      await client.query(
        'INSERT INTO alumni_profiles (user_id, graduation_year, department, degree, company, job_title, location, linkedin_url, is_verified) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)',
        [
          newUser.id,
          Number(req.body.graduation_year) || new Date().getFullYear(),
          cleanText(req.body.department) || 'Not specified',
          cleanText(req.body.degree),
          cleanText(req.body.company),
          cleanText(req.body.job_title),
          cleanText(req.body.location),
          cleanText(req.body.linkedin_url)
        ]
      );
    }

    await client.query('COMMIT');

    // Notify admins if a pending alumni registered
    if (status === 'pending') {
      await notifyAdmins('New account awaiting verification', `${name} registered as ${role}.`);
    }

    res.status(201).json({
      token: issueToken(newUser),
      user: newUser,
      message: status === 'pending'
        ? 'Your account was created and is awaiting institution verification.'
        : 'Welcome to AlumniConnect.'
    });
  } catch (error) {
    await client.query('ROLLBACK');

    // PostgreSQL error code 23505 = unique constraint violation (duplicate email)
    if (error.code === '23505') {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    throw error;
  } finally {
    client.release();
  }
});

// Canonical registration endpoint: POST /register
router.post('/register', registerHandler);
// Backward-compatible alias: POST /
router.post('/', registerHandler);

/**
 * POST /login
 * Authenticates user with email and password, returning a JWT token
 */
router.post('/login', asyncRoute(async (req, res) => {
  const email = cleanText(req.body.email).toLowerCase();
  const password = req.body.password || '';

  // Case-insensitive query to find user by email
  const result = await pool.query(
    'SELECT id,name,email,password_hash,role,status FROM users WHERE LOWER(email)=$1',
    [email]
  );
  const user = result.rows[0];

  // Compare entered password with stored bcrypt hash
  const passwordsMatch = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !passwordsMatch) {
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  }

  // Block suspended accounts
  if (user.status === 'suspended') {
    return res.status(403).json({ message: 'This account has been suspended. Contact your institution administrator.' });
  }

  // Create safe user object (excluding password hash)
  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
  res.json({ token: issueToken(safeUser), user: safeUser });
}));

/**
 * GET /me
 * Returns the currently authenticated user's session data
 */
router.get('/me', auth, asyncRoute(async (req, res) => {
  const result = await pool.query('SELECT id,name,email,role,status FROM users WHERE id=$1', [req.user.id]);
  const user = result.rows[0];

  if (!user || user.status === 'suspended') {
    return res.status(401).json({ message: 'Account is unavailable.' });
  }

  res.json(user);
}));

export default router;
