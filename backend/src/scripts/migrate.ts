import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { database } from '../config/database.js';

const migrationDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));

async function runMigrations(): Promise<void> {
  const client = await database.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationFiles = (await readdir(migrationDirectory))
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort();

    for (const fileName of migrationFiles) {
      const alreadyApplied = await client.query<{ name: string }>(
        'SELECT name FROM schema_migrations WHERE name = $1',
        [fileName],
      );
      if (alreadyApplied.rowCount) continue;

      const sql = await readFile(new URL(`../../migrations/${fileName}`, import.meta.url), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [fileName]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      console.info(`Applied migration ${fileName}`);
    }
  } finally {
    client.release();
    await database.end();
  }
}

runMigrations().catch((error: unknown) => {
  console.error('Database migration failed', error);
  process.exitCode = 1;
});
