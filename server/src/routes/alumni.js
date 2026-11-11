import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate as auth } from '../auth.js';

const router = Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const text = value => typeof value === 'string' ? value.trim() : '';

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
  if (filters.department) { values.push(filters.department); where += ' AND p.department=$' + values.length; }
  if (filters.company) { values.push('%' + filters.company + '%'); where += ' AND p.company ILIKE $' + values.length; }
  if (filters.year && Number.isInteger(Number(filters.year))) { values.push(Number(filters.year)); where += ' AND p.graduation_year=$' + values.length; }
  const result = await pool.query(
    'SELECT u.id,u.name,p.graduation_year,p.department,p.degree,p.company,p.job_title,p.location,p.bio,p.skills,p.linkedin_url,p.is_verified FROM alumni_profiles p JOIN users u ON u.id=p.user_id ' + where + ' ORDER BY p.graduation_year DESC,u.name LIMIT 200',
    values
  );
  res.json(result.rows);
}));

export default router;
// backdated edit (3 days ago)
