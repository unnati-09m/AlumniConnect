import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate as auth, requireActive as active, allowRoles as roles } from '../auth.js';

const router = Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const text = value => typeof value === 'string' ? value.trim() : '';
const notify = async (userId, title, body) => {
  await pool.query('INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)', [userId, title, body]);
};

// POST / — student submits a mentorship request to an alumnus
router.post('/', auth, active, roles('student'), asyncRoute(async (req, res) => {
  const alumniId = Number(req.body.alumni_id), topic = text(req.body.topic);
  if (!alumniId || !topic) return res.status(400).json({ message: 'Select an alumnus and enter a mentorship topic.' });
  const mentor = await pool.query(
    "SELECT u.id FROM users u JOIN alumni_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.role='alumni' AND u.status='active' AND p.is_verified=TRUE AND p.is_public=TRUE",
    [alumniId]
  );
  if (!mentor.rows[0]) return res.status(404).json({ message: 'This alumnus is not available for mentorship.' });
  const result = await pool.query(
    'INSERT INTO mentorship_requests (student_id,alumni_id,topic,message) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.user.id, alumniId, topic, text(req.body.message)]
  );
  await notify(alumniId, 'New mentorship request', req.user.name + ' requested guidance about ' + topic + '.');
  res.status(201).json(result.rows[0]);
}));

// GET / — list mentorship requests (filtered by role)
router.get('/', auth, asyncRoute(async (req, res) => {
  let where = 'WHERE m.student_id=$1', values = [req.user.id];
  if (req.user.role === 'alumni') where = 'WHERE m.alumni_id=$1';
  else if (req.user.role === 'admin') { where = 'WHERE TRUE'; values = []; }
  const result = await pool.query(
    'SELECT m.*,s.name AS student_name,s.email AS student_email,a.name AS alumni_name FROM mentorship_requests m JOIN users s ON s.id=m.student_id JOIN users a ON a.id=m.alumni_id ' + where + ' ORDER BY m.created_at DESC LIMIT 200',
    values
  );
  res.json(result.rows);
}));

// PATCH /:id — alumni updates the status of a mentorship request
router.patch('/:id', auth, active, roles('alumni'), asyncRoute(async (req, res) => {
  const status = req.body.status;
  if (!['accepted', 'declined', 'completed'].includes(status)) return res.status(400).json({ message: 'Invalid mentorship status.' });
  const result = await pool.query(
    "UPDATE mentorship_requests SET status=$1,updated_at=NOW() WHERE id=$2 AND alumni_id=$3 AND status IN ('pending','accepted') RETURNING *",
    [status, req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Mentorship request not found or already closed.' });
  await notify(result.rows[0].student_id, 'Mentorship update', 'Your request was ' + status + '.');
  res.json(result.rows[0]);
}));

export default router;
