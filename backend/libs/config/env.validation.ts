// Checked once at boot by ConfigModule.forRoot({ validate }). The api and the worker refuse to start on a bad value,
// so a typo in an env file fails the deploy health check instead of failing a customer request later.

const REQUIRED = ['DATABASE_URL', 'ENCRYPTION_MASTER_KEY', 'JWT_SECRET', 'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] as const;
const APP_ROLES = ['api', 'worker', 'all'];

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const value = (key: string) => (typeof config[key] === 'string' ? (config[key] as string).trim() : '');
  const errors: string[] = [];

  for (const key of REQUIRED) {
    if (!value(key)) errors.push(`${key} is required`);
  }

  const masterKey = value('ENCRYPTION_MASTER_KEY');
  if (masterKey && !/^[0-9a-fA-F]{64}$/.test(masterKey)) errors.push('ENCRYPTION_MASTER_KEY must be exactly 64 hex characters');

  const jwtSecret = value('JWT_SECRET');
  if (jwtSecret && jwtSecret.length < 32) errors.push('JWT_SECRET must be at least 32 characters');

  const livekitUrl = value('LIVEKIT_URL');
  if (livekitUrl && !/^wss?:\/\//i.test(livekitUrl)) errors.push('LIVEKIT_URL must start with ws:// or wss://');

  const port = value('PORT');
  if (port && !(Number.isInteger(Number(port)) && Number(port) > 0 && Number(port) < 65536)) errors.push('PORT must be a port number');

  const role = value('APP_ROLE');
  if (role && !APP_ROLES.includes(role)) errors.push(`APP_ROLE must be one of ${APP_ROLES.join(', ')}`);

  if (errors.length) {
    throw new Error(`Invalid environment:\n  - ${errors.join('\n  - ')}`);
  }
  return config;
}
