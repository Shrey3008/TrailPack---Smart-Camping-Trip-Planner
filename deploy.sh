#!/usr/bin/env bash
# TrailPack deployment script
# Deploys backend to Elastic Beanstalk and frontend to S3 (+ optional CloudFront invalidation).
#
# Usage:
#   ./deploy.sh              # deploy both backend and frontend
#   ./deploy.sh backend      # deploy backend only
#   ./deploy.sh frontend     # deploy frontend only
#
# Requirements: aws CLI configured, eb CLI on PATH (or at ~/Library/Python/3.9/bin/eb)

set -euo pipefail

# ---- config ---------------------------------------------------------------
REGION="us-east-1"
EB_APP="trailpack-backend"
EB_ENV="trailpack-prod-env-v2"
S3_BUCKET="trailpack-frontend-173480719972"

# CloudFront distribution IDs (filled in after distributions are created).
# Leave empty strings to skip invalidation.
CF_FRONTEND_DIST_ID="${CF_FRONTEND_DIST_ID:-E2DQVML6TDR39D}"
CF_BACKEND_DIST_ID="${CF_BACKEND_DIST_ID:-E1A4XC62OW633P}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

# Make eb CLI available if installed via pip --user on macOS
if ! command -v eb >/dev/null 2>&1; then
  if [ -x "$HOME/Library/Python/3.9/bin/eb" ]; then
    export PATH="$HOME/Library/Python/3.9/bin:$PATH"
  fi
fi

# ---- helpers --------------------------------------------------------------
say() { printf "\n\033[1;36m==> %s\033[0m\n" "$*"; }
ok()  { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }
err() { printf "\033[1;31m✗ %s\033[0m\n" "$*" >&2; }

require() {
  command -v "$1" >/dev/null 2>&1 || { err "$1 not found on PATH"; exit 1; }
}

deploy_backend() {
  require aws
  require eb
  say "Deploying backend to Elastic Beanstalk ($EB_ENV)"
  ( cd "$BACKEND_DIR" && eb deploy "$EB_ENV" --timeout 15 )
  ok "Backend deployed"

  if [ -n "$CF_BACKEND_DIST_ID" ]; then
    say "Invalidating backend CloudFront ($CF_BACKEND_DIST_ID)"
    aws cloudfront create-invalidation \
      --distribution-id "$CF_BACKEND_DIST_ID" \
      --paths "/*" \
      --query 'Invalidation.Id' --output text >/dev/null
    ok "Backend CloudFront invalidation submitted"
  fi
}

deploy_frontend() {
  require aws
  say "Syncing frontend to s3://$S3_BUCKET/"
  aws s3 sync "$FRONTEND_DIR/" "s3://$S3_BUCKET/" \
    --region "$REGION" \
    --delete \
    --exclude "*.DS_Store" \
    --exclude "_originals/*" \
    --exclude "assets/hero/_originals/*" \
    --exclude "node_modules/*" \
    --exclude "*.log" \
    --exclude "*.bak" \
    --exclude "*.backup.html"
  ok "Frontend synced"

  if [ -n "$CF_FRONTEND_DIST_ID" ]; then
    say "Invalidating frontend CloudFront ($CF_FRONTEND_DIST_ID)"
    aws cloudfront create-invalidation \
      --distribution-id "$CF_FRONTEND_DIST_ID" \
      --paths "/*" \
      --query 'Invalidation.Id' --output text >/dev/null
    ok "Frontend CloudFront invalidation submitted"
  fi
}

print_urls() {
  say "URLs"
  if [ -n "$CF_FRONTEND_DIST_ID" ]; then
    DOMAIN=$(aws cloudfront get-distribution --id "$CF_FRONTEND_DIST_ID" --query 'Distribution.DomainName' --output text 2>/dev/null || echo "")
    [ -n "$DOMAIN" ] && echo "  Frontend (HTTPS): https://$DOMAIN/"
  fi
  echo "  Frontend (S3):    http://$S3_BUCKET.s3-website-$REGION.amazonaws.com/"
  if [ -n "$CF_BACKEND_DIST_ID" ]; then
    DOMAIN=$(aws cloudfront get-distribution --id "$CF_BACKEND_DIST_ID" --query 'Distribution.DomainName' --output text 2>/dev/null || echo "")
    [ -n "$DOMAIN" ] && echo "  Backend  (HTTPS): https://$DOMAIN/"
  fi
  EB_CNAME=$(aws elasticbeanstalk describe-environments --region "$REGION" --environment-names "$EB_ENV" --query 'Environments[0].CNAME' --output text 2>/dev/null || echo "")
  [ -n "$EB_CNAME" ] && echo "  Backend  (EB):    http://$EB_CNAME/"
}

# ---- entrypoint -----------------------------------------------------------
TARGET="${1:-all}"
case "$TARGET" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  all|"")   deploy_backend; deploy_frontend ;;
  *)        err "Unknown target: $TARGET (use: backend | frontend | all)"; exit 2 ;;
esac

print_urls
say "Done."
