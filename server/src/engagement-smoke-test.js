/**
 * engagement-smoke-test.js
 * -------------------------
 * Arshiyan's engagement-module smoke tests for AlumniConnect.
 * Covers: Mentorship, Events, Notifications, Announcements, Donation Pledges.
 *
 * Usage:
 *   node src/engagement-smoke-test.js
 *
 * Requirements:
 *   - API server running (default: http://localhost:4000)
 *   - PostgreSQL seeded with the standard demo accounts:
 *       admin@alumniconnect.test  / Demo@123
 *       alumni@alumniconnect.test / Demo@123   (active + verified alumnus)
 *   - Set API_URL env var to override the default base URL.
 *
 * IMPORTANT: If the database connection or server is unavailable, the test
 * will FAIL with a clear error. It will never fake a passed result.
 */

import assert from 'node:assert/strict';

const API = process.env.API_URL || 'http://localhost:4000/api';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function call(path, token, method = 'GET', body) {
  const response = await fetch(API + path, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  return { response, data };
}

async function ok(path, token, method = 'GET', body) {
  const { response, data } = await call(path, token, method, body);
  if (!response.ok) {
    throw new Error(
      `${method} ${path} failed (${response.status}): ${data.message || JSON.stringify(data)}`
    );
  }
  return data;
}

async function login(email) {
  const result = await ok('/auth/login', '', 'POST', {
    email,
    password: 'Demo@123',
  });
  assert.ok(result.token, `login should return a JWT for ${email}`);
  return result.token;
}

function pass(label) {
  console.log('  ✓', label);
}
