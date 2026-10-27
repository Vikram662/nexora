import { describe, it, expect, vi } from 'vitest';
import * as net from 'net';
import { SystemHealthService, describeDatabaseUrl, describeError, splitHostPort } from './system-health.service.js';

function service(opts: { db?: () => Promise<unknown>; ping?: () => Promise<void>; env?: Record<string, string> }) {
  const env = { DATABASE_URL: 'mysql://root:secret@localhost:3306/nexora_rtc', LIVEKIT_URL: 'ws://localhost:7880', ...opts.env };
  return new SystemHealthService(
    { $queryRaw: vi.fn(opts.db ?? (() => Promise.resolve([{ 1: 1 }]))) } as any,
    { ping: vi.fn(opts.ping ?? (() => Promise.resolve())) } as any,
    { get: (k: string) => env[k as keyof typeof env] } as any,
  );
}

describe('system health helpers', () => {
  it('describes the database without the password', () => {
    expect(describeDatabaseUrl('mysql://root:secret@db.internal:3307/nexora')).toBe('db.internal:3307/nexora');
    expect(describeDatabaseUrl('mysql://root:@localhost/nexora_rtc')).toBe('localhost:3306/nexora_rtc');
    expect(describeDatabaseUrl(undefined)).toBe('');
    expect(describeDatabaseUrl('not a url')).toBe('');
  });

  it('finds the real reason inside wrapped errors', () => {
    expect(describeError(Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }))).toBe(
      'Connection refused (nothing is listening there)',
    );
    expect(describeError(Object.assign(new AggregateError([], ''), { errors: [{ code: 'ECONNREFUSED' }] }))).toBe(
      'Connection refused (nothing is listening there)',
    );
    expect(describeError(Object.assign(new Error('x'), { code: 'EWEIRD' }))).toBe('EWEIRD');
    expect(describeError(new Error("Can't reach database server"))).toBe("Can't reach database server");
    expect(describeError('plain')).toBe('plain');
  });

  it('splits host and port', () => {
    expect(splitHostPort('localhost:3478', 3478)).toEqual(['localhost', 3478]);
    expect(splitHostPort('turn.example.com', 3478)).toEqual(['turn.example.com', 3478]);
    expect(splitHostPort('turn:turn.example.com:5349', 3478)).toEqual(['turn.example.com', 5349]);
  });
});

describe('SystemHealthService', () => {
  it('reports each service as UP when it answers', async () => {
    const server = net.createServer().listen(0);
    await new Promise((r) => server.once('listening', r));
    const { port } = server.address() as net.AddressInfo;
    try {
      const result = await service({ env: { COTURN_HOST: `127.0.0.1:${port}` } }).check();
      expect(result.map((s) => [s.name, s.state])).toEqual([
        ['MySQL database', 'UP'],
        ['LiveKit media server', 'UP'],
        ['TURN server', 'UP'],
      ]);
      expect(result[0].target).toBe('localhost:3306/nexora_rtc');
      expect(result.every((s) => typeof s.latencyMs === 'number')).toBe(true);
    } finally {
      server.close();
    }
  });

  it('reports DOWN with the reason when a service fails', async () => {
    // Port 1 on localhost is closed, so the TURN connect is refused.
    const result = await service({
      db: () => Promise.reject(new Error("Can't reach database server")),
      ping: () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:7880')),
      env: { COTURN_HOST: '127.0.0.1:1' },
    }).check();
    expect(result.map((s) => s.state)).toEqual(['DOWN', 'DOWN', 'DOWN']);
    expect(result[0].error).toContain("Can't reach database server");
    expect(result[1].error).toContain('ECONNREFUSED');
    expect(result[2].error).toBe('Connection refused (nothing is listening there)');
    expect(result.every((s) => s.latencyMs === null)).toBe(true);
  });

  it('marks TURN as NOT_CONFIGURED when COTURN_HOST is unset', async () => {
    const result = await service({}).check();
    expect(result[2]).toMatchObject({ name: 'TURN server', state: 'NOT_CONFIGURED' });
  });

  it('gives up on a service that never answers', async () => {
    vi.useFakeTimers();
    try {
      const pending = service({ ping: () => new Promise(() => {}) }).check();
      await vi.advanceTimersByTimeAsync(3100);
      const result = await pending;
      expect(result[1]).toMatchObject({ state: 'DOWN', error: 'No answer within 3s' });
    } finally {
      vi.useRealTimers();
    }
  });
});
