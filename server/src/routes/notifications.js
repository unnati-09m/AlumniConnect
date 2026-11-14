import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate as auth } from '../auth.js';

const router = Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// GET / — fetch current user's notifications (most recent 50)
router.get('/', auth, asyncRoute(async (req, res) => {
  res.json((await pool.query(
    'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  )).rows);
}));

// PATCH /:id/read — mark a single notification as read
router.patch('/:id/read', auth, asyncRoute(async (req, res) => {
  const result = await pool.query(
    'UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2 RETURNING *',
    [req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Notification not found.' });
  res.json(result.rows[0]);
}));

export default router;
