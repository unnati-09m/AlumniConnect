/**
 * Donation pledge routes — owned by Nayan.
 *
 * IMPORTANT: This is pledge-interest tracking only.
 * No real payment processing or money transfer takes place.
 *
 * Endpoints:
 *   POST  /api/donation-pledges        — alumni records a pledge interest
 *   GET   /api/donation-pledges        — admin lists all pledges
 *   GET   /api/donation-pledges/mine   — alumni views their own pledges
 *   PATCH /api/donation-pledges/:id    — admin updates pledge status
 *
 * Authorization:
 *   - Only active alumni may submit a pledge.
 *   - Only active admin may list all pledges or update status.
 *   - Alumni may view their own pledge history via /mine.
 *   - Students are blocked from all pledge endpoints.
 *   - JWT user.id is used for alumni_id — frontend cannot inject a different ID.
 *
 * Supported pledge statuses: interested | contacted | fulfilled | withdrawn
 *
 * Notifications:
 *   - All active admin accounts are notified when a new pledge is recorded.
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

const VALID_STATUSES = ['interested', 'contacted', 'fulfilled', 'withdrawn'];

/** Notify every active admin about a new pledge. */
const notifyAdmins = async (title, body) => {
  try {
    const admins = await pool.query(
      `SELECT id FROM users WHERE role = 'admin' AND status = 'active'`
    );
    for (const admin of admins.rows) {
      await pool.query(
        'INSERT INTO notifications (user_id,title,body) VALUES ($1,$2,$3)',
        [admin.id, title, body]
      );
    }
  } catch (err) {
    console.error('notifyAdmins() failed:', err.message);
  }
};
