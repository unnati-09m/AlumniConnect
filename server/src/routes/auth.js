import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { authenticate as auth } from '../auth.js';

const router = Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const text = value => typeof value === 'string' ? value.trim() : '';
const issueToken = user => jwt.sign(
  { id: user.id, name: user.name, role: user.role, status: user.status },
  process.env.JWT_SECRET, { expiresIn: '12h' }
);
const notify = async (userId, title, body) => {
  await pool.query('INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)', [userId, title, body]);
};
const notifyAdmins = async (title, body) => {
  const admins = await pool.query("SELECT id FROM users WHERE role='admin' AND status='active'");
  for (const admin of admins.rows) await notify(admin.id, title, body);
};

// POST / — register a new student or alumni account
router.post('/', asyncRoute(async (req, res) => {
  const name = text(req.body.name);
  const email = text(req.body.email).toLowerCase();
  const password = req.body.password;
  const role = req.body.role || 'student';
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'Enter a valid name, email and password of at least 8 characters.' });
  }
  if (!['student', 'alumni'].includes(role)) {
    return res.status(400).json({ message: 'Public registration is available for students and alumni only. Admin accounts are provisioned by the institution.' });
  }
  const status = role === 'student' ? 'active' : 'pending';
  const hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query(
      'INSERT INTO users (name,email,password_hash,role,status) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,role,status',
      [name, email, hash, role, status]
    );
    const user = created.rows[0];
    if (role === 'student') {
      await client.query(
        'INSERT INTO student_profiles (user_id,student_id,department,degree,current_year,graduation_year,skills,interests,career_interests,bio) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [user.id, text(req.body.student_id), text(req.body.department), text(req.body.degree), text(req.body.current_year), req.body.graduation_year || null, Array.isArray(req.body.skills) ? req.body.skills : [], Array.isArray(req.body.interests) ? req.body.interests : [], Array.isArray(req.body.career_interests) ? req.body.career_interests : [], text(req.body.bio)]
      );
    } else if (role === 'alumni') {
      await client.query(
        'INSERT INTO alumni_profiles (user_id,graduation_year,department,degree,company,job_title,location,linkedin_url,is_verified) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE)',
        [user.id, Number(req.body.graduation_year) || new Date().getFullYear(), text(req.body.department) || 'Not specified', text(req.body.degree), text(req.body.company), text(req.body.job_title), text(req.body.location), text(req.body.linkedin_url)]
      );
    }
    await client.query('COMMIT');
    if (status === 'pending') await notifyAdmins('New account awaiting verification', name + ' registered as ' + role + '.');
    res.status(201).json({ token: issueToken(user), user, message: status === 'pending' ? 'Your account was created and is awaiting institution verification.' : 'Welcome to AlumniConnect.' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ message: 'An account with this email already exists.' });
    throw error;
  } finally { client.release(); }
}));

// POST /login — authenticate and return JWT
router.post('/login', asyncRoute(async (req, res) => {
  const email = text(req.body.email).toLowerCase();
  const result = await pool.query('SELECT id,name,email,password_hash,role,status FROM users WHERE LOWER(email)=$1', [email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(req.body.password || '', user.password_hash))) return res.status(401).json({ message: 'Email or password is incorrect.' });
  if (user.status === 'suspended') return res.status(403).json({ message: 'This account has been suspended. Contact your institution administrator.' });
  const safe = { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
  res.json({ token: issueToken(safe), user: safe });
}));

// GET /me — return current user (accessible to pending accounts)
router.get('/me', auth, asyncRoute(async (req, res) => {
  const result = await pool.query('SELECT id,name,email,role,status FROM users WHERE id=$1', [req.user.id]);
  if (!result.rows[0] || result.rows[0].status === 'suspended') return res.status(401).json({ message: 'Account is unavailable.' });
  res.json(result.rows[0]);
}));

export default router;
