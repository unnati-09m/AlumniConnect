import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { pool } from './db.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import alumniRoutes from './routes/alumni.js';
import opportunitiesRoutes from './routes/opportunities.js';
import mentorshipRoutes from './routes/mentorship.js';
import eventsRoutes from './routes/events.js';
import notificationsRoutes from './routes/notifications.js';
import announcementsRoutes from './routes/announcements.js';
import careerRoutes from './routes/career.js';
import donationsRoutes from './routes/donations.js';
import adminRoutes from './routes/admin.js';
import { authenticate as auth, allowRoles as roles } from './auth.js';

const app = express();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');

// CORS — supports multiple origins via CLIENT_ORIGINS or single CLIENT_ORIGIN
app.use(cors({
  origin(origin, callback) {
    const allowed = (process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || 'http://localhost:5173')
      .split(',').map(value => value.trim()).filter(Boolean);
    if (!origin || allowed.includes(origin) || process.env.NODE_ENV === 'production') {
      return callback(null, true);
    }
    return callback(new Error('This client origin is not allowed.'));
  }
}));
app.use(express.json({ limit: '1mb' }));

const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// Health check — always public
app.get('/api/health', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', service: 'AlumniConnect', database: 'connected' });
}));

// Dashboard — role-aware summary (cross-cutting; kept in main entry)
app.get('/api/dashboard', auth, asyncRoute(async (req, res) => {
  const id = req.user.id, role = req.user.role;
  const count = async (sql, values = []) => Number((await pool.query(sql, values)).rows[0].count);
  if (role === 'student') {
    const [mentorship, applications, events, opportunities, alumni] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM mentorship_requests WHERE student_id=$1', [id]),
      pool.query('SELECT COUNT(*)::int AS count FROM opportunity_applications WHERE student_id=$1', [id]),
      pool.query('SELECT COUNT(*)::int AS count FROM event_registrations r JOIN events e ON e.id=r.event_id WHERE r.user_id=$1 AND e.starts_at>=NOW()', [id]),
      count("SELECT COUNT(*)::int AS count FROM opportunities WHERE is_active=TRUE AND (apply_by IS NULL OR apply_by>=CURRENT_DATE)"),
      count("SELECT COUNT(*)::int AS count FROM alumni_profiles p JOIN users u ON u.id=p.user_id WHERE p.is_verified=TRUE AND p.is_public=TRUE AND u.status='active'")
    ]);
    return res.json({ role, mentorshipRequests: mentorship.rows[0].count, applications: applications.rows[0].count, registeredEvents: events.rows[0].count, openOpportunities: opportunities, verifiedAlumni: alumni });
  }
  if (role === 'alumni') {
    const [requests, jobs, applicants, career, pledges] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS count FROM mentorship_requests WHERE alumni_id=$1 AND status='pending'", [id]),
      pool.query('SELECT COUNT(*)::int AS count FROM opportunities WHERE COALESCE(created_by,alumni_id)=$1 AND is_active=TRUE', [id]),
      pool.query('SELECT COUNT(*)::int AS count FROM opportunity_applications a JOIN opportunities o ON o.id=a.opportunity_id WHERE COALESCE(o.created_by,o.alumni_id)=$1', [id]),
      pool.query('SELECT COUNT(*)::int AS count FROM career_history WHERE alumni_id=$1', [id]),
      pool.query('SELECT COUNT(*)::int AS count FROM donation_pledges WHERE alumni_id=$1', [id])
    ]);
    return res.json({ role, pendingMentorship: requests.rows[0].count, postedOpportunities: jobs.rows[0].count, applicants: applicants.rows[0].count, careerEntries: career.rows[0].count, pledges: pledges.rows[0].count, verified: true });
  }
  const [users, alumni, pending, students, mentorship, opportunities, events, donations] = await Promise.all([
    count('SELECT COUNT(*)::int AS count FROM users'),
    count("SELECT COUNT(*)::int AS count FROM users WHERE role='alumni'"),
    count("SELECT COUNT(*)::int AS count FROM users WHERE status='pending'"),
    count("SELECT COUNT(*)::int AS count FROM users WHERE role='student'"),
    count('SELECT COUNT(*)::int AS count FROM mentorship_requests'),
    count('SELECT COUNT(*)::int AS count FROM opportunities'),
    count('SELECT COUNT(*)::int AS count FROM events'),
    pool.query("SELECT COALESCE(SUM(amount),0)::numeric AS total FROM donation_pledges WHERE status<>'withdrawn'")
  ]);
  res.json({ role, totalUsers: users, alumni, pendingApprovals: pending, students, mentorshipRequests: mentorship, opportunities, events, pledgedAmount: Number(donations.rows[0].total) });
}));

// Mount modular route handlers
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/alumni', alumniRoutes);
app.use('/api/opportunities', opportunitiesRoutes);
app.use('/api', opportunitiesRoutes);
app.use('/api/mentorship', mentorshipRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/career-history', careerRoutes);
app.use('/api/donation-pledges', donationsRoutes);
app.use('/api/admin', adminRoutes);

// 404 fallback for unknown API routes
app.use('/api', (_req, res) => res.status(404).json({ message: 'API route not found.' }));

// Global error handler
app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.code === '23505') return res.status(409).json({ message: 'This record already exists.' });
  if (error.code === '23503') return res.status(400).json({ message: 'A related record was not found.' });
  if (['23514', '22P02', '22007'].includes(error.code)) return res.status(400).json({ message: 'Some submitted values are invalid.' });
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

// Serve compiled React frontend when available
const builtClient = path.join(root, 'client', 'dist');
if (fs.existsSync(builtClient)) {
  app.use(express.static(builtClient));
  app.use((_req, res) => res.sendFile(path.join(builtClient, 'index.html')));
}

const port = Number(process.env.PORT) || 4000;
app.listen(port, '0.0.0.0', () => console.log('AlumniConnect API server listening on port ' + port));
