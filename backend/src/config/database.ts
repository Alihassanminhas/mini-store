import { Pool } from 'pg';
import { env } from './env.js';

export const database = new Pool({
  connectionString: env.DATABASE_URL,
  ...(env.NODE_ENV === 'production' ? { ssl: { rejectUnauthorized: true } } : {}),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

database.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error', error);
});
