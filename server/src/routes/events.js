/**
 * Events and registrations routes — owned by Arshiyan (Nayan's reassigned work).
 *
 * Endpoints:
 *   GET    /api/events               — list all events with attendee count + registration status
 *   GET    /api/events/:id           — single event detail
 *   POST   /api/events               — create event (admin or alumni, active accounts only)
 *   POST   /api/events/:id/register  — register current user (student or alumni, active)
 *
 * Authorization:
 *   - Any authenticated user may list / view events.
 *   - Only active admin or alumni may create events; events must start in the future.
 *   - Only active students or alumni may register; past events reject registrations.
 *   - Duplicate registrations are blocked (HTTP 409).
 *   - JWT user.id is always used — frontend-supplied user IDs are ignored.
 *
 * Notifications:
 *   - All other active users are notified when a new event is created.
 *   - Event creator is notified when any other user registers.
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
// GET / — list all events with attendee count and per-user registration flag
// ---------------------------------------------------------------------------
router.get(
  '/',
  auth,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT e.*,
              u.name AS created_by_name,
              (SELECT COUNT(*)::int
               FROM event_registrations r
               WHERE r.event_id = e.id)                        AS attendee_count,
              EXISTS(
                SELECT 1 FROM event_registrations r
                WHERE r.event_id = e.id AND r.user_id = $1
              )                                                 AS registered
       FROM events e
       JOIN users u ON u.id = e.created_by
       ORDER BY e.starts_at
       LIMIT 200`,
      [req.user.id]
    );
    return res.json(result.rows);
  })
);

// ---------------------------------------------------------------------------
// GET /:id — single event detail with attendee count and registration flag
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  auth,
  asyncRoute(async (req, res) => {
    const eventId = Number(req.params.id);
    if (!eventId) {
      return res.status(400).json({ message: 'Invalid event ID.' });
    }

    const result = await pool.query(
      `SELECT e.*,
              u.name AS created_by_name,
              (SELECT COUNT(*)::int
               FROM event_registrations r
               WHERE r.event_id = e.id)                        AS attendee_count,
              EXISTS(
                SELECT 1 FROM event_registrations r
                WHERE r.event_id = e.id AND r.user_id = $2
              )                                                 AS registered
       FROM events e
       JOIN users u ON u.id = e.created_by
       WHERE e.id = $1`,
      [eventId, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Event not found.' });
    }

    return res.json(result.rows[0]);
  })
);

// ---------------------------------------------------------------------------
// POST / — create a new event (admin or active alumni, future date required)
// ---------------------------------------------------------------------------
router.post(
  '/',
  auth,
  active,
  roles('admin', 'alumni'),
  asyncRoute(async (req, res) => {
    const title = text(req.body.title);
    const starts = req.body.starts_at;

    if (!title) {
      return res.status(400).json({ message: 'Event title is required.' });
    }
    if (!starts || Number.isNaN(Date.parse(starts))) {
      return res.status(400).json({ message: 'A valid event date is required.' });
    }
    if (Date.parse(starts) <= Date.now()) {
      return res
        .status(400)
        .json({ message: 'Event must be scheduled for a future date.' });
    }

    const result = await pool.query(
      `INSERT INTO events (created_by, title, description, venue, starts_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        req.user.id,
        title,
        text(req.body.description),
        text(req.body.venue) || 'Campus',
        new Date(starts).toISOString(),
      ]
    );

    const created = result.rows[0];

    // Notify all other active users about the new event
    const recipients = await pool.query(
      `SELECT id FROM users WHERE id <> $1 AND status = 'active'`,
      [req.user.id]
    );
    for (const row of recipients.rows) {
      await notify(row.id, 'New community event', `"${title}" has been scheduled.`);
    }

    return res.status(201).json(created);
  })
);

// ---------------------------------------------------------------------------
// POST /:id/register — register the current user for an upcoming event
// ---------------------------------------------------------------------------
router.post(
  '/:id/register',
  auth,
  active,
  roles('student', 'alumni'),
  asyncRoute(async (req, res) => {
    const eventId = Number(req.params.id);
    if (!eventId) {
      return res.status(400).json({ message: 'Invalid event ID.' });
    }

    // Reject registrations for past or non-existent events
    const event = await pool.query(
      `SELECT id, title, created_by
       FROM events
       WHERE id = $1 AND starts_at > NOW()`,
      [eventId]
    );
    if (!event.rows[0]) {
      return res
        .status(404)
        .json({ message: 'Event not found or registration is closed.' });
    }

    // Check for existing registration (return 409 before hitting DB unique constraint)
    const duplicate = await pool.query(
      `SELECT id FROM event_registrations WHERE event_id = $1 AND user_id = $2`,
      [eventId, req.user.id]
    );
    if (duplicate.rows[0]) {
      return res
        .status(409)
        .json({ message: 'You are already registered for this event.' });
    }

    const result = await pool.query(
      `INSERT INTO event_registrations (event_id, user_id) VALUES ($1, $2) RETURNING *`,
      [eventId, req.user.id]
    );

    // Notify the event creator (unless registrant is the creator)
    if (Number(event.rows[0].created_by) !== Number(req.user.id)) {
      await notify(
        event.rows[0].created_by,
        'New event registration',
        `${req.user.name} registered for "${event.rows[0].title}".`
      );
    }

    return res.status(201).json(result.rows[0]);
  })
);

export default router;
