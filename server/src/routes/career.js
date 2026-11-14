import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate as auth, requireActive as active, allowRoles as roles } from '../auth.js';

const router = Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const text = value => typeof value === 'string' ? value.trim() : '';

// GET / — list alumni's career history entries
router.get('/', auth, roles('alumni'), asyncRoute(async (req, res) => {
  res.json((await pool.query(
    'SELECT * FROM career_history WHERE alumni_id=$1 ORDER BY start_date DESC NULLS LAST,id DESC',
    [req.user.id]
  )).rows);
}));

// GET /alumni/:alumniId — view an alumnus's career history (public/verified or admin)
router.get('/alumni/:alumniId', auth, asyncRoute(async (req, res) => {
  const alumniId = Number(req.params.alumniId);
  if (!Number.isInteger(alumniId)) return res.status(400).json({ message: 'Invalid alumni ID.' });
  const check = await pool.query(
    "SELECT p.is_public, p.is_verified, u.status FROM alumni_profiles p JOIN users u ON u.id=p.user_id WHERE u.id=$1",
    [alumniId]
  );
  if (!check.rows[0]) return res.status(404).json({ message: 'Alumnus not found.' });
  const allowed = req.user.role === 'admin' || req.user.id === alumniId || (check.rows[0].is_public && check.rows[0].is_verified && check.rows[0].status === 'active');
  if (!allowed) return res.status(403).json({ message: 'Career history is private.' });
  const result = await pool.query(
    'SELECT * FROM career_history WHERE alumni_id=$1 ORDER BY start_date DESC NULLS LAST,id DESC',
    [alumniId]
  );
  res.json(result.rows);
}));

// POST / — add a career history entry
router.post('/', auth, active, roles('alumni'), asyncRoute(async (req, res) => {
  const { company, job_title } = req.body;
  if (!text(company) || !text(job_title)) return res.status(400).json({ message: 'Company and job title are required.' });
  const result = await pool.query(
    'INSERT INTO career_history (alumni_id,company,job_title,employment_type,location,start_date,end_date,is_current,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [req.user.id, text(company), text(job_title), text(req.body.employment_type), text(req.body.location), req.body.start_date || null, req.body.is_current ? null : req.body.end_date || null, req.body.is_current === true, text(req.body.description)]
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /:id — update an existing career history entry
router.put('/:id', auth, active, roles('alumni'), asyncRoute(async (req, res) => {
  const { company, job_title } = req.body;
  if (!text(company) || !text(job_title)) return res.status(400).json({ message: 'Company and job title are required.' });
  const result = await pool.query(
    'UPDATE career_history SET company=$1, job_title=$2, employment_type=$3, location=$4, start_date=$5, end_date=$6, is_current=$7, description=$8 WHERE id=$9 AND alumni_id=$10 RETURNING *',
    [text(company), text(job_title), text(req.body.employment_type), text(req.body.location), req.body.start_date || null, req.body.is_current ? null : req.body.end_date || null, req.body.is_current === true, text(req.body.description), req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Career entry not found or unauthorized.' });
  res.json(result.rows[0]);
}));

// DELETE /:id — remove a career history entry
router.delete('/:id', auth, roles('alumni'), asyncRoute(async (req, res) => {
  const result = await pool.query(
    'DELETE FROM career_history WHERE id=$1 AND alumni_id=$2 RETURNING id',
    [req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Career entry not found.' });
  res.json({ message: 'Career entry deleted.' });
}));

export default router;
