#!/usr/bin/env bash
# Same checks as GitHub Actions CI.
set -euo pipefail
cd backend
npx prisma generate
npm run typecheck
npm run lint
npm test
npm run test:e2e
cd ../frontend
npm run typecheck
npm run lint
