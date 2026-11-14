/**
 * Notifications routes — owned by Nayan.
 *
 * Endpoints:
 *   GET   /api/notifications        — fetch current user's notifications (newest first)
 *   PATCH /api/notifications/:id/read — mark a single notification as read
 *
 * Authorization:
 *   - Every authenticated user can fetch and mark their OWN notifications only.
 *   - Ownership is enforced by scoping every query to req.user.id from the JWT.
 *   - A user can never read or mark another user's notifications.
 */

import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate as auth } from '../auth.js';

const router = Router();
const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

// ---------------------------------------------------------------------------
// GET / — fetch up to 50 notifications for the signed-in user, newest first
// ---------------------------------------------------------------------------
router.get(
  '/',
  auth,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT id, title, body, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    return res.json(result.rows);
  })
);

// ---------------------------------------------------------------------------
// GET /unread-count — returns the number of unread notifications
// ---------------------------------------------------------------------------
router.get(
  '/unread-count',
  auth,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM notifications
       WHERE user_id = $1 AND is_read = FALSE`,
      [req.user.id]
    );
    return res.json({ unreadCount: result.rows[0].count });
  })
);
