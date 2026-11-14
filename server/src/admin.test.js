import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import adminRoutes from './routes/admin.js';
import { pool } from './db.js';

const app = express();
app.use(express.json());

const JWT_SECRET = 'test-secret-key-admin-suite';
process.env.JWT_SECRET = JWT_SECRET;

app.use('/api/admin', adminRoutes);

// Mock in-memory state
const users = [
  { id: 1, name: 'Admin One', email: 'admin1@alumniconnect.test', role: 'admin', status: 'active' },
  { id: 2, name: 'Student One', email: 'student1@alumniconnect.test', role: 'student', status: 'active' },
  { id: 3, name: 'Alumni Pending', email: 'alumni.pending@alumniconnect.test', role: 'alumni', status: 'pending' },
  { id: 4, name: 'Alumni Active', email: 'alumni.active@alumniconnect.test', role: 'alumni', status: 'active' }
];

const alumniProfiles = [
  { id: 1, user_id: 3, graduation_year: 2024, department: 'CS', company: 'Google', is_verified: false, verification_notes: '' },
  { id: 2, user_id: 4, graduation_year: 2021, department: 'ECE', company: 'Microsoft', is_verified: true, verification_notes: '' }
];

const notifications = [];

const makeToken = (user) => jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
const adminToken = makeToken({ id: 1, name: 'Admin One', role: 'admin', status: 'active' });
const studentToken = makeToken({ id: 2, name: 'Student One', role: 'student', status: 'active' });

// Mock DB client for transactions
const mockClient = {
  query: async (sql, values = []) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return {};
    if (sql.includes('SELECT id,role,status FROM users WHERE id=$1')) {
      const u = users.find(x => x.id === Number(values[0]));
      return { rows: u ? [{ id: u.id, role: u.role, status: u.status }] : [] };
    }
    if (sql.includes('UPDATE alumni_profiles SET is_verified=$1,verification_notes=$2,updated_at=NOW() WHERE user_id=$3')) {
      const p = alumniProfiles.find(x => x.user_id === Number(values[2]));
      if (p) {
        p.is_verified = Boolean(values[0]);
        p.verification_notes = values[1];
      }
      return { rows: [] };
    }
    if (sql.includes('UPDATE users SET status=$1 WHERE id=$2')) {
      const u = users.find(x => x.id === Number(values[1]));
      if (u) u.status = values[0];
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO notifications')) {
      notifications.push(values);
      return { rows: [] };
    }
    return { rows: [] };
  },
  release: () => {}
};

pool.connect = async () => mockClient;

pool.query = async (sql, values = []) => {
  if (sql.includes('SELECT status FROM users WHERE id=$1')) {
    const u = users.find(x => x.id === Number(values[0]));
    return { rows: u ? [{ status: u.status }] : [] };
  }
  if (sql.includes('SELECT u.id,u.name,u.email,u.role,u.status,u.created_at,p.graduation_year')) {
    return {
      rows: users.map(u => {
        const p = alumniProfiles.find(x => x.user_id === u.id);
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          created_at: new Date().toISOString(),
          graduation_year: p?.graduation_year || null,
          department: p?.department || null,
          company: p?.company || null,
          is_verified: p?.is_verified || false
        };
      })
    };
  }
  if (sql.includes("SELECT u.id,u.name,u.email,u.role,u.status,p.is_verified FROM users u LEFT JOIN alumni_profiles p")) {
    const u = users.find(x => x.id === Number(values[0]) && x.role !== 'admin');
    if (!u) return { rows: [] };
    const p = alumniProfiles.find(x => x.user_id === u.id);
    return {
      rows: [{
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        is_verified: p ? p.is_verified : false
      }]
    };
  }
  if (sql.includes("UPDATE users SET status=$1 WHERE id=$2 AND role<>'admin'")) {
    const u = users.find(x => x.id === Number(values[1]) && x.role !== 'admin');
    if (u) {
      u.status = values[0];
      return { rows: [{ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status }] };
    }
    return { rows: [] };
  }
  if (sql.includes('SELECT role,COUNT(*)::int AS count FROM users GROUP BY role')) {
    return { rows: [{ role: 'admin', count: 1 }, { role: 'student', count: 1 }, { role: 'alumni', count: 2 }] };
  }
  if (sql.includes('SELECT status,COUNT(*)::int AS count FROM mentorship_requests')) {
    return { rows: [{ status: 'pending', count: 2 }, { status: 'accepted', count: 1 }] };
  }
  if (sql.includes('SELECT type,COUNT(*)::int AS count FROM opportunities')) {
    return { rows: [{ type: 'internship', count: 3 }, { type: 'job', count: 2 }] };
  }
  if (sql.includes('SELECT COUNT(*)::int AS registrations FROM event_registrations')) {
    return { rows: [{ registrations: 8 }] };
  }
  if (sql.includes('SELECT status,COUNT(*)::int AS count,COALESCE(SUM(amount),0)::numeric AS amount FROM donation_pledges')) {
    return { rows: [{ status: 'interested', count: 2, amount: '5000' }, { status: 'fulfilled', count: 1, amount: '2500' }] };
  }
  if (sql.includes('SELECT COUNT(*)::int AS count FROM career_history')) {
    return { rows: [{ count: 12 }] };
  }
  if (sql.includes('SELECT u.name,u.email,p.graduation_year,p.department,p.degree,p.company,p.job_title,p.location,p.is_verified FROM users u JOIN alumni_profiles p')) {
    return {
      rows: [
        { name: 'Alumni Active', email: 'alumni.active@alumniconnect.test', graduation_year: 2021, department: 'ECE', degree: 'B.Tech', company: 'Microsoft', job_title: 'SDE', location: 'Bengaluru', is_verified: true }
      ]
    };
  }
  return { rows: [] };
};

// Dispatch helper
async function testRequest(path, method = 'GET', token = null, body = null) {
  return new Promise(resolve => {
    const req = {
      method,
      url: path,
      originalUrl: path,
      path: path.replace(/^\/api\/admin/, '') || '/',
      headers: {
        ...(token ? { authorization: 'Bearer ' + token } : {}),
        'content-type': 'application/json'
      },
      body: body || {}
    };

    const res = {
      statusCode: 200,
      headers: {},
      status(code) { this.statusCode = code; return this; },
      setHeader(k, v) { this.headers[k] = v; return this; },
      json(data) { resolve({ status: this.statusCode, data }); },
      send(data) { resolve({ status: this.statusCode, data }); },
      type() { return this; },
      attachment() { return this; }
    };

    app.handle(req, res, err => {
      if (err) resolve({ status: 500, error: err.message });
      else resolve({ status: 404, data: { message: 'Not found' } });
    });
  });
}

async function runTests() {
  console.log('--- RUNNING ADMIN INTEGRATION TESTS ---');

  // 1. Student access to /api/admin is forbidden
  const studentBlocked = await testRequest('/api/admin/users', 'GET', studentToken);
  assert.equal(studentBlocked.status, 403, 'Students are blocked from admin user management');
  console.log('✓ Student RBAC protection on admin routes verified');

  // 2. Admin can list users
  const userList = await testRequest('/api/admin/users', 'GET', adminToken);
  assert.equal(userList.status, 200, 'Admin can list users');
  assert.equal(userList.data.length, 4, 'Returns all users');
  assert.ok(userList.data.some(u => u.status === 'pending'), 'Pending alumni are listed');
  console.log('✓ Admin user listing verified');

  // 3. Admin cannot suspend self
  const selfSuspend = await testRequest('/api/admin/users/1/status', 'PATCH', adminToken, { status: 'suspended' });
  assert.equal(selfSuspend.status, 400, 'Admin cannot suspend own account');
  console.log('✓ Admin self-suspension guard verified');

  // 4. Admin can suspend eligible student/alumni
  const suspendStudent = await testRequest('/api/admin/users/2/status', 'PATCH', adminToken, { status: 'suspended' });
  assert.equal(suspendStudent.status, 200, 'Student account suspended');
  assert.equal(suspendStudent.data.status, 'suspended');

  const reactivateStudent = await testRequest('/api/admin/users/2/status', 'PATCH', adminToken, { status: 'active' });
  assert.equal(reactivateStudent.status, 200, 'Student account reactivated');
  assert.equal(reactivateStudent.data.status, 'active');
  console.log('✓ Admin user suspension and reactivation lifecycle verified');

  // 4b. Security Regression: Unverified alumni CANNOT be activated via generic status endpoint
  const activateUnverifiedAlumni = await testRequest('/api/admin/users/3/status', 'PATCH', adminToken, { status: 'active' });
  assert.equal(activateUnverifiedAlumni.status, 400, 'Unverified alumni activation via generic status endpoint must be blocked (HTTP 400)');
  assert.match(activateUnverifiedAlumni.data.message, /verification approval/i);

  // Verified alumni (id: 4, is_verified: true) can be suspended and reactivated normally
  const suspendVerifiedAlumni = await testRequest('/api/admin/users/4/status', 'PATCH', adminToken, { status: 'suspended' });
  assert.equal(suspendVerifiedAlumni.status, 200, 'Verified alumni can be suspended');
  assert.equal(suspendVerifiedAlumni.data.status, 'suspended');

  const reactivateVerifiedAlumni = await testRequest('/api/admin/users/4/status', 'PATCH', adminToken, { status: 'active' });
  assert.equal(reactivateVerifiedAlumni.status, 200, 'Verified alumni can be reactivated');
  assert.equal(reactivateVerifiedAlumni.data.status, 'active');
  console.log('✓ Security check: unverified alumni activation guard & verified alumni lifecycle verified');

  // 5. Admin can verify alumni (atomic transaction)
  const approveAlumni = await testRequest('/api/admin/users/3/verification', 'PATCH', adminToken, {
    decision: 'approve',
    notes: 'Verified via graduation records 2024'
  });
  assert.equal(approveAlumni.status, 200, 'Alumni verification approved');
  const pendingUser = users.find(u => u.id === 3);
  assert.equal(pendingUser.status, 'active', 'Alumni user status is now active');
  const pendingProfile = alumniProfiles.find(p => p.user_id === 3);
  assert.equal(pendingProfile.is_verified, true, 'Alumni profile is_verified set to true');
  assert.ok(notifications.length > 0, 'Notification sent to approved alumni');
  console.log('✓ Atomic alumni approval transaction & notification verified');

  // 6. Admin Reports API
  const reports = await testRequest('/api/admin/reports', 'GET', adminToken);
  assert.equal(reports.status, 200, 'Reports API returns 200');
  assert.equal(reports.data.eventRegistrations, 8);
  assert.equal(reports.data.careerEntries, 12);
  assert.equal(reports.data.usersByRole.length, 3);
  console.log('✓ Institution reports aggregated metrics verified');

  // 7. Admin Alumni CSV Export
  const csvExport = await testRequest('/api/admin/alumni.csv', 'GET', adminToken);
  assert.equal(csvExport.status, 200, 'CSV export returns 200');
  assert.match(csvExport.data, /Graduation Year/);
  assert.match(csvExport.data, /Alumni Active/);
  console.log('✓ Alumni CSV export verified');

  console.log('\n--- ALL ADMIN INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

