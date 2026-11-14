import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
