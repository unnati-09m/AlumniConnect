/**
 * Donation pledge routes — owned by Arshiyan (Nayan's reassigned work).
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

// ---------------------------------------------------------------------------
// POST / — alumni records a donation pledge interest
// ---------------------------------------------------------------------------
router.post(
  '/',
  auth,
  active,
  roles('alumni'),
  asyncRoute(async (req, res) => {
    const amount = Number(req.body.amount);
    const purpose = text(req.body.purpose);
    const note = text(req.body.note);

    if (!(amount > 0) || !Number.isFinite(amount)) {
      return res
        .status(400)
        .json({ message: 'Amount must be a valid positive number.' });
    }
    if (!purpose) {
      return res
        .status(400)
        .json({ message: 'Purpose is required for a donation pledge.' });
    }

    const result = await pool.query(
      `INSERT INTO donation_pledges (alumni_id, amount, purpose, note)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, amount, purpose, note]
    );

    const pledge = result.rows[0];

    await notifyAdmins(
      'New donation pledge interest',
      `${req.user.name} expressed a pledge interest of ₹${amount} for "${purpose}".`
    );

    return res.status(201).json(pledge);
  })
);

// ---------------------------------------------------------------------------
// GET /mine — alumni views their own pledge history
// ---------------------------------------------------------------------------
router.get(
  '/mine',
  auth,
  active,
  roles('alumni'),
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT * FROM donation_pledges
       WHERE alumni_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.json(result.rows);
  })
);

// ---------------------------------------------------------------------------
// GET / — admin lists all donation pledges
// ---------------------------------------------------------------------------
router.get(
  '/',
  auth,
  active,
  roles('admin'),
  asyncRoute(async (_req, res) => {
    const result = await pool.query(
      `SELECT d.*, u.name AS alumni_name, u.email
       FROM donation_pledges d
       JOIN users u ON u.id = d.alumni_id
       ORDER BY d.created_at DESC`
    );
    return res.json(result.rows);
  })
);

// ---------------------------------------------------------------------------
// PATCH /:id — admin updates pledge status
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  auth,
  active,
  roles('admin'),
  asyncRoute(async (req, res) => {
    const pledgeId = Number(req.params.id);
    if (!pledgeId) {
      return res.status(400).json({ message: 'Invalid pledge ID.' });
    }

    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `Status must be one of: ${VALID_STATUSES.join(', ')}.`,
      });
    }

    const result = await pool.query(
      `UPDATE donation_pledges
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, pledgeId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Pledge not found.' });
    }

    return res.json(result.rows[0]);
  })
);

export default router;
