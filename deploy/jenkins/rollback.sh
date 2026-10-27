#!/usr/bin/env bash
# Point current at the previous release and reload. Run on the server (DEPLOYMENT_RULES.md section 16.1).
set -euo pipefail
BASE=/srv/nexora
CURRENT="$(basename "$(readlink -f $BASE/current)")"
PREV="$(ls -1t $BASE/releases | grep -vx "$CURRENT" | head -n 1)"
[ -n "$PREV" ] || { echo "No previous release"; exit 1; }
ln -sfn "$BASE/releases/$PREV" "$BASE/current"
sudo -u nexora pm2 reload "$BASE/current/deploy/pm2/ecosystem.config.cjs" --update-env
curl -fsS localhost:4000/health && curl -fsS localhost:3000/api/health
echo "Rolled back to $PREV"
