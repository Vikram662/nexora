// PM2 apps for Flow 2 (DEPLOYMENT_RULES.md section 4.1). Works from the repo and from /srv/nexora/current.
//   pm2 start deploy/pm2/ecosystem.config.cjs            production
//   pm2 reload deploy/pm2/ecosystem.config.cjs --update-env
// Env values come from backend/.env and the process env (Infisical Agent on servers), never from this file.
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const logs = process.env.NEXORA_LOG_DIR || path.join(root, 'logs');
const single = process.env.NEXORA_SINGLE_INSTANCE === 'true'; // dev and stag servers

const common = {
  autorestart: true,
  watch: false,
  time: true,
  merge_logs: true,
  kill_timeout: 10000, // let SIGTERM drain requests and stop jobs
  listen_timeout: 10000,
  max_restarts: 10,
  exp_backoff_restart_delay: 200,
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'nexora-api',
      cwd: path.join(root, 'backend'),
      script: 'dist/apps/api/src/main.js',
      node_args: '--enable-source-maps',
      exec_mode: 'cluster',
      instances: single ? 1 : 'max',
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production', PORT: 4000, APP_ROLE: 'api' },
      error_file: path.join(logs, 'api-error.log'),
      out_file: path.join(logs, 'api-out.log'),
    },
    {
      ...common,
      name: 'nexora-worker',
      cwd: path.join(root, 'backend'),
      script: 'dist/apps/worker/src/main.js',
      node_args: '--enable-source-maps',
      exec_mode: 'fork',
      instances: 1, // exactly one worker per environment
      max_memory_restart: '768M',
      env: { NODE_ENV: 'production', APP_ROLE: 'worker' },
      error_file: path.join(logs, 'worker-error.log'),
      out_file: path.join(logs, 'worker-out.log'),
    },
    {
      ...common,
      name: 'nexora-frontend',
      cwd: path.join(root, 'frontend', '.next', 'standalone'),
      script: 'server.js',
      exec_mode: 'cluster',
      instances: single ? 1 : 2,
      max_memory_restart: '768M',
      env: { NODE_ENV: 'production', PORT: 3000, HOSTNAME: '0.0.0.0' },
      error_file: path.join(logs, 'frontend-error.log'),
      out_file: path.join(logs, 'frontend-out.log'),
    },
  ],
};
