import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate as auth, requireActive as active, allowRoles as roles } from '../auth.js';

const router = Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const text = value => typeof value === 'string' ? value.trim() : '';
const notifyAdmins = async (title, body) => {
  const admins = await pool.query("SELECT id FROM users WHERE role='admin' AND status='active'");
  for (const admin of admins.rows) {
    await pool.query('INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)', [admin.id, title, body]);
  }
};

// POST / — alumni registers a donation pledge interest
router.post('/', auth, active, roles('alumni'), asyncRoute(async (req, res) => {
  const amount = Number(req.body.amount), purpose = text(req.body.purpose);
  if (!(amount > 0) || !purpose) return res.status(400).json({ message: 'Enter a positive amount and a purpose.' });
  const result = await pool.query(
    'INSERT INTO donation_pledges (alumni_id,amount,purpose,note) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.id, amount, purpose, text(req.body.note)]
  );
  await notifyAdmins('New donation pledge interest', 'An alumnus recorded a pledge interest of ₹' + amount + '.');
  res.status(201).json(result.rows[0]);
}));

// GET / — list all donation pledges (admin only)
router.get('/', auth, roles('admin'), asyncRoute(async (_req, res) => {
  res.json((await pool.query(
    'SELECT d.*,u.name AS alumni_name,u.email FROM donation_pledges d JOIN users u ON u.id=d.alumni_id ORDER BY d.created_at DESC'
  )).rows);
}));

// PATCH /:id — update pledge status (admin only)
router.patch('/:id', auth, active, roles('admin'), asyncRoute(async (req, res) => {
  if (!['contacted', 'fulfilled', 'withdrawn', 'interested'].includes(req.body.status)) {
    return res.status(400).json({ message: 'Invalid pledge status.' });
  }
  const result = await pool.query(
    'UPDATE donation_pledges SET status=$1 WHERE id=$2 RETURNING *',
    [req.body.status, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Pledge not found.' });
  res.json(result.rows[0]);
}));

export default router;
