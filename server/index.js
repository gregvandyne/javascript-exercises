// Server entry point: boot, scheduled jobs, graceful shutdown.
import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { log } from './services/log.js';
import { startJobs } from './services/jobs.js';
import { startSweeper } from './services/shots.js';
import { closeBrowser } from './services/snapshot.js';

const app = createApp();
const server = app.listen(config.port, () => log('info', 'listening', { port: config.port, builder: config.anthropicKey ? 'claude' : 'mock' }));
const stopJobs = startJobs();
startSweeper();
function shutdown(sig) {
  log('info', 'shutdown', { sig });
  stopJobs();
  closeBrowser();
  server.close(() => { try { db.close(); } catch { /* ignore */ } process.exit(0); });
  setTimeout(() => process.exit(1), 10e3).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
