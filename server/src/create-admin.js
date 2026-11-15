/**
 * Secure Admin Provisioning CLI for AlumniConnect
 * -----------------------------------------------
 * Provisions an administrator account directly in the database.
 * Uses bcrypt (12 salt rounds) for password hashing.
 * Never exposes admin registration through the public API.
 *
 * Usage:
 *   # Interactive prompt:
 *   node server/src/create-admin.js
 *
 *   # Command-line arguments:
 *   node server/src/create-admin.js --name "Admin Name" --email "admin@example.com" --password "SecurePass123"
 *
 *   # Environment variables:
 *   ADMIN_NAME="Admin Name" ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="SecurePass123" node server/src/create-admin.js
 */

import './load-env.js';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--name' || arg === '-n') && args[i + 1]) {
      parsed.name = args[++i];
    } else if ((arg === '--email' || arg === '-e') && args[i + 1]) {
      parsed.email = args[++i];
    } else if ((arg === '--password' || arg === '-p') && args[i + 1]) {
      parsed.password = args[++i];
    }
  }
  return parsed;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function provisionAdmin() {
  const cliArgs = parseArgs(process.argv.slice(2));

  let name = cliArgs.name || process.env.ADMIN_NAME;
  let email = cliArgs.email || process.env.ADMIN_EMAIL;
  let password = cliArgs.password || process.env.ADMIN_PASSWORD;

  // If interactive terminal and missing fields, prompt user
  if ((!name || !email || !password) && input.isTTY) {
    const rl = readline.createInterface({ input, output });
    try {
      if (!name) {
        name = await rl.question('Enter Admin Full Name [System Administrator]: ');
        name = name.trim() || 'System Administrator';
      }
      if (!email) {
        email = await rl.question('Enter Admin Email Address: ');
        email = email.trim();
      }
      if (!password) {
        password = await rl.question('Enter Admin Password (min 8 chars): ');
      }
    } finally {
      rl.close();
    }
  }

  name = (name || '').trim();
  email = (email || '').trim().toLowerCase();

  if (!name) {
    console.error('Error: Admin name is required.');
    process.exit(1);
  }

  if (!email || !EMAIL_REGEX.test(email)) {
    console.error('Error: A valid email address is required.');
    process.exit(1);
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    console.error('Error: Admin password must be at least 8 characters long.');
    process.exit(1);
  }

  console.log(`Provisioning admin account for: ${email}`);
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ($1, $2, $3, 'admin', 'active')
       ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           role = 'admin',
           status = 'active',
           updated_at = NOW()
       RETURNING id, name, email, role, status, created_at`,
      [name, email, passwordHash]
    );

    const user = result.rows[0];
    console.log('\n=============================================');
    console.log('✓ Administrator account provisioned successfully!');
    console.log('=============================================');
    console.log(`ID:     ${user.id}`);
    console.log(`Name:   ${user.name}`);
    console.log(`Email:  ${user.email}`);
    console.log(`Role:   ${user.role}`);
    console.log(`Status: ${user.status}`);
    console.log('=============================================\n');
  } catch (err) {
    console.error('Database error provisioning admin:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

provisionAdmin().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
