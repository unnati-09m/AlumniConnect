import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate as auth, requireActive as active, allowRoles as roles } from '../auth.js';

const router = Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const text = value => typeof value === 'string' ? value.trim() : '';
const notify = async (userId, title, body) => {
  await pool.query('INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)', [userId, title, body]);
};

// GET / — list announcements (filtered by role for non-admins)
router.get('/', auth, asyncRoute(async (req, res) => {
  const audience = req.user.role === 'student' ? 'students' : 'alumni';
  const result = req.user.role === 'admin'
    ? await pool.query('SELECT a.*,u.name AS author FROM announcements a JOIN users u ON u.id=a.created_by ORDER BY a.created_at DESC LIMIT 50')
    : await pool.query("SELECT a.*,u.name AS author FROM announcements a JOIN users u ON u.id=a.created_by WHERE a.audience='all' OR a.audience=$1 ORDER BY a.created_at DESC LIMIT 50", [audience]);
  res.json(result.rows);
}));

// POST / — create a new announcement (admin only)
router.post('/', auth, active, roles('admin'), asyncRoute(async (req, res) => {
  const title = text(req.body.title), body = text(req.body.body);
  const audience = ['all', 'students', 'alumni'].includes(req.body.audience) ? req.body.audience : 'all';
  if (!title || !body) return res.status(400).json({ message: 'Announcement title and message are required.' });
  const result = await pool.query(
    'INSERT INTO announcements (created_by,title,body,audience) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.id, title, body, audience]
  );
  const targetRole = audience === 'all' ? null : audience === 'students' ? 'student' : 'alumni';
  const recipients = await pool.query(
    "SELECT id FROM users WHERE id<>$1 AND status='active' AND ($2::text IS NULL OR role=$2)",
    [req.user.id, targetRole]
  );
  for (const row of recipients.rows) await notify(row.id, 'Institution announcement', title);
  res.status(201).json(result.rows[0]);
}));

export default router;
