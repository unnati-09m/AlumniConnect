import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import alumniRoutes from './routes/alumni.js';
import careerRoutes from './routes/career.js';
import opportunitiesRoutes from './routes/opportunities.js';
import { pool } from './db.js';

// Setup test app with mocked pool
const app = express();
app.use(express.json());

const JWT_SECRET = 'test-secret-key-12345';
process.env.JWT_SECRET = JWT_SECRET;

const makeToken = (user) => jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });

const studentUser = { id: 10, name: 'Test Student', email: 'student@test.com', role: 'student', status: 'active' };
const alumniUser = { id: 20, name: 'Test Alumni', email: 'alumni@test.com', role: 'alumni', status: 'active' };
const adminUser = { id: 30, name: 'Test Admin', email: 'admin@test.com', role: 'admin', status: 'active' };

const studentToken = makeToken(studentUser);
const alumniToken = makeToken(alumniUser);
const adminToken = makeToken(adminUser);

app.use('/api/alumni', alumniRoutes);
app.use('/api/career-history', careerRoutes);
app.use('/api/opportunities', opportunitiesRoutes);
app.use('/api', opportunitiesRoutes); // mount aliases

// Mock pool.query
let mockQueries = [];
let mockResponses = {};

const originalQuery = pool.query;
pool.query = async (sql, values = []) => {
  mockQueries.push({ sql, values });
  if (sql.includes('SELECT status FROM users WHERE id=$1')) {
    if (mockResponses.userStatus) {
      return { rows: [{ status: mockResponses.userStatus }] };
    }
    return { rows: [{ status: 'active' }] };
  }
  if (typeof mockResponses.handler === 'function') {
    const res = mockResponses.handler(sql, values);
    if (res !== undefined) return res;
  }
  return { rows: [] };
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
  console.log('--- RUNNING ARSHIYAN MODULE VERIFICATION TESTS ---');

  // 1. Alumni Directory listing
  mockResponses.handler = (sql, values) => {
    if (sql.includes('FROM alumni_profiles')) {
      return {
        rows: [
          { id: 20, name: 'Test Alumni', department: 'Computer Science', graduation_year: 2022, company: 'Google', job_title: 'SWE', is_verified: true, is_public: true }
        ]
      };
    }
    return { rows: [] };
  };

  const dirRes = await testRequest('/api/alumni?department=Computer%20Science', 'GET', studentToken);
  assert.equal(dirRes.status, 200, 'Alumni directory returns 200');
  assert.equal(dirRes.data.length, 1, 'Returns matching alumni');
  assert.equal(dirRes.data[0].name, 'Test Alumni');
  console.log('✓ Alumni Directory listing & filter passed');

  // 2. Alumni Profile by ID
  mockResponses.handler = (sql, values) => {
    if (sql.includes('WHERE u.id=$1')) {
      return {
        rows: [{ id: 20, name: 'Test Alumni', email: 'alumni@test.com', graduation_year: 2022, department: 'Computer Science', company: 'Google', job_title: 'SWE', is_verified: true, is_public: true }]
      };
    }
    if (sql.includes('FROM career_history WHERE alumni_id=$1')) {
      return {
        rows: [{ id: 101, company: 'Google', job_title: 'SWE', start_date: '2022-01-01', is_current: true }]
      };
    }
    return { rows: [] };
  };

  const profileRes = await testRequest('/api/alumni/20', 'GET', studentToken);
  assert.equal(profileRes.status, 200, 'Alumni profile details returns 200');
  assert.equal(profileRes.data.career_history.length, 1, 'Includes career history');
  console.log('✓ Alumni Profile detailed view passed');

  // 3. Admin CSV Export
  mockResponses.handler = (sql, values) => {
    if (sql.includes('SELECT u.name,u.email,p.graduation_year')) {
      return {
        rows: [{ name: 'Test Alumni', email: 'alumni@test.com', graduation_year: 2022, department: 'CS', degree: 'B.Tech', company: 'Google', job_title: 'SWE', location: 'Pune', is_verified: true }]
      };
    }
    return { rows: [] };
  };

  const csvAdmin = await testRequest('/api/alumni/export/csv', 'GET', adminToken);
  assert.equal(csvAdmin.status, 200, 'Admin can export CSV');
  assert.match(csvAdmin.data, /Graduation Year/, 'Contains CSV header');
  assert.match(csvAdmin.data, /Test Alumni/, 'Contains alumni data');

  const csvStudent = await testRequest('/api/alumni/export/csv', 'GET', studentToken);
  assert.equal(csvStudent.status, 403, 'Non-admin cannot export CSV');
  console.log('✓ Admin CSV export & role permission check passed');

  // 4. Career History (POST, PUT, DELETE, GET by alumni ID)
  mockResponses.handler = (sql, values) => {
    if (sql.includes('INSERT INTO career_history')) {
      return { rows: [{ id: 102, alumni_id: 20, company: 'Amazon', job_title: 'SDE-1' }] };
    }
    if (sql.includes('UPDATE career_history')) {
      return { rows: [{ id: 102, alumni_id: 20, company: 'Amazon', job_title: 'SDE-2' }] };
    }
    if (sql.includes('DELETE FROM career_history')) {
      return { rows: [{ id: 102 }] };
    }
    if (sql.includes('SELECT p.is_public, p.is_verified, u.status')) {
      return { rows: [{ is_public: true, is_verified: true, status: 'active' }] };
    }
    if (sql.includes('FROM career_history WHERE alumni_id=$1')) {
      return { rows: [{ id: 102, company: 'Amazon', job_title: 'SDE-2' }] };
    }
    return { rows: [] };
  };

  const postCareer = await testRequest('/api/career-history', 'POST', alumniToken, {
    company: 'Amazon', job_title: 'SDE-1', start_date: '2023-01-01', is_current: true
  });
  assert.equal(postCareer.status, 201, 'Alumni can add career entry');

  const putCareer = await testRequest('/api/career-history/102', 'PUT', alumniToken, {
    company: 'Amazon', job_title: 'SDE-2', start_date: '2023-01-01', is_current: true
  });
  assert.equal(putCareer.status, 200, 'Alumni can update career entry');
  assert.equal(putCareer.data.job_title, 'SDE-2');

  const getPublicCareer = await testRequest('/api/career-history/alumni/20', 'GET', studentToken);
  assert.equal(getPublicCareer.status, 200, 'Students can view verified alumni career history');

  const deleteCareer = await testRequest('/api/career-history/102', 'DELETE', alumniToken);
  assert.equal(deleteCareer.status, 200, 'Alumni can delete career entry');
  console.log('✓ Career History CRUD & public viewing passed');

  // 5. Opportunities (POST, PATCH, DELETE, Search & Filter)
  mockResponses.handler = (sql, values) => {
    if (sql.includes('INSERT INTO opportunities')) {
      return { rows: [{ id: 50, title: 'Full Stack Intern', company: 'Meta', type: 'internship' }] };
    }
    if (sql.includes('SELECT * FROM opportunities WHERE id=$1')) {
      return { rows: [{ id: 50, created_by: 20, alumni_id: 20, title: 'Full Stack Intern', company: 'Meta', description: 'React + Node project.', type: 'internship' }] };
    }
    if (sql.includes('UPDATE opportunities SET')) {
      return { rows: [{ id: 50, title: 'Full Stack Developer', company: 'Meta' }] };
    }
    if (sql.includes('DELETE FROM opportunities WHERE id=$1')) {
      return { rows: [] };
    }
    if (sql.includes('FROM opportunities o LEFT JOIN users u')) {
      return { rows: [{ id: 50, title: 'Full Stack Intern', company: 'Meta', type: 'internship' }] };
    }
    if (sql.includes('SELECT id FROM users WHERE role=\'student\'')) {
      return { rows: [{ id: 10 }] };
    }
    if (sql.includes('INSERT INTO notifications')) {
      return { rows: [] };
    }
    return { rows: [] };
  };

  const createOpp = await testRequest('/api/opportunities', 'POST', alumniToken, {
    title: 'Full Stack Intern', company: 'Meta', description: 'React + Node project.', type: 'internship'
  });
  assert.equal(createOpp.status, 201, 'Alumni can create opportunity');

  const filterOpp = await testRequest('/api/opportunities?type=internship&search=Meta', 'GET', studentToken);
  assert.equal(filterOpp.status, 200, 'Search and type filtering works');
  assert.equal(filterOpp.data.length, 1);

  const editOpp = await testRequest('/api/opportunities/50', 'PATCH', alumniToken, {
    title: 'Full Stack Developer'
  });
  assert.equal(editOpp.status, 200, 'Opportunity creator can update listing');
  assert.equal(editOpp.data.title, 'Full Stack Developer');

  const studentOppEdit = await testRequest('/api/opportunities/50', 'PATCH', studentToken, { title: 'Hacked' });
  assert.equal(studentOppEdit.status, 403, 'Students cannot edit opportunities');

  const deleteOpp = await testRequest('/api/opportunities/50', 'DELETE', alumniToken);
  assert.equal(deleteOpp.status, 200, 'Creator can delete opportunity');
  console.log('✓ Opportunity Posting, Filtering, Editing & Deletion passed');

  // 6. Applications (Apply, my-applications, managed-applications, status update)
  mockResponses.handler = (sql, values) => {
    if (sql.includes('SELECT id,created_by,alumni_id,title FROM opportunities WHERE id=$1')) {
      return { rows: [{ id: 50, created_by: 20, alumni_id: 20, title: 'Full Stack Developer' }] };
    }
    if (sql.includes('INSERT INTO opportunity_applications')) {
      return { rows: [{ id: 201, opportunity_id: 50, student_id: 10, note: 'Excited to apply', status: 'submitted' }] };
    }
    if (sql.includes('FROM opportunity_applications a JOIN opportunities o ON o.id=a.opportunity_id WHERE a.student_id=$1')) {
      return { rows: [{ id: 201, title: 'Full Stack Developer', status: 'submitted' }] };
    }
    if (sql.includes('SELECT a.id,a.status,a.note,a.resume_url,a.created_at,u.name AS student_name')) {
      return { rows: [{ id: 201, student_name: 'Test Student', status: 'submitted' }] };
    }
    if (sql.includes('UPDATE opportunity_applications a SET status=$1')) {
      return { rows: [{ id: 201, student_id: 10, status: 'shortlisted' }] };
    }
    if (sql.includes('INSERT INTO notifications')) {
      return { rows: [] };
    }
    return { rows: [] };
  };

  const applyRes = await testRequest('/api/opportunities/50/apply', 'POST', studentToken, {
    note: 'Excited to apply', resume_url: 'https://example.com/resume.pdf'
  });
  assert.equal(applyRes.status, 201, 'Student can apply for opportunity');

  const myApps = await testRequest('/api/my-applications', 'GET', studentToken);
  assert.equal(myApps.status, 200, 'Student can view /api/my-applications');
  assert.equal(myApps.data.length, 1);

  const managedApps = await testRequest('/api/managed-applications', 'GET', alumniToken);
  assert.equal(managedApps.status, 200, 'Alumni can view /api/managed-applications');
  assert.equal(managedApps.data.length, 1);

  const statusUpdate = await testRequest('/api/applications/201/status', 'PATCH', alumniToken, {
    status: 'shortlisted'
  });
  assert.equal(statusUpdate.status, 200, 'Poster can update application status');
  assert.equal(statusUpdate.data.status, 'shortlisted');

  // Verify non-alumni/non-admin cannot manage applications
  const studentManaged = await testRequest('/api/managed-applications', 'GET', studentToken);
  assert.equal(studentManaged.status, 403, 'Students cannot access managed applications');
  console.log('✓ Student Application, Listing & Status Lifecycle passed');

  console.log('\n--- ALL ARSHIYAN MODULE VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
  pool.query = originalQuery;
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
