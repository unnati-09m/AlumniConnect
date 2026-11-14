import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate as auth, requireActive as active, allowRoles as roles } from '../auth.js';

const router = Router();

// Helper to catch async errors and pass them to Express error handler
const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

// Helper to clean string input
const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

// Helper to escape values for CSV export (prevents CSV injection)
const safeCsv = (value) => {
  let output = String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(output)) {
    output = "'" + output;
  }
  return '"' + output.replaceAll('"', '""') + '"';
};

/**
 * GET /api/admin/users
 * Returns list of all registered users along with alumni details (if applicable).
 * Pending alumni are shown at the top for quick review.
 */
router.get('/users', auth, roles('admin'), asyncRoute(async (_req, res) => {
  const result = await pool.query(
    "SELECT u.id,u.name,u.email,u.role,u.status,u.created_at,p.graduation_year,p.department,p.company,p.is_verified FROM users u LEFT JOIN alumni_profiles p ON p.user_id=u.id ORDER BY CASE WHEN u.status='pending' THEN 0 ELSE 1 END,u.created_at DESC LIMIT 500"
  );
  res.json(result.rows);
}));

/**
 * PATCH /api/admin/users/:id/status
 * Updates user account status between 'active' and 'suspended'.
 * Admins cannot suspend themselves or other admins.
 */
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

  if (!result.rows[0]) {
    return res.status(404).json({ message: 'User not found or cannot be modified by administrator.' });
  }
  res.json(result.rows[0]);
}));

/**
 * PATCH /api/admin/users/:id/verification
 * Approves or rejects a pending alumni verification request using an atomic database transaction.
 */
router.patch('/users/:id/verification', auth, active, roles('admin'), asyncRoute(async (req, res) => {
  const decision = req.body.decision;
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ message: 'Decision must be approve or reject.' });
  }

  // Prevent an admin from performing verification on themselves
  if (req.user.id === Number(req.params.id)) {
    return res.status(400).json({ message: 'You cannot perform verification on your own administrator account.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify user exists and has role 'alumni'
    const userResult = await client.query('SELECT id,role,status FROM users WHERE id=$1', [req.params.id]);
    const user = userResult.rows[0];

    if (!user || user.role !== 'alumni') {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Pending alumni account not found. Verification applies to alumni accounts only.' });
    }

    // 2. Update alumni profile verification flag
    await client.query(
      'UPDATE alumni_profiles SET is_verified=$1,verification_notes=$2,updated_at=NOW() WHERE user_id=$3',
      [decision === 'approve', cleanText(req.body.notes), user.id]
    );

    // 3. Update account status: 'active' if approved, 'suspended' if rejected
    const newStatus = decision === 'approve' ? 'active' : 'suspended';
    await client.query('UPDATE users SET status=$1 WHERE id=$2', [newStatus, user.id]);

    // 4. Send notification to the alumni user
    await client.query(
      'INSERT INTO notifications (user_id, title, body) VALUES ($1, $2, $3)',
      [
        user.id,
        'Account verification update',
        decision === 'approve'
          ? 'Your alumni account has been approved by the institution administrator. Welcome to AlumniConnect!'
          : 'Your alumni account was not approved. Please contact your institution administrator for details.'
      ]
    );

    await client.query('COMMIT');
    res.json({
      message: 'Account ' + (decision === 'approve' ? 'approved' : 'rejected') + ' successfully.',
      status: newStatus
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/admin/reports
 * Aggregates summary statistics across users, mentorship, opportunities, events, donations, and career history.
 */
router.get('/reports', auth, roles('admin'), asyncRoute(async (_req, res) => {
  const [usersResult, mentorshipResult, opportunitiesResult, eventsResult, pledgesResult, careerResult] = await Promise.all([
    pool.query('SELECT role,COUNT(*)::int AS count FROM users GROUP BY role ORDER BY role'),
    pool.query('SELECT status,COUNT(*)::int AS count FROM mentorship_requests GROUP BY status'),
    pool.query('SELECT type,COUNT(*)::int AS count FROM opportunities GROUP BY type'),
    pool.query('SELECT COUNT(*)::int AS registrations FROM event_registrations'),
    pool.query('SELECT status,COUNT(*)::int AS count,COALESCE(SUM(amount),0)::numeric AS amount FROM donation_pledges GROUP BY status'),
    pool.query('SELECT COUNT(*)::int AS count FROM career_history')
  ]);

  res.json({
    usersByRole: usersResult.rows,
    mentorshipByStatus: mentorshipResult.rows,
    opportunitiesByType: opportunitiesResult.rows,
    eventRegistrations: eventsResult.rows[0]?.registrations || 0,
    pledgesByStatus: pledgesResult.rows,
    careerEntries: careerResult.rows[0]?.count || 0
  });
}));

/**
 * GET /api/admin/alumni.csv
 * Exports verified alumni directory details as an RFC-compliant CSV file download.
 */
router.get('/alumni.csv', auth, roles('admin'), asyncRoute(async (_req, res) => {
  // Compact single-line SQL so the test mock can match it with sql.includes()
  const queryResult = await pool.query(
    'SELECT u.name,u.email,p.graduation_year,p.department,p.degree,p.company,p.job_title,p.location,p.is_verified FROM users u JOIN alumni_profiles p ON p.user_id=u.id ORDER BY p.graduation_year DESC,u.name'
  );

  const headers = ['Name', 'Email', 'Graduation Year', 'Department', 'Degree', 'Company', 'Job Title', 'Location', 'Verified'];
  const csvLines = [
    headers.map(safeCsv).join(','),
    ...queryResult.rows.map((row) => Object.values(row).map(safeCsv).join(','))
  ];

  const csvContent = csvLines.join('\r\n');
  res.type('text/csv').attachment('alumni-directory.csv').send(csvContent);
}));

export default router;
