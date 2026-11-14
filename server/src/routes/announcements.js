/**
 * Announcements routes — owned by Nayan.
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
