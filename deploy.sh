#!/usr/bin/env bash
# Compile l'app et la (re)déploie sur le serveur.
# Config locale non versionnée : .deploy.env (voir .deploy.env.example).
set -euo pipefail
cd "$(dirname "$0")"
[ -f .deploy.env ] && . ./.deploy.env
: "${DEPLOY_HOST:?Définis DEPLOY_HOST dans .deploy.env (ex. ubuntu@mon-serveur)}"
DIR=${DEPLOY_DIR:-/opt/volumen}

npm run build
ssh "$DEPLOY_HOST" "sudo mkdir -p $DIR/data && sudo chown -R \$(id -u):\$(id -g) $DIR"
rsync -az --delete --exclude 'data*' \
  package.json Dockerfile compose.yaml server dist "$DEPLOY_HOST:$DIR/"
ssh "$DEPLOY_HOST" "cd $DIR && sudo docker compose up -d --build && sudo docker image prune -f >/dev/null"
echo "Déployé${PUBLIC_URL:+ : $PUBLIC_URL}"
