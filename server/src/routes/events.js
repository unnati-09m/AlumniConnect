import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate as auth, requireActive as active, allowRoles as roles } from '../auth.js';

const router = Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const text = value => typeof value === 'string' ? value.trim() : '';
const notify = async (userId, title, body) => {
  await pool.query('INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)', [userId, title, body]);
};

// GET / — list all events with attendee count and registration status
router.get('/', auth, asyncRoute(async (req, res) => {
  const result = await pool.query(
    'SELECT e.*,u.name AS created_by_name,(SELECT COUNT(*)::int FROM event_registrations r WHERE r.event_id=e.id) AS attendee_count,EXISTS(SELECT 1 FROM event_registrations r WHERE r.event_id=e.id AND r.user_id=$1) AS registered FROM events e JOIN users u ON u.id=e.created_by ORDER BY e.starts_at LIMIT 200',
    [req.user.id]
  );
  res.json(result.rows);
}));

// POST / — create a new event (admin or alumni)
router.post('/', auth, active, roles('admin', 'alumni'), asyncRoute(async (req, res) => {
  const title = text(req.body.title), starts = req.body.starts_at;
  if (!title || !starts || Number.isNaN(Date.parse(starts)) || Date.parse(starts) <= Date.now()) {
    return res.status(400).json({ message: 'Enter an event title and a future date.' });
  }
  const result = await pool.query(
    'INSERT INTO events (created_by,title,description,venue,starts_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.user.id, title, text(req.body.description), text(req.body.venue) || 'Campus', new Date(starts).toISOString()]
  );
  const recipients = await pool.query("SELECT id FROM users WHERE id<>$1 AND status='active'", [req.user.id]);
  for (const row of recipients.rows) await notify(row.id, 'New community event', title + ' has been scheduled.');
  res.status(201).json(result.rows[0]);
}));

// POST /:id/register — register current user for an event
router.post('/:id/register', auth, active, roles('student', 'alumni'), asyncRoute(async (req, res) => {
  const event = await pool.query('SELECT id,title,created_by FROM events WHERE id=$1 AND starts_at>NOW()', [req.params.id]);
  if (!event.rows[0]) return res.status(404).json({ message: 'Event not found or registration has closed.' });
  const result = await pool.query(
    'INSERT INTO event_registrations (event_id,user_id) VALUES ($1,$2) RETURNING *',
    [req.params.id, req.user.id]
  );
  if (Number(event.rows[0].created_by) !== Number(req.user.id)) {
    await notify(event.rows[0].created_by, 'New event registration', req.user.name + ' registered for ' + event.rows[0].title + '.');
  }
  res.status(201).json(result.rows[0]);
}));

export default router;
