#!/usr/bin/env bash
# One command from a clean checkout to a running app:
#   backend build → terraform plan/apply → frontend build → upload to S3 → CloudFront invalidation.
# Secrets come from .env (never committed): TMDB_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALERT_EMAIL, DONATE_URL.
# Usage: scripts/deploy.sh            (asks before applying)
#        scripts/deploy.sh --yes      (CI / non-interactive)
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f .env ]] && { set -a; . ./.env; set +a; }
: "${TMDB_TOKEN:?TMDB_TOKEN is missing (.env)}"
export TF_VAR_tmdb_token="$TMDB_TOKEN"
export TF_VAR_google_client_id="${GOOGLE_CLIENT_ID:-}"
export TF_VAR_google_client_secret="${GOOGLE_CLIENT_SECRET:-}"
export TF_VAR_alert_email="${ALERT_EMAIL:-}"
export TF_VAR_donate_url="${DONATE_URL:-}"
export TF_VAR_domain_name="${DOMAIN_NAME:-}"
export TF_VAR_extra_app_urls="${EXTRA_APP_URLS:-}"

echo "▶ backend"
backend/build.sh

echo "▶ infrastructure"
terraform -chdir=infra init -input=false >/dev/null
terraform -chdir=infra plan -input=false -out=tfplan
if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "Apply this plan? [y/N] " ok
  [[ "$ok" == "y" ]] || { echo "aborted"; exit 1; }
fi
terraform -chdir=infra apply -input=false tfplan

BUCKET=$(terraform -chdir=infra output -raw web_bucket)
DIST=$(terraform -chdir=infra output -raw distribution_id)
URL=$(terraform -chdir=infra output -raw app_url)

echo "▶ frontend"
(cd frontend && npm ci --no-audit --no-fund >/dev/null && npm run build)
# Hashed assets are immutable; index.html must always be revalidated. config.json is owned by Terraform.
aws s3 sync frontend/dist "s3://$BUCKET" --delete --exclude config.json --exclude index.html \
  --cache-control "public, max-age=31536000, immutable"
aws s3 cp frontend/dist/index.html "s3://$BUCKET/index.html" --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/index.html" "/config.json" "/" >/dev/null

echo "✔ deployed: $URL"
