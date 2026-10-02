import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'net';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoomsService } from '../livekit/rooms.service.js';

export type HealthState = 'UP' | 'DOWN' | 'NOT_CONFIGURED';

export interface ServiceHealth {
  name: string;
  /** Where it is, without credentials. */
  target: string;
  state: HealthState;
  latencyMs: number | null;
  error?: string;
}

const TIMEOUT_MS = 3000;

function withTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No answer within ${ms / 1000}s`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** Checks the services the platform depends on. Each check is bounded by a short timeout. */
@Injectable()
export class SystemHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly config: ConfigService,
  ) {}

  async check(): Promise<ServiceHealth[]> {
    return Promise.all([this.checkDatabase(), this.checkLivekit(), this.checkTurn()]);
  }

  private async measure(name: string, target: string, probe: () => Promise<unknown>): Promise<ServiceHealth> {
    const started = Date.now();
    try {
      await withTimeout(probe());
      return { name, target, state: 'UP', latencyMs: Date.now() - started };
    } catch (err) {
      return { name, target, state: 'DOWN', latencyMs: null, error: describeError(err) };
    }
  }

  private checkDatabase(): Promise<ServiceHealth> {
    return this.measure('MySQL database', describeDatabaseUrl(this.config.get<string>('DATABASE_URL')), () =>
      this.prisma.$queryRaw`SELECT 1`,
    );
  }

  private checkLivekit(): Promise<ServiceHealth> {
    const url = this.config.get<string>('LIVEKIT_URL') ?? '';
    return this.measure('LiveKit media server', url, () => this.rooms.ping());
  }

  private async checkTurn(): Promise<ServiceHealth> {
    const hostPort = this.config.get<string>('COTURN_HOST') ?? '';
    if (!hostPort) {
      return { name: 'TURN server', target: '', state: 'NOT_CONFIGURED', latencyMs: null };
    }
    const [host, port] = splitHostPort(hostPort, 3478);
    // TURN also listens on TCP, so a TCP connect shows whether the server is reachable.
    return this.measure('TURN server', `${host}:${port}`, () => tcpConnect(host, port));
  }
}

const ERROR_CODES: Record<string, string> = {
  ECONNREFUSED: 'Connection refused (nothing is listening there)',
  ETIMEDOUT: 'Connection timed out',
  ENOTFOUND: 'Host name not found',
  EHOSTUNREACH: 'Host unreachable',
};

/**
 * A readable reason. Node often hides it: fetch() throws "fetch failed" with the code in `cause`,
 * and connecting to "localhost" (IPv4 + IPv6) throws an AggregateError with an empty message.
 */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const withCode = err as Error & { code?: string; cause?: { code?: string; message?: string }; errors?: Array<{ code?: string }> };
  const code = withCode.code ?? withCode.cause?.code ?? withCode.errors?.find((e) => e.code)?.code;
  if (code) return ERROR_CODES[code] ?? code;
  return err.message || withCode.cause?.message || 'Unknown error';
}

export function describeDatabaseUrl(url: string | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || '3306'}${u.pathname}`;
  } catch {
    return '';
  }
}

export function splitHostPort(value: string, defaultPort: number): [string, number] {
  const cleaned = value.replace(/^[a-z]+:\/\//i, '').replace(/^(turns?|stun):/i, '');
  const idx = cleaned.lastIndexOf(':');
  if (idx > 0) {
    const port = Number(cleaned.slice(idx + 1));
    if (Number.isInteger(port) && port > 0) return [cleaned.slice(0, idx), port];
  }
  return [cleaned, defaultPort];
}

function tcpConnect(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(TIMEOUT_MS, () => { socket.destroy(); reject(new Error('Connection timed out')); });
    socket.once('connect', () => { socket.destroy(); resolve(); });
    socket.once('error', (err) => { socket.destroy(); reject(err); });
  });
}
