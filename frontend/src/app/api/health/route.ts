// Load balancer and deploy health check. Static and cheap: it must not call the backend.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'healthy', service: 'nexora-frontend', timestamp: new Date().toISOString() });
}
