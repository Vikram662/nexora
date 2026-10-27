// Which process this is. apps/api sets 'api' (HTTP only), apps/worker sets 'worker' (background jobs only).
// 'all' runs both in one process, for local development without a separate worker.
export type AppRole = 'api' | 'worker' | 'all';

export function appRole(): AppRole {
  const role = process.env.APP_ROLE;
  return role === 'api' || role === 'worker' ? role : 'all';
}

/** Repeating jobs run only outside the api, so PM2 cluster copies of the api never run the same job twice. */
export function runsBackgroundJobs(): boolean {
  return appRole() !== 'api';
}
