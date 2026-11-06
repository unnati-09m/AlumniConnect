import 'dotenv/config';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const {Pool}=pg;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing. Copy server/.env.example to server/.env.');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:false}:undefined});
try {
  const file=fileURLToPath(new URL('./schema.sql',import.meta.url));
  await pool.query(await fs.readFile(file,'utf8'));
  console.log('AlumniConnect database schema is ready.');
} finally { await pool.end(); }
