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
