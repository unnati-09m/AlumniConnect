/**
 * Mentorship lifecycle routes — owned by Arshiyan (Nayan's reassigned work).
 *
 * Endpoints:
 *   POST   /api/mentorship          — student submits a request to an active alumnus
 *   GET    /api/mentorship          — list requests (scoped by role)
 *   GET    /api/mentorship/:id      — get single request (owner or admin only)
 *   PATCH  /api/mentorship/:id      — alumni accepts / declines / completes a request
 *
 * Authorization:
 *   - Only active students may create requests.
 *   - Only the target alumnus may update status; students and other alumni are blocked.
 *   - Admins may read all requests but may NOT alter status.
 *   - JWT user.id is always used — frontend-supplied user IDs are ignored.
 *
 * Notifications:
 *   - Alumnus is notified when a new request arrives.
 *   - Student is notified when status changes (accepted / declined / completed).
 */

import { Router } from 'express';
import { pool } from '../db.js';
import {
  authenticate as auth,
  requireActive as active,
  allowRoles as roles,
} from '../auth.js';

const router = Router();
const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Insert a notification row for a user. Fire-and-forget on failure so a
 *  notification hiccup never kills the main operation. */
const notify = async (userId, title, body) => {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)',
      [userId, title, body]
    );
  } catch (err) {
    console.error('notify() failed:', err.message);
  }
};

// ---------------------------------------------------------------------------
// POST / — student submits a mentorship request to an active, verified alumnus
// ---------------------------------------------------------------------------
router.post(
  '/',
  auth,
  active,
  roles('student'),
  asyncRoute(async (req, res) => {
    const alumniId = Number(req.body.alumni_id);
    const topic = text(req.body.topic);
    const message = text(req.body.message);

    if (!alumniId || !topic) {
      return res
        .status(400)
        .json({ message: 'Select an alumnus and enter a mentorship topic.' });
    }

    // Confirm the target is an active, verified, public alumnus
    const mentor = await pool.query(
      `SELECT u.id, u.name
       FROM users u
       JOIN alumni_profiles p ON p.user_id = u.id
       WHERE u.id = $1
         AND u.role = 'alumni'
         AND u.status = 'active'
         AND p.is_verified = TRUE
         AND p.is_public = TRUE`,
      [alumniId]
    );
    if (!mentor.rows[0]) {
      return res
        .status(404)
        .json({ message: 'This alumnus is not available for mentorship.' });
    }

    // Check for an existing open (pending or accepted) request
    const existing = await pool.query(
      `SELECT id FROM mentorship_requests
       WHERE student_id = $1
         AND alumni_id  = $2
         AND status IN ('pending','accepted')`,
      [req.user.id, alumniId]
    );
    if (existing.rows[0]) {
      return res.status(409).json({
        message:
          'You already have an open mentorship request with this alumnus.',
      });
    }

    const result = await pool.query(
      `INSERT INTO mentorship_requests (student_id, alumni_id, topic, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, alumniId, topic, message]
    );

    await notify(
      alumniId,
      'New mentorship request',
      `${req.user.name} requested guidance about "${topic}".`
    );

    return res.status(201).json(result.rows[0]);
  })
);

// ---------------------------------------------------------------------------
// GET / — list mentorship requests scoped by role
//   student → their own outgoing requests
//   alumni  → incoming requests directed at them
//   admin   → all requests (read-only overview)
// ---------------------------------------------------------------------------
router.get(
  '/',
  auth,
  asyncRoute(async (req, res) => {
    let where = 'WHERE m.student_id = $1';
    let values = [req.user.id];

    if (req.user.role === 'alumni') {
      where = 'WHERE m.alumni_id = $1';
    } else if (req.user.role === 'admin') {
      where = 'WHERE TRUE';
      values = [];
    }

    const result = await pool.query(
      `SELECT m.*,
              s.name  AS student_name,
              s.email AS student_email,
              a.name  AS alumni_name
       FROM mentorship_requests m
       JOIN users s ON s.id = m.student_id
       JOIN users a ON a.id = m.alumni_id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT 200`,
      values
    );

    return res.json(result.rows);
  })
);

// ---------------------------------------------------------------------------
// GET /:id — single request detail (must be participant or admin)
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  auth,
  asyncRoute(async (req, res) => {
    const requestId = Number(req.params.id);
    if (!requestId) {
      return res.status(400).json({ message: 'Invalid request ID.' });
    }

    const result = await pool.query(
      `SELECT m.*,
              s.name  AS student_name,
              s.email AS student_email,
              a.name  AS alumni_name
       FROM mentorship_requests m
       JOIN users s ON s.id = m.student_id
       JOIN users a ON a.id = m.alumni_id
       WHERE m.id = $1`,
      [requestId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Mentorship request not found.' });
    }

    const row = result.rows[0];
    const { id, role } = req.user;

    // Students may only see their own; alumni may only see requests to them
    if (
      role === 'student' && row.student_id !== id ||
      role === 'alumni'  && row.alumni_id  !== id
    ) {
      return res
        .status(403)
        .json({ message: 'You do not have permission to view this request.' });
    }

    return res.json(row);
  })
);

// ---------------------------------------------------------------------------
// PATCH /:id — alumnus updates the status of a request directed at them
//   Permitted transitions:
//     pending  → accepted | declined
//     accepted → declined | completed
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  auth,
  active,
  roles('alumni'),
  asyncRoute(async (req, res) => {
    const requestId = Number(req.params.id);
    if (!requestId) {
      return res.status(400).json({ message: 'Invalid request ID.' });
    }

    const { status } = req.body;
    if (!['accepted', 'declined', 'completed'].includes(status)) {
      return res
        .status(400)
        .json({ message: 'Status must be accepted, declined or completed.' });
    }

    // Only the alumnus the request was sent to may respond
    const result = await pool.query(
      `UPDATE mentorship_requests
       SET status = $1, updated_at = NOW()
       WHERE id        = $2
         AND alumni_id = $3
         AND status IN ('pending','accepted')
       RETURNING *`,
      [status, requestId, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        message:
          'Mentorship request not found, already closed, or not directed at you.',
      });
    }

    const updated = result.rows[0];

    // Distinct notification messages per transition
    let notifBody;
    if (status === 'accepted') {
      notifBody = `${req.user.name} accepted your mentorship request on "${updated.topic}".`;
    } else if (status === 'declined') {
      notifBody = `${req.user.name} declined your mentorship request on "${updated.topic}".`;
    } else {
      notifBody = `Your mentorship session on "${updated.topic}" has been marked as completed.`;
    }

    await notify(updated.student_id, 'Mentorship update', notifBody);

    return res.json(updated);
  })
);

export default router;
