import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import mentorshipRoutes from './routes/mentorship.js';
import eventsRoutes from './routes/events.js';
import notificationsRoutes from './routes/notifications.js';
import announcementsRoutes from './routes/announcements.js';
import donationsRoutes from './routes/donations.js';
import adminRoutes from './routes/admin.js';
import { pool } from './db.js';

const app = express();
app.use(express.json());

const JWT_SECRET = 'test-secret-key-nayan-suite';
process.env.JWT_SECRET = JWT_SECRET;

const makeToken = (user) => jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });

const studentUser = { id: 10, name: 'Student Ten', email: 'student10@alumniconnect.test', role: 'student', status: 'active' };
const studentUser2 = { id: 11, name: 'Student Eleven', email: 'student11@alumniconnect.test', role: 'student', status: 'active' };
const alumniUser = { id: 20, name: 'Alumni Twenty', email: 'alumni20@alumniconnect.test', role: 'alumni', status: 'active' };
const alumniPending = { id: 21, name: 'Alumni Pending', email: 'alumni21@alumniconnect.test', role: 'alumni', status: 'pending' };
const adminUser = { id: 1, name: 'Admin One', email: 'admin@alumniconnect.test', role: 'admin', status: 'active' };

const studentToken = makeToken(studentUser);
const student2Token = makeToken(studentUser2);
const alumniToken = makeToken(alumniUser);
const alumniPendingToken = makeToken(alumniPending);
const adminToken = makeToken(adminUser);

app.use('/api/mentorship', mentorshipRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/donation-pledges', donationsRoutes);
app.use('/api/admin', adminRoutes);

// Mock DB state
let mockQueries = [];
let mockResponses = {};

pool.query = async (sql, values = []) => {
  mockQueries.push({ sql, values });

  // Standard status check used by requireActive middleware
  if (sql.includes('SELECT status FROM users WHERE id=$1')) {
    const userId = Number(values[0]);
    if (userId === alumniPending.id) return { rows: [{ status: 'pending' }] };
    return { rows: [{ status: 'active' }] };
  }

  if (typeof mockResponses.handler === 'function') {
    const res = mockResponses.handler(sql, values);
    if (res !== undefined) return res;
  }
  return { rows: [] };
};

// Also mock pool.connect for transactions (used in admin verification)
pool.connect = async () => {
  return {
    query: async (sql, values = []) => {
      mockQueries.push({ sql, values, tx: true });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
      if (typeof mockResponses.clientHandler === 'function') {
        const res = mockResponses.clientHandler(sql, values);
        if (res !== undefined) return res;
      }
      return { rows: [] };
    },
    release: () => {}
  };
};

async function testRequest(path, method = 'GET', token = null, body = null) {
  return new Promise((resolve) => {
    const req = {
      method,
      url: path,
      headers: {
        ...(token ? { authorization: 'Bearer ' + token } : {}),
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      body: body || {}
    };

    let statusCode = 200;
    let headers = {};
    let responseData = '';

    const res = {
      status(code) { statusCode = code; return this; },
      setHeader(k, v) { headers[k] = v; },
      type(t) { headers['content-type'] = t; return this; },
      attachment(f) { headers['content-disposition'] = 'attachment; filename=' + f; return this; },
      send(data) { responseData = data; resolve({ status: statusCode, headers, data }); },
      json(data) { responseData = data; resolve({ status: statusCode, headers, data }); }
    };

    app.handle(req, res);
  });
}

async function runTests() {
  console.log('--- RUNNING NAYAN JYOTI ENGAGEMENT & OPERATIONS TEST SUITE ---');

  // =========================================================================
  // 1. Cross-account Mentorship Lifecycle
  // =========================================================================
  console.log('\n[ 1 ] Cross-Account Mentorship Tests');

  // 1a. Student cannot request mentorship from self
  const selfReq = await testRequest('/api/mentorship', 'POST', studentToken, {
    alumni_id: studentUser.id,
    topic: 'Self mentorship'
  });
  assert.equal(selfReq.status, 400, 'Self mentorship request is rejected with 400');
  console.log('✓ Self-mentorship prevention verified');

  // 1b. Student requests mentorship to verified alumnus
  mockResponses.handler = (sql, values) => {
    if (sql.includes('FROM users u') && sql.includes('alumni_profiles p')) {
      return { rows: [{ id: 20, name: 'Alumni Twenty' }] };
    }
    if (sql.includes('SELECT id FROM mentorship_requests') && sql.includes('status IN (\'pending\',\'accepted\')')) {
      return { rows: [] }; // No duplicate
    }
    if (sql.includes('INSERT INTO mentorship_requests')) {
      return { rows: [{ id: 101, student_id: 10, alumni_id: 20, topic: 'System Design', status: 'pending' }] };
    }
    if (sql.includes('INSERT INTO notifications')) {
      return { rows: [] };
    }
    return { rows: [] };
  };

  const createMentorship = await testRequest('/api/mentorship', 'POST', studentToken, {
    alumni_id: 20,
    topic: 'System Design',
    message: 'Looking for advice.'
  });
  assert.equal(createMentorship.status, 201, 'Student can create mentorship request');
  assert.equal(createMentorship.data.status, 'pending');
  console.log('✓ Student can request mentorship from verified alumnus');

  // 1c. Duplicate open mentorship request returns 409
  mockResponses.handler = (sql, values) => {
    if (sql.includes('FROM users u') && sql.includes('alumni_profiles p')) {
      return { rows: [{ id: 20, name: 'Alumni Twenty' }] };
    }
    if (sql.includes('SELECT id FROM mentorship_requests') && sql.includes('status IN (\'pending\',\'accepted\')')) {
      return { rows: [{ id: 101 }] }; // Duplicate found!
    }
    return { rows: [] };
  };

  const dupMentorship = await testRequest('/api/mentorship', 'POST', studentToken, {
    alumni_id: 20,
    topic: 'System Design again'
  });
  assert.equal(dupMentorship.status, 409, 'Duplicate open mentorship request returns 409');
  console.log('✓ Duplicate open mentorship request blocked with 409');

  // 1d. Cross-student authorization: student cannot view another student\'s private request
  mockResponses.handler = (sql, values) => {
    if (sql.includes('SELECT m.*') && sql.includes('WHERE m.id = $1')) {
      return { rows: [{ id: 101, student_id: 10, alumni_id: 20, topic: 'System Design', status: 'pending' }] };
    }
    return { rows: [] };
  };

  const forbiddenView = await testRequest('/api/mentorship/101', 'GET', student2Token);
  assert.equal(forbiddenView.status, 403, 'Other students cannot view another student request');
  console.log('✓ Cross-student mentorship detail access restricted (403)');

  // 1e. Alumni can view incoming requests
  mockResponses.handler = (sql, values) => {
    if (sql.includes('SELECT m.*') && sql.includes('WHERE m.alumni_id = $1')) {
      return { rows: [{ id: 101, student_id: 10, alumni_id: 20, student_name: 'Student Ten', topic: 'System Design', status: 'pending' }] };
    }
    return { rows: [] };
  };

  const alumniInbox = await testRequest('/api/mentorship', 'GET', alumniToken);
  assert.equal(alumniInbox.status, 200);
  assert.equal(alumniInbox.data.length, 1);
  assert.equal(alumniInbox.data[0].student_name, 'Student Ten');
  console.log('✓ Alumnus can view incoming scoped requests');

  // 1f. Alumnus accepts request
  mockResponses.handler = (sql, values) => {
    if (sql.includes('UPDATE mentorship_requests') && sql.includes('RETURNING *')) {
      return { rows: [{ id: 101, student_id: 10, alumni_id: 20, status: 'accepted', topic: 'System Design' }] };
    }
    return { rows: [] };
  };

  const acceptRes = await testRequest('/api/mentorship/101', 'PATCH', alumniToken, { status: 'accepted' });
  assert.equal(acceptRes.status, 200);
  assert.equal(acceptRes.data.status, 'accepted');
  console.log('✓ Alumnus can transition request from pending to accepted');

  // 1g. Alumnus completes request
  mockResponses.handler = (sql, values) => {
    if (sql.includes('UPDATE mentorship_requests') && sql.includes('RETURNING *')) {
      return { rows: [{ id: 101, student_id: 10, alumni_id: 20, status: 'completed', topic: 'System Design' }] };
    }
    return { rows: [] };
  };

  const completeRes = await testRequest('/api/mentorship/101', 'PATCH', alumniToken, { status: 'completed' });
  assert.equal(completeRes.status, 200);
  assert.equal(completeRes.data.status, 'completed');
  console.log('✓ Alumnus can transition request from accepted to completed');

  // 1h. Admin can view all mentorship requests
  mockResponses.handler = (sql, values) => {
    if (sql.includes('SELECT m.*') && sql.includes('WHERE TRUE')) {
      return { rows: [
        { id: 101, student_id: 10, alumni_id: 20, student_name: 'Student Ten', alumni_name: 'Alumni Twenty', status: 'completed' }
      ] };
    }
    return { rows: [] };
  };

  const adminMentorship = await testRequest('/api/mentorship', 'GET', adminToken);
  assert.equal(adminMentorship.status, 200);
  assert.equal(adminMentorship.data.length, 1);
  console.log('✓ Admin can view all institution-wide mentorship requests');

  // =========================================================================
    console.log('\n--- MENTORSHIP MODULE TESTS COMPLETED ---\n');
}

runTests().catch(err => { console.error(err); process.exit(1); });
