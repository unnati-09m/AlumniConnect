// Step 1: Load environment variables from server/.env
import './load-env.js';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

// Step 2: Validate database connection string
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Please configure server/.env.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});

try {
  // Step 3: Read schema.sql file and execute table creation queries
  const schemaFilePath = fileURLToPath(new URL('./schema.sql', import.meta.url));
  const schemaSql = await fs.readFile(schemaFilePath, 'utf8');

  await pool.query(schemaSql);
  console.log('AlumniConnect database schema is ready.');
} catch (error) {
  console.error('Error setting up database schema:', error.message);
  throw error;
} finally {
  // Step 4: Always close the connection pool when finished
  await pool.end();
}
