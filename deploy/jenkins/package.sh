#!/usr/bin/env bash
# Builds both apps and packages one release folder: release/{backend,frontend,deploy}.
# NEXT_PUBLIC_* for the target env must be in the environment (Jenkins reads them from Infisical /build).
set -euo pipefail
BRANCH="$1"
rm -rf release && mkdir -p release/backend release/frontend

(cd backend && npx prisma generate && npm run build)
cp -r backend/dist backend/prisma backend/package.json backend/package-lock.json release/backend/
(cd release/backend && npm ci --omit=dev --ignore-scripts && npx prisma generate)

(cd frontend && npm run build)
mkdir -p release/frontend/.next
cp -r frontend/.next/standalone release/frontend/.next/standalone

cp -r deploy release/deploy
echo "${GIT_COMMIT:-unknown} ${BRANCH}" > release/REVISION
