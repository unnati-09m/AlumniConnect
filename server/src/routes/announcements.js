/**
 * Announcements routes — owned by Arshiyan (Nayan's reassigned work).
 *
 * Endpoints:
 *   GET  /api/announcements   — list announcements (audience-filtered by role)
 *   POST /api/announcements   — create announcement (active admin only)
 *
 * Audience model:
 *   'all'      → visible to every authenticated user
 *   'students' → visible to students and admins
 *   'alumni'   → visible to alumni and admins
 *
 * Authorization:
 *   - Only active admin accounts may create announcements.
 *   - Students see announcements targeted at 'all' or 'students'.
 *   - Alumni see announcements targeted at 'all' or 'alumni'.
 *   - Admin sees every announcement.
 *   - Notifications are sent to all affected active users.
 *
 * Notes:
 *   - 'faculty' and 'recruiter' audiences are NOT supported (removed from schema).
 *   - Validation rejects blank title or body.
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

/** Insert a notification row. Fire-and-forget on failure. */
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
// GET / — list announcements filtered by the caller's role
// ---------------------------------------------------------------------------
router.get(
  '/',
  auth,
  asyncRoute(async (req, res) => {
    let result;

    if (req.user.role === 'admin') {
      // Admins see all announcements
      result = await pool.query(
        `SELECT a.*, u.name AS author
         FROM announcements a
         JOIN users u ON u.id = a.created_by
         ORDER BY a.created_at DESC
         LIMIT 50`
      );
    } else {
      // Map role to the audience value that targets them specifically
      const audience = req.user.role === 'student' ? 'students' : 'alumni';
      result = await pool.query(
        `SELECT a.*, u.name AS author
         FROM announcements a
         JOIN users u ON u.id = a.created_by
         WHERE a.audience = 'all' OR a.audience = $1
         ORDER BY a.created_at DESC
         LIMIT 50`,
        [audience]
      );
    }

    return res.json(result.rows);
  })
);

// ---------------------------------------------------------------------------
// POST / — create an announcement (active admin only)
// ---------------------------------------------------------------------------
router.post(
  '/',
  auth,
  active,
  roles('admin'),
  asyncRoute(async (req, res) => {
    const title = text(req.body.title);
    const body = text(req.body.body || req.body.message); // accept 'message' alias
    const rawAudience = req.body.audience;

    if (!title) {
      return res
        .status(400)
        .json({ message: 'Announcement title is required.' });
    }
    if (!body) {
      return res
        .status(400)
        .json({ message: 'Announcement message/body is required.' });
    }

    // Strictly enforce the three supported audience values
    const VALID_AUDIENCES = ['all', 'students', 'alumni'];
    const audience = VALID_AUDIENCES.includes(rawAudience) ? rawAudience : 'all';

    const result = await pool.query(
      `INSERT INTO announcements (created_by, title, body, audience)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, title, body, audience]
    );

    const created = result.rows[0];

    // Determine which user role(s) should receive a notification
    // audience='all'      → all active non-admin users
    // audience='students' → only students (and self is admin so excluded anyway)
    // audience='alumni'   → only alumni
    const targetRole =
      audience === 'all'
        ? null                               // no filter → all roles
        : audience === 'students'
        ? 'student'
        : 'alumni';

    const recipients = await pool.query(
      `SELECT id FROM users
       WHERE id <> $1
         AND status = 'active'
         AND ($2::text IS NULL OR role = $2)`,
      [req.user.id, targetRole]
    );

    for (const row of recipients.rows) {
      await notify(row.id, 'Institution announcement', title);
    }

    return res.status(201).json(created);
  })
);

export default router;
