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
