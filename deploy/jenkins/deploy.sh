#!/usr/bin/env bash
# rsync the release to each server, switch the current symlink, pm2 reload, health check, roll back on failure.
# Hosts per branch come from Jenkins env: DEV_HOSTS, STAG_HOSTS, PROD_HOSTS (space separated, private IPs).
set -euo pipefail
BRANCH="$1"
case "$BRANCH" in
  dev)  HOSTS="$DEV_HOSTS" ;;
  stag) HOSTS="$STAG_HOSTS" ;;
  main) HOSTS="$PROD_HOSTS" ;;
  *) echo "No deploy target for branch $BRANCH"; exit 1 ;;
esac

REL="$(date +%Y%m%d%H%M)-${GIT_COMMIT:0:7}"
BASE=/srv/nexora
FIRST=1

for HOST in $HOSTS; do # one server at a time
  echo "==> $HOST: $REL"
  rsync -az --delete release/ "deploy@$HOST:$BASE/releases/$REL/"

  if [ "$FIRST" = 1 ]; then # migrations once per environment, before any switch
    ssh "deploy@$HOST" "cd $BASE/releases/$REL/backend && set -a && . $BASE/shared/env/api.env && npx prisma migrate deploy"
    FIRST=0
  fi

  ssh "deploy@$HOST" "ln -sfn $BASE/releases/$REL $BASE/current && sudo -u nexora pm2 reload $BASE/current/deploy/pm2/ecosystem.config.cjs --update-env"

  if ! ssh "deploy@$HOST" "for i in \$(seq 1 10); do curl -fsS localhost:4000/health >/dev/null && curl -fsS localhost:3000/api/health >/dev/null && exit 0; sleep 3; done; exit 1"; then
    echo "Health check failed on $HOST, rolling back"
    ssh "deploy@$HOST" "$BASE/current/deploy/jenkins/rollback.sh"
    exit 1
  fi

  ssh "deploy@$HOST" "cd $BASE/releases && ls -1t | tail -n +6 | xargs -r rm -rf" # keep 5 releases
done
