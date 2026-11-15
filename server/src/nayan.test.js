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
  // 2. Events & Registrations
  // =========================================================================
  console.log('\n[ 2 ] Events & Registrations Tests');

  // 2a. Student cannot create events
  const studentCreateEvent = await testRequest('/api/events', 'POST', studentToken, {
    title: 'Student Event',
    starts_at: new Date(Date.now() + 86400000).toISOString()
  });
  assert.equal(studentCreateEvent.status, 403, 'Students are blocked from creating events (403)');
  console.log('✓ Student is blocked from event creation (403)');

  // 2b. Past-date event creation rejected
  const pastEvent = await testRequest('/api/events', 'POST', adminToken, {
    title: 'Past Event',
    starts_at: new Date(Date.now() - 86400000).toISOString()
  });
  assert.equal(pastEvent.status, 400, 'Past-date event is rejected with 400');
  console.log('✓ Past-date event creation rejected with 400');

  // 2c. Admin creates valid future event
  mockResponses.handler = (sql, values) => {
    if (sql.includes('INSERT INTO events')) {
      return { rows: [{ id: 50, title: 'Annual Alumni Meet', venue: 'Campus Auditorium', starts_at: values[4] }] };
    }
    if (sql.includes('SELECT id FROM users WHERE id <> $1 AND status = \'active\'')) {
      return { rows: [{ id: 10 }, { id: 20 }] };
    }
    return { rows: [] };
  };

  const futureDate = new Date(Date.now() + 7 * 86400000).toISOString();
  const createEvent = await testRequest('/api/events', 'POST', adminToken, {
    title: 'Annual Alumni Meet',
    description: 'Welcome back alumni!',
    venue: 'Campus Auditorium',
    starts_at: futureDate
  });
  assert.equal(createEvent.status, 201);
  assert.equal(createEvent.data.title, 'Annual Alumni Meet');
  console.log('✓ Admin can create a valid future event');

  // 2d. Listing events with attendee count and user registration status
  mockResponses.handler = (sql, values) => {
    if (sql.includes('FROM events e') && sql.includes('JOIN users u')) {
      return { rows: [{
        id: 50,
        title: 'Annual Alumni Meet',
        created_by_name: 'Admin One',
        attendee_count: 5,
        registered: false,
        starts_at: futureDate
      }] };
    }
    return { rows: [] };
  };

  const listEvents = await testRequest('/api/events', 'GET', studentToken);
  assert.equal(listEvents.status, 200);
  assert.equal(listEvents.data[0].attendee_count, 5);
  assert.equal(listEvents.data[0].registered, false);
  console.log('✓ Event listing provides attendee count and per-user registered status');

  // 2e. Student registers for event
  mockResponses.handler = (sql, values) => {
    if (sql.includes('FROM events') && sql.includes('starts_at > NOW()')) {
      return { rows: [{ id: 50, title: 'Annual Alumni Meet', created_by: 1 }] };
    }
    if (sql.includes('FROM event_registrations') && sql.includes('event_id = $1')) {
      return { rows: [] }; // No duplicate
    }
    if (sql.includes('INSERT INTO event_registrations')) {
      return { rows: [{ id: 701, event_id: 50, user_id: 10 }] };
    }
    return { rows: [] };
  };

  const registerEvent = await testRequest('/api/events/50/register', 'POST', studentToken, {});
  assert.equal(registerEvent.status, 201);
  console.log('✓ Student can register for upcoming event');

  // 2f. Duplicate event registration rejected with 409
  mockResponses.handler = (sql, values) => {
    if (sql.includes('FROM events') && sql.includes('starts_at > NOW()')) {
      return { rows: [{ id: 50, title: 'Annual Alumni Meet', created_by: 1 }] };
    }
    if (sql.includes('FROM event_registrations') && sql.includes('event_id = $1')) {
      return { rows: [{ id: 701 }] }; // Duplicate!
    }
    return { rows: [] };
  };

  const dupRegister = await testRequest('/api/events/50/register', 'POST', studentToken, {});
  assert.equal(dupRegister.status, 409, 'Duplicate event registration returns 409');
  console.log('✓ Duplicate event registration blocked with 409');

  // =========================================================================
  // 3. User Notifications Feed
  // =========================================================================
  console.log('\n[ 3 ] Notifications Feed Tests');

  // 3a. User fetches their scoped notifications
  mockResponses.handler = (sql, values) => {
    if (sql.includes('FROM notifications') && sql.includes('WHERE user_id = $1')) {
      return { rows: [
        { id: 1, title: 'Mentorship accepted', body: 'Session confirmed', is_read: false, created_at: new Date().toISOString() },
        { id: 2, title: 'New event', body: 'Alumni meet', is_read: true, created_at: new Date(Date.now() - 3600000).toISOString() }
      ] };
    }
    return { rows: [] };
  };

  const getNotifs = await testRequest('/api/notifications', 'GET', studentToken);
  assert.equal(getNotifs.status, 200);
  assert.equal(getNotifs.data.length, 2);
  console.log('✓ Notifications scoped to user returned');

  // 3b. Unread count endpoint
  mockResponses.handler = (sql, values) => {
    if (sql.includes('FROM notifications') && sql.includes('is_read = FALSE')) {
      return { rows: [{ count: 1 }] };
    }
    return { rows: [] };
  };

  const unreadCount = await testRequest('/api/notifications/unread-count', 'GET', studentToken);
  assert.equal(unreadCount.status, 200);
  assert.equal(unreadCount.data.unreadCount, 1);
  console.log('✓ /unread-count correctly returns active unread tally');

  // 3c. Mark single notification as read
  mockResponses.handler = (sql, values) => {
    if (sql.includes('UPDATE notifications') && sql.includes('SET is_read = TRUE') && sql.includes('WHERE id = $1 AND user_id = $2')) {
      return { rows: [{ id: 1, is_read: true }] };
    }
    return { rows: [] };
  };

  const markRead = await testRequest('/api/notifications/1/read', 'PATCH', studentToken, {});
  assert.equal(markRead.status, 200);
  assert.equal(markRead.data.is_read, true);
  console.log('✓ Single notification mark as read verified');

  // 3d. Cross-user notification security: cannot mark another user\'s notification
  mockResponses.handler = (sql, values) => {
    if (sql.includes('UPDATE notifications') && sql.includes('SET is_read = TRUE') && sql.includes('WHERE id = $1 AND user_id = $2')) {
      return { rows: [] }; // Not found for this user_id
    }
    return { rows: [] };
  };

  const crossMark = await testRequest('/api/notifications/999/read', 'PATCH', studentToken, {});
  assert.equal(crossMark.status, 404, 'Cannot mark other users notification');
  console.log('✓ Cross-user notification protection verified (404)');

  // 3e. Mark all notifications as read
  mockResponses.handler = (sql, values) => {
    if (sql.includes('UPDATE notifications') && sql.includes('SET is_read = TRUE') && sql.includes('user_id = $1')) {
      return { rows: [] };
    }
    return { rows: [] };
  };

  const markAll = await testRequest('/api/notifications/mark-all-read', 'PATCH', studentToken, {});
  assert.equal(markAll.status, 200);
  console.log('✓ Mark all notifications as read verified');

  // =========================================================================
  // 4. Announcements Broadcast
  // =========================================================================
  console.log('\n[ 4 ] Announcements Tests');

  // 4a. Students blocked from posting announcements
  const studentAnn = await testRequest('/api/announcements', 'POST', studentToken, {
    title: 'Hello',
    body: 'World'
  });
  assert.equal(studentAnn.status, 403, 'Students cannot publish announcements');
  console.log('✓ Student blocked from creating announcements (403)');

  // 4b. Admin creates announcement
  mockResponses.handler = (sql, values) => {
    if (sql.includes('INSERT INTO announcements')) {
      return { rows: [{ id: 1, title: 'Campus Update', body: 'Campus open.', audience: values[3] }] };
    }
    if (sql.includes('SELECT id FROM users WHERE id <> $1')) {
      return { rows: [{ id: 10 }, { id: 20 }] };
    }
    return { rows: [] };
  };

  const createAnn = await testRequest('/api/announcements', 'POST', adminToken, {
    title: 'Campus Update',
    body: 'Campus open.',
    audience: 'all'
  });
  assert.equal(createAnn.status, 201);
  console.log('✓ Admin can publish announcements');

  // 4c. Audience filtering: student only sees 'all' or 'students'
  mockResponses.handler = (sql, values) => {
    if (sql.includes('FROM announcements a') && sql.includes('WHERE a.audience = \'all\' OR a.audience = $1')) {
      assert.equal(values[0], 'students', 'Student audience filter is "students"');
      return { rows: [{ id: 1, title: 'For Students', audience: 'students', author: 'Admin' }] };
    }
    return { rows: [] };
  };

  const studentAnns = await testRequest('/api/announcements', 'GET', studentToken);
  assert.equal(studentAnns.status, 200);
  assert.equal(studentAnns.data.length, 1);
  console.log('✓ Role-based audience filtering verified for students');

  // =========================================================================
  // 5. Donation Pledge Tracking
  // =========================================================================
  console.log('\n[ 5 ] Donation Pledge Tracking Tests');

  // 5a. Student cannot create pledge
  const studentPledge = await testRequest('/api/donation-pledges', 'POST', studentToken, {
    amount: 1000,
    purpose: 'Scholarships'
  });
  assert.equal(studentPledge.status, 403, 'Student cannot submit donation pledge (403)');
  console.log('✓ Student blocked from submitting donation pledges (403)');

  // 5b. Invalid / zero amount rejected
  const zeroPledge = await testRequest('/api/donation-pledges', 'POST', alumniToken, {
    amount: 0,
    purpose: 'Scholarships'
  });
  assert.equal(zeroPledge.status, 400, 'Zero amount pledge is rejected with 400');
  console.log('✓ Invalid amount pledge rejected with 400');

  // 5c. Alumni creates donation pledge
  mockResponses.handler = (sql, values) => {
    if (sql.includes('INSERT INTO donation_pledges')) {
      return { rows: [{ id: 801, alumni_id: 20, amount: '5000.00', purpose: 'Robotics Lab', status: 'interested' }] };
    }
    if (sql.includes('SELECT id FROM users WHERE role = \'admin\' AND status = \'active\'')) {
      return { rows: [{ id: 1 }] };
    }
    return { rows: [] };
  };

  const createPledge = await testRequest('/api/donation-pledges', 'POST', alumniToken, {
    amount: 5000,
    purpose: 'Robotics Lab',
    note: 'Pledged support.'
  });
  assert.equal(createPledge.status, 201);
  assert.equal(createPledge.data.status, 'interested');
  console.log('✓ Alumni can submit donation pledge expression of interest');

  // 5d. Alumni can view their own pledges via /mine
  mockResponses.handler = (sql, values) => {
    if (sql.includes('FROM donation_pledges') && sql.includes('alumni_id = $1')) {
      return { rows: [{ id: 801, amount: '5000.00', purpose: 'Robotics Lab', status: 'interested' }] };
    }
    return { rows: [] };
  };

  const myPledges = await testRequest('/api/donation-pledges/mine', 'GET', alumniToken);
  assert.equal(myPledges.status, 200);
  assert.equal(myPledges.data.length, 1);
  console.log('✓ Alumni can view their own pledge history via /mine');

  // 5e. Admin can list all pledges
  mockResponses.handler = (sql, values) => {
    if (sql.includes('FROM donation_pledges d') && sql.includes('JOIN users u')) {
      return { rows: [{ id: 801, alumni_name: 'Alumni Twenty', amount: '5000.00', status: 'interested' }] };
    }
    return { rows: [] };
  };

  const adminPledges = await testRequest('/api/donation-pledges', 'GET', adminToken);
  assert.equal(adminPledges.status, 200);
  assert.equal(adminPledges.data.length, 1);
  console.log('✓ Admin can list all community donation pledges');

  // 5f. Admin updates pledge follow-up status
  mockResponses.handler = (sql, values) => {
    if (sql.includes('UPDATE donation_pledges') && sql.includes('status = $1') && sql.includes('WHERE id = $2')) {
      return { rows: [{ id: 801, status: values[0] }] };
    }
    return { rows: [] };
  };

  const updatePledge = await testRequest('/api/donation-pledges/801', 'PATCH', adminToken, { status: 'contacted' });
  assert.equal(updatePledge.status, 200);
  assert.equal(updatePledge.data.status, 'contacted');
  console.log('✓ Admin can update pledge status to contacted or fulfilled');

  // =========================================================================
  // 6. Admin Permissions, Approvals & Reporting
  // =========================================================================
  console.log('\n[ 6 ] Admin Approvals & Reporting Tests');

  // 6a. Admin user listing
  mockResponses.handler = (sql, values) => {
    if (sql.includes('FROM users u LEFT JOIN alumni_profiles p')) {
      return { rows: [
        { id: 21, name: 'Alumni Pending', role: 'alumni', status: 'pending', is_verified: false },
        { id: 20, name: 'Alumni Twenty', role: 'alumni', status: 'active', is_verified: true }
      ] };
    }
    return { rows: [] };
  };

  const adminUsers = await testRequest('/api/admin/users', 'GET', adminToken);
  assert.equal(adminUsers.status, 200);
  assert.equal(adminUsers.data.length, 2);
  console.log('✓ Admin user listing returns pending and active members');

  // 6b. Admin alumni verification approval
  mockResponses.clientHandler = (sql, values) => {
    if (sql.includes('SELECT id,role,status FROM users WHERE id=$1')) {
      return { rows: [{ id: 21, role: 'alumni', status: 'pending' }] };
    }
    if (sql.includes('UPDATE alumni_profiles SET is_verified=$1')) {
      return { rows: [] };
    }
    if (sql.includes('UPDATE users SET status=$1 WHERE id=$2')) {
      return { rows: [] };
    }
    return { rows: [] };
  };

  const approveRes = await testRequest('/api/admin/users/21/verification', 'PATCH', adminToken, {
    decision: 'approve',
    notes: 'Graduation verified'
  });
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.data.status, 'active');
  console.log('✓ Admin atomic alumni verification approval verified');

  // 6c. Aggregated Institutional Reports
  mockResponses.handler = (sql, values) => {
    if (sql.includes('FROM users GROUP BY role')) {
      return { rows: [{ role: 'student', count: 10 }, { role: 'alumni', count: 5 }] };
    }
    if (sql.includes('FROM mentorship_requests GROUP BY status')) {
      return { rows: [{ status: 'accepted', count: 4 }] };
    }
    if (sql.includes('FROM opportunities GROUP BY type')) {
      return { rows: [{ type: 'internship', count: 3 }] };
    }
    if (sql.includes('FROM event_registrations')) {
      return { rows: [{ registrations: 12 }] };
    }
    if (sql.includes('FROM donation_pledges GROUP BY status')) {
      return { rows: [{ status: 'interested', count: 2, amount: '10000.00' }] };
    }
    if (sql.includes('FROM career_history')) {
      return { rows: [{ count: 8 }] };
    }
    return { rows: [] };
  };

  const reports = await testRequest('/api/admin/reports', 'GET', adminToken);
  assert.equal(reports.status, 200);
  assert.equal(reports.data.eventRegistrations, 12);
  assert.equal(reports.data.careerEntries, 8);
  assert.equal(reports.data.mentorshipByStatus.length, 1);
  assert.equal(reports.data.pledgesByStatus.length, 1);
  console.log('✓ Admin reports aggregated metrics across mentorship, events, donations and operations verified');

  console.log('\n--- ALL NAYAN JYOTI ENGAGEMENT & OPERATIONS TESTS PASSED SUCCESSFULLY! ---\n');
}

runTests().catch((err) => {
  console.error('\n✗ TEST RUN FAILED:', err);
  process.exit(1);
});
