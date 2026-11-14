import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[AlumniConnect DB] Warning: DATABASE_URL is not set. Ensure server/.env is configured.');
} else if (connectionString.includes('YOUR_DB_USER') || connectionString.includes('YOUR_PASSWORD')) {
  console.warn('[AlumniConnect DB] Warning: DATABASE_URL still contains default placeholders. Please update server/.env with your actual database credentials.');
}

export const pool = new Pool({
  connectionString: connectionString || undefined,
  max: Number(process.env.DB_POOL_MAX || 10),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('[AlumniConnect DB] Unexpected idle client error:', err.message);
});
