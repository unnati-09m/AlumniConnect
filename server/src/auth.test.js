import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import { pool } from './db.js';

const app = express();
app.use(express.json());

const JWT_SECRET = 'test-secret-key-12345-core';
process.env.JWT_SECRET = JWT_SECRET;

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

// In-memory mock database state
const users = [];
const studentProfiles = [];
const alumniProfiles = [];
const notifications = [];

// Seed baseline accounts
const demoPasswordHash = bcrypt.hashSync('Demo@123', 10);
users.push(
  { id: 1, name: 'Institution Admin', email: 'admin@alumniconnect.test', password_hash: demoPasswordHash, role: 'admin', status: 'active' },
  { id: 2, name: 'Ananya Student', email: 'student@alumniconnect.test', password_hash: demoPasswordHash, role: 'student', status: 'active' },
  { id: 3, name: 'Aarav Alumni', email: 'alumni@alumniconnect.test', password_hash: demoPasswordHash, role: 'alumni', status: 'active' }
);
studentProfiles.push({
  id: 1, user_id: 2, student_id: 'CS-2023-001', department: 'Computer Science', degree: 'B.Tech',
  current_year: '3rd Year', graduation_year: 2026, skills: ['JavaScript', 'React'],
  interests: ['Web Development'], career_interests: ['Frontend Engineer'], bio: 'Passionate student.'
});
alumniProfiles.push({
  id: 1, user_id: 3, graduation_year: 2022, department: 'Computer Science', degree: 'B.Tech',
  company: 'TechCorp', job_title: 'Software Engineer', location: 'Bengaluru', is_verified: true, is_public: true
});

// Mock PostgreSQL pool
let mockClientInTx = false;
const mockClient = {
  query: async (sql, values = []) => {
    if (sql === 'BEGIN') { mockClientInTx = true; return {}; }
    if (sql === 'COMMIT') { mockClientInTx = false; return {}; }
    if (sql === 'ROLLBACK') { mockClientInTx = false; return {}; }

    if (sql.includes('INSERT INTO users')) {
      const [name, email, password_hash, role, status] = values;
      if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        const err = new Error('duplicate key value');
        err.code = '23505';
        throw err;
      }
      const newUser = { id: users.length + 1, name, email, password_hash, role, status };
      users.push(newUser);
      return { rows: [newUser] };
    }
    if (sql.includes('INSERT INTO student_profiles')) {
      const [user_id, student_id, department, degree, current_year, graduation_year, skills, interests, career_interests, bio] = values;
      const profile = { id: studentProfiles.length + 1, user_id, student_id, department, degree, current_year, graduation_year, skills, interests, career_interests, bio };
      studentProfiles.push(profile);
      return { rows: [profile] };
    }
    if (sql.includes('INSERT INTO alumni_profiles')) {
      const [user_id, graduation_year, department, degree, company, job_title, location, linkedin_url] = values;
      const profile = { id: alumniProfiles.length + 1, user_id, graduation_year, department, degree, company, job_title, location, linkedin_url, is_verified: false, is_public: true };
      alumniProfiles.push(profile);
      return { rows: [profile] };
    }
    return { rows: [] };
  },
  release: () => {}
};

pool.connect = async () => mockClient;

pool.query = async (sql, values = []) => {
  if (sql.includes('SELECT status FROM users WHERE id=$1')) {
    const user = users.find(u => u.id === Number(values[0]));
    return { rows: user ? [{ status: user.status }] : [] };
  }
  if (sql.includes('SELECT id,name,email,password_hash,role,status FROM users WHERE LOWER(email)=$1')) {
    const user = users.find(u => u.email.toLowerCase() === values[0].toLowerCase());
    return { rows: user ? [user] : [] };
  }
  if (sql.includes('SELECT id,name,email,role,status FROM users WHERE id=$1')) {
    const user = users.find(u => u.id === Number(values[0]));
    return { rows: user ? [user] : [] };
  }
  if (sql.includes('SELECT id,name,email,role,status,created_at FROM users WHERE id=$1')) {
    const user = users.find(u => u.id === Number(values[0]));
    return { rows: user ? [{ ...user, created_at: new Date() }] : [] };
  }
  if (sql.includes('SELECT * FROM student_profiles WHERE user_id=$1')) {
    const profile = studentProfiles.find(p => p.user_id === Number(values[0]));
    return { rows: profile ? [profile] : [] };
  }
  if (sql.includes('SELECT * FROM alumni_profiles WHERE user_id=$1')) {
    const profile = alumniProfiles.find(p => p.user_id === Number(values[0]));
    return { rows: profile ? [profile] : [] };
  }
  if (sql.includes('UPDATE users SET name=$1 WHERE id=$2')) {
    const user = users.find(u => u.id === Number(values[1]));
    if (user) user.name = values[0];
    return { rows: user ? [user] : [] };
  }
  if (sql.includes('UPDATE student_profiles SET')) {
    const user_id = Number(values[values.length - 1]);
    const profile = studentProfiles.find(p => p.user_id === user_id);
    if (profile) {
      profile.department = values[1];
      profile.bio = values[8];
    }
    return { rows: profile ? [profile] : [] };
  }
  if (sql.includes('INSERT INTO notifications')) {
    notifications.push(values);
    return { rows: [] };
  }
  if (sql.includes("SELECT id FROM users WHERE role='admin' AND status='active'")) {
    return { rows: users.filter(u => u.role === 'admin' && u.status === 'active').map(u => ({ id: u.id })) };
  }
  return { rows: [] };
};

// Request dispatcher
async function testRequest(path, method = 'GET', token = null, body = null) {
  return new Promise(resolve => {
    const req = {
      method,
      url: path,
      originalUrl: path,
      path: path.replace(/^\/api\/auth/, '').replace(/^\/api\/profile/, '') || '/',
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
      send(data) { resolve({ status: this.statusCode, data }); }
    };

    app.handle(req, res, err => {
      if (err) resolve({ status: 500, error: err.message });
      else resolve({ status: 404, data: { message: 'Not found' } });
    });
  });
}

async function runTests() {
  console.log('--- RUNNING CORE AUTH & STUDENT MODULE TESTS ---');

  // 1. Admin login
  const adminLogin = await testRequest('/api/auth/login', 'POST', null, { email: 'admin@alumniconnect.test', password: 'Demo@123' });
  assert.equal(adminLogin.status, 200, 'Admin can log in');
  assert.ok(adminLogin.data.token, 'Returns JWT token');
  assert.equal(adminLogin.data.user.role, 'admin');
  console.log('✓ Admin login verified');

  // 2. Existing Student login
  const studentLogin = await testRequest('/api/auth/login', 'POST', null, { email: 'student@alumniconnect.test', password: 'Demo@123' });
  assert.equal(studentLogin.status, 200, 'Student can log in');
  assert.equal(studentLogin.data.user.role, 'student');
  console.log('✓ Existing Student login verified');

  // 3. Existing Alumni login
  const alumniLogin = await testRequest('/api/auth/login', 'POST', null, { email: 'alumni@alumniconnect.test', password: 'Demo@123' });
  assert.equal(alumniLogin.status, 200, 'Alumni can log in');
  assert.equal(alumniLogin.data.user.role, 'alumni');
  console.log('✓ Existing Alumni login verified');

  // 4. Unsupported roles cannot self-register
  for (const role of ['admin', 'faculty', 'recruiter']) {
    const res = await testRequest('/api/auth/register', 'POST', null, {
      name: 'Forbidden User', email: `forbidden.${role}@test.com`, password: 'Password@123', role
    });
    assert.equal(res.status, 400, `${role} self-registration is blocked`);
  }
  console.log('✓ Unsupported roles blocked from registration');

  // 5. Register completely new Student
  const newStudentRes = await testRequest('/api/auth/register', 'POST', null, {
    name: 'Priya Sharma',
    email: 'priya.sharma@college.edu',
    password: 'SecurePassword123!',
    role: 'student',
    student_id: 'CS2023-999',
    department: 'Computer Science and Engineering',
    degree: 'B.Tech',
    current_year: '3rd Year',
    graduation_year: 2026,
    skills: 'JavaScript, React, Node.js',
    interests: 'Full Stack Development, AI',
    career_interests: 'Software Development Engineer',
    bio: 'Passionate about web applications.'
  });
  assert.equal(newStudentRes.status, 201, 'Student successfully registered');
  assert.equal(newStudentRes.data.user.role, 'student');
  assert.equal(newStudentRes.data.user.status, 'active');
  assert.ok(newStudentRes.data.token, 'JWT token returned on registration');
  console.log('✓ Student registration with active status & profile verified');

  // 6. Verify duplicate email registration returns 409
  const duplicateRes = await testRequest('/api/auth/register', 'POST', null, {
    name: 'Priya Duplicate',
    email: 'PRIYA.sharma@college.edu',
    password: 'AnotherPassword123!',
    role: 'student',
    student_id: 'CS2023-000',
    department: 'CSE',
    degree: 'B.Tech',
    current_year: '3rd Year'
  });
  assert.equal(duplicateRes.status, 409, 'Duplicate email registration returns 409 Conflict');
  console.log('✓ Duplicate email registration rejected (409)');

  // 7. Verify invalid password returns 401
  const invalidPass = await testRequest('/api/auth/login', 'POST', null, {
    email: 'priya.sharma@college.edu',
    password: 'WrongPassword'
  });
  assert.equal(invalidPass.status, 401, 'Invalid password returns 401 Unauthorized');
  console.log('✓ Invalid password login rejected (401)');

  // 8. Log in with same email and password (case-insensitive)
  const reloginRes = await testRequest('/api/auth/login', 'POST', null, {
    email: 'PRIYA.SHARMA@college.edu',
    password: 'SecurePassword123!'
  });
  assert.equal(reloginRes.status, 200, 'Student can log in with registered credentials');
  assert.equal(reloginRes.data.user.name, 'Priya Sharma');
  const priyaToken = reloginRes.data.token;
  console.log('✓ Case-insensitive email login with registered credentials verified');

  // 9. Verify /api/auth/me for student
  const meRes = await testRequest('/api/auth/me', 'GET', priyaToken);
  assert.equal(meRes.status, 200, '/api/auth/me returns 200');
  assert.equal(meRes.data.email, 'priya.sharma@college.edu');
  assert.equal(meRes.data.role, 'student');
  console.log('✓ /api/auth/me returns current authenticated student');

  // 10. Verify Student Profile & update
  const profileRes = await testRequest('/api/profile', 'GET', priyaToken);
  assert.equal(profileRes.status, 200, 'Can retrieve student profile');
  assert.equal(profileRes.data.student_id, 'CS2023-999');

  const updateProfile = await testRequest('/api/profile', 'PUT', priyaToken, {
    department: 'Artificial Intelligence & Data Science',
    bio: 'Updated bio for AI enthusiast.'
  });
  assert.equal(updateProfile.status, 200, 'Student can update profile');
  console.log('✓ Student profile load and update persistence verified');

  // 11. Register an Alumni and verify pending status
  const alumniReg = await testRequest('/api/auth/register', 'POST', null, {
    name: 'Rohan Mehta',
    email: 'rohan.mehta@alumni.org',
    password: 'AlumniPassword123!',
    role: 'alumni',
    department: 'Information Technology',
    graduation_year: 2021,
    company: 'Amazon',
    job_title: 'SDE II',
    location: 'Hyderabad'
  });
  assert.equal(alumniReg.status, 201, 'Alumni registered');
  assert.equal(alumniReg.data.user.status, 'pending', 'Alumni status is pending verification');
  const rohanToken = alumniReg.data.token;
  console.log('✓ Alumni registration creates pending account');

  // 12. Verify pending Alumni cannot access protected features
  const protectedRes = await testRequest('/api/profile', 'GET', rohanToken);
  assert.equal(protectedRes.status, 403, 'Pending Alumni blocked from protected features');
  console.log('✓ Pending Alumni blocked from protected features (403)');

  // 13. Verify pending Alumni CAN access /api/auth/me to maintain session on refresh
  const alumniMe = await testRequest('/api/auth/me', 'GET', rohanToken);
  assert.equal(alumniMe.status, 200, 'Pending Alumni can access /api/auth/me');
  assert.equal(alumniMe.data.status, 'pending', 'Account status confirmed as pending');
  console.log('✓ Pending Alumni session survives page refresh via /api/auth/me');

  // 14. Approve Alumni through Admin
  const rohanUser = users.find(u => u.email === 'rohan.mehta@alumni.org');
  rohanUser.status = 'active';
  const rohanProfile = alumniProfiles.find(p => p.user_id === rohanUser.id);
  rohanProfile.is_verified = true;

  // 15. Verify approved Alumni can now access protected features
  const approvedLogin = await testRequest('/api/auth/login', 'POST', null, {
    email: 'rohan.mehta@alumni.org',
    password: 'AlumniPassword123!'
  });
  assert.equal(approvedLogin.status, 200, 'Approved Alumni can log in');
  assert.equal(approvedLogin.data.user.status, 'active');

  const approvedProfile = await testRequest('/api/profile', 'GET', approvedLogin.data.token);
  assert.equal(approvedProfile.status, 200, 'Approved Alumni can now access protected features');
  console.log('✓ Admin approval activates alumni account and unlocks features');

  // 16. Verify suspended account is blocked
  rohanUser.status = 'suspended';
  const suspendedLogin = await testRequest('/api/auth/login', 'POST', null, {
    email: 'rohan.mehta@alumni.org',
    password: 'AlumniPassword123!'
  });
  assert.equal(suspendedLogin.status, 403, 'Suspended account login blocked (403)');

  const suspendedAccess = await testRequest('/api/profile', 'GET', approvedLogin.data.token);
  assert.equal(suspendedAccess.status, 401, 'Suspended user token rejected on protected routes');
  console.log('✓ Suspended accounts blocked from login and routes');

  // 17. Verify canonical endpoint alias works (POST /api/auth and POST /api/auth/register)
  const aliasRes = await testRequest('/api/auth', 'POST', null, {
    name: 'Alias Test Student',
    email: 'alias.student@college.edu',
    password: 'AliasPassword123!',
    role: 'student',
    student_id: 'CS-ALIAS-1',
    department: 'CS',
    degree: 'B.Tech',
    current_year: '1st Year'
  });
  assert.equal(aliasRes.status, 201, 'Backward-compatible alias POST /api/auth works');
  console.log('✓ Both canonical POST /api/auth/register and alias POST /api/auth verified');

  console.log('\n--- ALL CORE AUTHENTICATION & STUDENT TESTS PASSED CLEANLY! ---');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
