import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate as auth, requireActive as active, allowRoles as roles } from '../auth.js';

const router = Router();
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const text = value => typeof value === 'string' ? value.trim() : '';
const notify = async (userId, title, body) => {
  await pool.query('INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)', [userId, title, body]);
};
const safeCsv = value => {
  let output = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(output)) output = "'" + output;
  return '"' + output.replaceAll('"', '""') + '"';
};

// GET /users — list users for institution admin overview
router.get('/users', auth, roles('admin'), asyncRoute(async (_req, res) => {
  const result = await pool.query(
    "SELECT u.id,u.name,u.email,u.role,u.status,u.created_at,p.graduation_year,p.department,p.company,p.is_verified FROM users u LEFT JOIN alumni_profiles p ON p.user_id=u.id ORDER BY CASE WHEN u.status='pending' THEN 0 ELSE 1 END,u.created_at DESC LIMIT 500"
  );
  res.json(result.rows);
}));

// PATCH /users/:id/status — update user status (active or suspended)
router.patch('/users/:id/status', auth, active, roles('admin'), asyncRoute(async (req, res) => {
  const status = req.body.status;
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ message: 'Status must be active or suspended.' });
  }

  // Prevent an admin from suspending or modifying their own admin account
  if (req.user.id === Number(req.params.id)) {
    return res.status(400).json({ message: 'Administrators cannot modify or suspend their own account status.' });
  }

  const result = await pool.query(
    "UPDATE users SET status=$1 WHERE id=$2 AND role<>'admin' RETURNING id,name,email,role,status",
    [status, req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'User not found or cannot be modified by administrator.' });
  res.json(result.rows[0]);
}));

// PATCH /users/:id/verification — approve or reject pending alumni verification
router.patch('/users/:id/verification', auth, active, roles('admin'), asyncRoute(async (req, res) => {
  const decision = req.body.decision;
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ message: 'Decision must be approve or reject.' });
  }

  // Prevent an admin from verifying/altering self or invalid accounts
  if (req.user.id === Number(req.params.id)) {
    return res.status(400).json({ message: 'You cannot perform verification on your own administrator account.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = (await client.query('SELECT id,role,status FROM users WHERE id=$1', [req.params.id])).rows[0];
    if (!user || user.role !== 'alumni') {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Pending alumni account not found. Verification applies to alumni accounts only.' });
    }

    await client.query(
      'UPDATE alumni_profiles SET is_verified=$1,verification_notes=$2,updated_at=NOW() WHERE user_id=$3',
      [decision === 'approve', text(req.body.notes), user.id]
    );

    const newStatus = decision === 'approve' ? 'active' : 'suspended';
    await client.query(
      'UPDATE users SET status=$1 WHERE id=$2',
      [newStatus, user.id]
    );

    await client.query(
      'INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)',
      [
        user.id,
        'Account verification update',
        decision === 'approve'
          ? 'Your alumni account has been approved by the institution administrator. Welcome to AlumniConnect!'
          : 'Your alumni account was not approved. Please contact your institution administrator for details.'
      ]
    );

    await client.query('COMMIT');
    res.json({ message: 'Account ' + (decision === 'approve' ? 'approved' : 'rejected') + ' successfully.', status: newStatus });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

// GET /reports — aggregated institution report metrics
router.get('/reports', auth, roles('admin'), asyncRoute(async (_req, res) => {
  const [users, mentorship, opps, events, pledges, career] = await Promise.all([
    pool.query('SELECT role,COUNT(*)::int AS count FROM users GROUP BY role ORDER BY role'),
    pool.query('SELECT status,COUNT(*)::int AS count FROM mentorship_requests GROUP BY status'),
    pool.query('SELECT type,COUNT(*)::int AS count FROM opportunities GROUP BY type'),
    pool.query('SELECT COUNT(*)::int AS registrations FROM event_registrations'),
    pool.query('SELECT status,COUNT(*)::int AS count,COALESCE(SUM(amount),0)::numeric AS amount FROM donation_pledges GROUP BY status'),
    pool.query('SELECT COUNT(*)::int AS count FROM career_history')
  ]);
  res.json({
    usersByRole: users.rows,
    mentorshipByStatus: mentorship.rows,
    opportunitiesByType: opps.rows,
    eventRegistrations: events.rows[0].registrations,
    pledgesByStatus: pledges.rows,
    careerEntries: career.rows[0].count
  });
}));

// GET /alumni.csv — export verified alumni directory to CSV
router.get('/alumni.csv', auth, roles('admin'), asyncRoute(async (_req, res) => {
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

export default router;
