import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';

async function bootstrap() {
  // Background jobs only, no HTTP server. Run exactly one worker per environment.
  process.env.APP_ROLE = 'worker';

  const app = await NestFactory.createApplicationContext(WorkerModule);
  // Stop timers and close the DB pool on SIGTERM so pm2 reload never cuts a job in half.
  app.enableShutdownHooks();
  new Logger('Worker').log('Nexora worker started');
}

await bootstrap();
