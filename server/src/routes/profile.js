import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate as auth, requireActive as active } from '../auth.js';

const router = Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const text = value => typeof value === 'string' ? value.trim() : '';

// GET / — fetch current user's full profile (user + role-specific profile)
router.get('/', auth, asyncRoute(async (req, res) => {
  const user = (await pool.query('SELECT id,name,email,role,status,created_at FROM users WHERE id=$1', [req.user.id])).rows[0];
  let extra = {};
  if (req.user.role === 'alumni') extra = (await pool.query('SELECT * FROM alumni_profiles WHERE user_id=$1', [req.user.id])).rows[0] || {};
  if (req.user.role === 'student') extra = (await pool.query('SELECT * FROM student_profiles WHERE user_id=$1', [req.user.id])).rows[0] || {};
  res.json({ ...extra, ...user, profile_id: extra.id ?? null, id: user.id });
}));

// PUT / — update profile fields (partial update supported)
router.put('/', auth, active, asyncRoute(async (req, res) => {
  const name = req.body.name === undefined ? null : text(req.body.name);
  if (name) await pool.query('UPDATE users SET name=$1 WHERE id=$2', [name, req.user.id]);
  const update = async (table, fields) => {
    const current = (await pool.query('SELECT * FROM ' + table + ' WHERE user_id=$1', [req.user.id])).rows[0];
    if (!current) return;
    const values = fields.map(([key, normalizer]) => req.body[key] === undefined ? current[key] : normalizer(req.body[key]));
    await pool.query('UPDATE ' + table + ' SET ' + fields.map(([key], i) => key + '=$' + (i + 1)).join(',') + ',updated_at=NOW() WHERE user_id=$' + (fields.length + 1), [...values, req.user.id]);
  };
  if (req.user.role === 'alumni') {
    await update('alumni_profiles', [
      ['graduation_year', v => Number(v) || 2024], ['department', text], ['degree', text], ['company', text], ['job_title', text], ['location', text], ['bio', text], ['skills', v => Array.isArray(v) ? v : []], ['linkedin_url', text], ['is_public', v => v !== false]
    ]);
  } else if (req.user.role === 'student') {
    await update('student_profiles', [
      ['student_id', text], ['department', text], ['degree', text], ['current_year', text], ['graduation_year', v => v ? Number(v) : null], ['skills', v => Array.isArray(v) ? v : []], ['interests', v => Array.isArray(v) ? v : []], ['career_interests', v => Array.isArray(v) ? v : []], ['bio', text]
    ]);
  }
  res.json({ message: 'Profile updated successfully.' });
}));

export default router;
