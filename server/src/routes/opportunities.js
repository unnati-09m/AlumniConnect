import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate as auth, requireActive as active, allowRoles as roles } from '../auth.js';

const router = Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const text = value => typeof value === 'string' ? value.trim() : '';
const notify = async (userId, title, body) => {
  await pool.query('INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)', [userId, title, body]);
};

// GET / — list opportunities (active only for non-admins) with search and filters
router.get('/', auth, asyncRoute(async (req, res) => {
  const searchQuery = text(req.query.search);
  const typeFilter = text(req.query.type);
  const locationFilter = text(req.query.location);

  const values = [req.user.role];
  let where = "(o.is_active=TRUE OR $1='admin') AND (o.apply_by IS NULL OR o.apply_by>=CURRENT_DATE OR $1='admin')";

  if (searchQuery) {
    values.push('%' + searchQuery + '%');
    const idx = values.length;
    where += ' AND (o.title ILIKE $' + idx + ' OR o.company ILIKE $' + idx + ' OR o.description ILIKE $' + idx + ')';
  }
  if (typeFilter && ['internship', 'job', 'project'].includes(typeFilter)) {
    values.push(typeFilter);
    where += ' AND o.type=$' + values.length;
  }
  if (locationFilter) {
    values.push('%' + locationFilter + '%');
    where += ' AND o.location ILIKE $' + values.length;
  }

  const result = await pool.query(
    'SELECT o.*,u.name AS posted_by,u.role AS poster_role FROM opportunities o LEFT JOIN users u ON u.id=COALESCE(o.created_by,o.alumni_id) WHERE ' + where + ' ORDER BY o.created_at DESC LIMIT 200',
    values
  );
  res.json(result.rows);
}));

// POST / — create a new opportunity (alumni or admin only)
router.post('/', auth, active, roles('alumni', 'admin'), asyncRoute(async (req, res) => {
  const title = text(req.body.title), company = text(req.body.company), description = text(req.body.description);
  const type = ['internship', 'job', 'project'].includes(req.body.type) ? req.body.type : 'internship';
  if (!title || !company || !description) return res.status(400).json({ message: 'Title, company and description are required.' });
  const result = await pool.query(
    'INSERT INTO opportunities (alumni_id,created_by,title,company,description,type,location,apply_by,application_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [req.user.role === 'alumni' ? req.user.id : null, req.user.id, title, company, description, type, text(req.body.location) || 'Remote', req.body.apply_by || null, text(req.body.application_url)]
  );
  const recipients = await pool.query("SELECT id FROM users WHERE role='student' AND status='active'");
  for (const row of recipients.rows) await notify(row.id, 'New opportunity', title + ' at ' + company + ' has been posted.');
  res.status(201).json(result.rows[0]);
}));

// PATCH /:id — edit an existing opportunity (owner or admin)
router.patch('/:id', auth, active, roles('alumni', 'admin'), asyncRoute(async (req, res) => {
  const opp = (await pool.query('SELECT * FROM opportunities WHERE id=$1', [req.params.id])).rows[0];
  if (!opp) return res.status(404).json({ message: 'Opportunity not found.' });
  const isOwner = req.user.role === 'admin' || opp.created_by === req.user.id || opp.alumni_id === req.user.id;
  if (!isOwner) return res.status(403).json({ message: 'You do not have permission to edit this opportunity.' });

  const title = req.body.title === undefined ? opp.title : text(req.body.title);
  const company = req.body.company === undefined ? opp.company : text(req.body.company);
  const description = req.body.description === undefined ? opp.description : text(req.body.description);
  const type = req.body.type === undefined ? opp.type : req.body.type;
  const location = req.body.location === undefined ? opp.location : text(req.body.location);
  const apply_by = req.body.apply_by === undefined ? opp.apply_by : (req.body.apply_by || null);
  const application_url = req.body.application_url === undefined ? opp.application_url : text(req.body.application_url);
  const is_active = req.body.is_active === undefined ? opp.is_active : Boolean(req.body.is_active);

  if (!title || !company || !description) return res.status(400).json({ message: 'Title, company and description cannot be empty.' });

  const result = await pool.query(
    'UPDATE opportunities SET title=$1, company=$2, description=$3, type=$4, location=$5, apply_by=$6, application_url=$7, is_active=$8 WHERE id=$9 RETURNING *',
    [title, company, description, type, location, apply_by, application_url, is_active, req.params.id]
  );
  res.json(result.rows[0]);
}));

// DELETE /:id — delete/remove an opportunity (owner or admin)
router.delete('/:id', auth, active, roles('alumni', 'admin'), asyncRoute(async (req, res) => {
  const opp = (await pool.query('SELECT * FROM opportunities WHERE id=$1', [req.params.id])).rows[0];
  if (!opp) return res.status(404).json({ message: 'Opportunity not found.' });
  const isOwner = req.user.role === 'admin' || opp.created_by === req.user.id || opp.alumni_id === req.user.id;
  if (!isOwner) return res.status(403).json({ message: 'You do not have permission to delete this opportunity.' });

  await pool.query('DELETE FROM opportunities WHERE id=$1', [req.params.id]);
  res.json({ message: 'Opportunity deleted successfully.' });
}));

// POST /:id/apply — student applies for an opportunity
router.post('/:id/apply', auth, active, roles('student'), asyncRoute(async (req, res) => {
  const opportunity = await pool.query('SELECT id,created_by,alumni_id,title FROM opportunities WHERE id=$1 AND is_active=TRUE AND (apply_by IS NULL OR apply_by>=CURRENT_DATE)', [req.params.id]);
  if (!opportunity.rows[0]) return res.status(404).json({ message: 'Opportunity is unavailable or its deadline has passed.' });
  const result = await pool.query(
    'INSERT INTO opportunity_applications (opportunity_id,student_id,note,resume_url) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.params.id, req.user.id, text(req.body.note), text(req.body.resume_url)]
  );
  const owner = opportunity.rows[0].created_by || opportunity.rows[0].alumni_id;
  if (owner) await notify(owner, 'New opportunity application', req.user.name + ' applied for ' + opportunity.rows[0].title + '.');
  res.status(201).json(result.rows[0]);
}));

// GET /my-applications — student's own applications
router.get('/my-applications', auth, roles('student'), asyncRoute(async (req, res) => {
  res.json((await pool.query('SELECT a.*,o.title,o.company,o.location,o.apply_by FROM opportunity_applications a JOIN opportunities o ON o.id=a.opportunity_id WHERE a.student_id=$1 ORDER BY a.created_at DESC', [req.user.id])).rows);
}));

// GET /managed-applications — alumni/admin view applications for their postings
router.get('/managed-applications', auth, roles('alumni', 'admin'), asyncRoute(async (req, res) => {
  let where = 'TRUE', values = [];
  if (req.user.role !== 'admin') { where = 'COALESCE(o.created_by,o.alumni_id)=$1'; values = [req.user.id]; }
  const result = await pool.query(
    'SELECT a.id,a.status,a.note,a.resume_url,a.created_at,u.name AS student_name,u.email AS student_email,p.department,p.degree,p.current_year,o.title AS opportunity_title,o.company FROM opportunity_applications a JOIN opportunities o ON o.id=a.opportunity_id JOIN users u ON u.id=a.student_id LEFT JOIN student_profiles p ON p.user_id=u.id WHERE ' + where + ' ORDER BY a.created_at DESC LIMIT 300',
    values
  );
  res.json(result.rows);
}));

// PATCH /applications/:id/status — update application status
router.patch('/applications/:id/status', auth, active, roles('alumni', 'admin'), asyncRoute(async (req, res) => {
  if (!['reviewing', 'shortlisted', 'rejected', 'hired'].includes(req.body.status)) return res.status(400).json({ message: 'Invalid application status.' });
  const result = await pool.query(
    "UPDATE opportunity_applications a SET status=$1,updated_at=NOW() FROM opportunities o WHERE a.id=$2 AND o.id=a.opportunity_id AND ($4='admin' OR COALESCE(o.created_by,o.alumni_id)=$3) RETURNING a.*",
    [req.body.status, req.params.id, req.user.id, req.user.role]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Application not found or not managed by your account.' });
  await notify(result.rows[0].student_id, 'Application status updated', 'Your application status is now ' + req.body.status + '.');
  res.json(result.rows[0]);
}));

export default router;
