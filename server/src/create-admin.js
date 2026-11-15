/**
 * Secure one-time Admin Provisioning CLI for AlumniConnect.
 *
 * Run from the repository root with:
 *   npm run admin:create
 *
 * Password input is hidden. Existing accounts are never modified.
 * Never use this script to seed demo or sample data.
 */

import './load-env.js';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i += 1) {
    if ((args[i] === '--name' || args[i] === '-n') && args[i + 1]) {
      parsed.name = args[++i];
    } else if ((args[i] === '--email' || args[i] === '-e') && args[i + 1]) {
      parsed.email = args[++i];
    }
  }
  return parsed;
}

async function askHiddenPassword(prompt) {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Run npm run admin:create in an interactive terminal so the password can be entered securely.');
  }

  return new Promise((resolve, reject) => {
    let password = '';
    const previousRawMode = Boolean(input.isRaw);

    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode(previousRawMode);
      output.write('\n');
    };

    const onData = (chunk) => {
      const key = chunk.toString('utf8');

      if (key === '\u0003') {
        cleanup();
        reject(new Error('Admin creation cancelled.'));
        return;
      }

      if (key === '\r' || key === '\n') {
        cleanup();
        resolve(password);
        return;
      }

      if (key === '\u007f' || key === '\b') {
        password = password.slice(0, -1);
        return;
      }

      if (key >= ' ' && key !== '\u007f') {
        password += key;
      }
    };

    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function provisionAdmin() {
  const args = parseArgs(process.argv.slice(2));
  const rl = readline.createInterface({ input, output });

  let name = args.name || process.env.ADMIN_NAME || '';
  let email = args.email || process.env.ADMIN_EMAIL || '';

  try {
    if (!name) name = (await rl.question('Admin full name: ')).trim();
    if (!email) email = (await rl.question('Institutional admin email: ')).trim();
  } finally {
    rl.close();
  }

  name = name.trim();
  email = email.trim().toLowerCase();

  if (!name) throw new Error('Admin name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }

  const password = await askHiddenPassword('Admin password (minimum 12 characters; input hidden): ');
  if (password.length < 12) {
    throw new Error('Choose a password with at least 12 characters.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, status) VALUES ($1, $2, $3, \'admin\', \'active\') RETURNING id, name, email, role, status',
      [name, email, passwordHash]
    );

    const admin = result.rows[0];
    console.log('Admin account created successfully.');
    console.log('Name: ' + admin.name);
    console.log('Email: ' + admin.email);
    console.log('Role: ' + admin.role);
    console.log('Keep the password private. It was not printed or stored in this repository.');
  } catch (error) {
    if (error.code === '23505') {
      throw new Error('An account with this email already exists. No existing account was changed. Use a different institutional email.');
    }
    throw new Error('Admin account could not be created. Check the database connection and schema, then retry.');
  } finally {
    await pool.end();
  }
}

provisionAdmin().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
