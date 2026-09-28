import { app } from './app.js';
import { database } from './config/database.js';
import { env } from './config/env.js';

const server = app.listen(env.PORT, () => {
  console.info(`API listening on http://localhost:${env.PORT}`);
});

const shutdown = (signal: string): void => {
  console.info(`${signal} received; closing server`);
  server.close(() => {
    void database.end().finally(() => process.exit(0));
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
