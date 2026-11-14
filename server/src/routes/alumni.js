import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate as auth, allowRoles as roles } from '../auth.js';

const router = Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const text = value => typeof value === 'string' ? value.trim() : '';
const safeCsv = value => {
  let output = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(output)) output = "'" + output;
  return '"' + output.replaceAll('"', '""') + '"';
};

// GET /export/csv — export verified alumni directory to CSV (admin only)
router.get('/export/csv', auth, roles('admin'), asyncRoute(async (_req, res) => {
  const rows = (await pool.query(
    'SELECT u.name,u.email,p.graduation_year,p.department,p.degree,p.company,p.job_title,p.location,p.is_verified FROM users u JOIN alumni_profiles p ON p.user_id=u.id ORDER BY p.graduation_year DESC,u.name'
  )).rows;
  const headers = ['Name', 'Email', 'Graduation Year', 'Department', 'Degree', 'Company', 'Job Title', 'Location', 'Verified'];
  const csv = [
    headers.map(safeCsv).join(','),
    ...rows.map(row => Object.values(row).map(safeCsv).join(','))
  ].join('\r\n');
  res.type('text/csv').attachment('alumni-directory.csv').send(csv);
}));

// GET / — alumni directory with optional search/filter
router.get('/', auth, asyncRoute(async (req, res) => {
  const filters = {
    search: text(req.query.search),
    department: text(req.query.department),
    company: text(req.query.company),
    year: text(req.query.year)
  };
  const values = [];
  let where = req.user.role === 'admin'
    ? 'WHERE TRUE'
    : "WHERE p.is_public=TRUE AND p.is_verified=TRUE AND u.status='active'";
  if (filters.search) {
    values.push('%' + filters.search + '%');
    const n = values.length;
    where += ' AND (u.name ILIKE $' + n + ' OR p.company ILIKE $' + n + ' OR p.job_title ILIKE $' + n + ' OR p.department ILIKE $' + n + ')';
  }
  if (filters.department && filters.department !== 'all') { values.push(filters.department); where += ' AND p.department=$' + values.length; }
  if (filters.company) { values.push('%' + filters.company + '%'); where += ' AND p.company ILIKE $' + values.length; }
  if (filters.year && Number.isInteger(Number(filters.year))) { values.push(Number(filters.year)); where += ' AND p.graduation_year=$' + values.length; }
  const result = await pool.query(
    'SELECT u.id,u.name,p.graduation_year,p.department,p.degree,p.company,p.job_title,p.location,p.bio,p.skills,p.linkedin_url,p.is_verified,p.is_public FROM alumni_profiles p JOIN users u ON u.id=p.user_id ' + where + ' ORDER BY p.graduation_year DESC,u.name LIMIT 200',
    values
  );
  res.json(result.rows);
}));

// GET /:id — get single alumni profile details with career history
router.get('/:id', auth, asyncRoute(async (req, res) => {
  const alumniId = Number(req.params.id);
  if (!Number.isInteger(alumniId)) return res.status(400).json({ message: 'Invalid alumni ID.' });
  const where = req.user.role === 'admin' || req.user.id === alumniId
    ? 'WHERE u.id=$1'
    : "WHERE u.id=$1 AND p.is_public=TRUE AND p.is_verified=TRUE AND u.status='active'";
  const profileRes = await pool.query(
    'SELECT u.id,u.name,u.email,p.graduation_year,p.department,p.degree,p.company,p.job_title,p.location,p.bio,p.skills,p.linkedin_url,p.is_verified,p.is_public FROM alumni_profiles p JOIN users u ON u.id=p.user_id ' + where,
    [alumniId]
  );
  if (!profileRes.rows[0]) return res.status(404).json({ message: 'Alumnus not found or profile is not public.' });
  const careerRes = await pool.query(
    'SELECT * FROM career_history WHERE alumni_id=$1 ORDER BY start_date DESC NULLS LAST,id DESC',
    [alumniId]
  );
  res.json({ ...profileRes.rows[0], career_history: careerRes.rows });
}));

export default router;
