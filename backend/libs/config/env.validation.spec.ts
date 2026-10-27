import { validateEnv } from './env.validation.js';
import { appRole, runsBackgroundJobs } from './app-role.js';

const valid = {
  DATABASE_URL: 'mysql://user:pass@localhost:3306/nexora',
  ENCRYPTION_MASTER_KEY: 'a'.repeat(64),
  JWT_SECRET: 'x'.repeat(32),
  LIVEKIT_URL: 'ws://localhost:7880',
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'y'.repeat(32),
};

describe('validateEnv', () => {
  it('accepts a complete config', () => {
    expect(validateEnv({ ...valid })).toEqual(valid);
  });

  it('lists every missing required key', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL is required[\s\S]*LIVEKIT_API_SECRET is required/);
  });

  it('rejects a master key that is not 64 hex characters', () => {
    expect(() => validateEnv({ ...valid, ENCRYPTION_MASTER_KEY: 'zz' })).toThrow(/ENCRYPTION_MASTER_KEY/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects an unknown APP_ROLE and a bad PORT', () => {
    expect(() => validateEnv({ ...valid, APP_ROLE: 'cron' })).toThrow(/APP_ROLE/);
    expect(() => validateEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });
});

describe('appRole', () => {
  const original = process.env.APP_ROLE;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_ROLE;
    else process.env.APP_ROLE = original;
  });

  it('runs background jobs everywhere except the api', () => {
    process.env.APP_ROLE = 'api';
    expect(runsBackgroundJobs()).toBe(false);
    process.env.APP_ROLE = 'worker';
    expect(runsBackgroundJobs()).toBe(true);
    delete process.env.APP_ROLE;
    expect(appRole()).toBe('all');
    expect(runsBackgroundJobs()).toBe(true);
  });
});
