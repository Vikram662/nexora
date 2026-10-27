// next build leaves public/, .next/static/ and the .local env files out of .next/standalone.
// server.js serves the assets and loads the env files from its own folder once they are copied in.
import { cpSync, existsSync } from 'node:fs';

if (existsSync('.next/standalone')) {
  cpSync('public', '.next/standalone/public', { recursive: true });
  cpSync('.next/static', '.next/standalone/.next/static', { recursive: true });
  // Next copies .env and .env.production itself; JWT_SECRET usually lives in .env.local (see .env.example).
  for (const file of ['.env.local', '.env.production.local']) {
    if (existsSync(file)) cpSync(file, `.next/standalone/${file}`);
  }
}
