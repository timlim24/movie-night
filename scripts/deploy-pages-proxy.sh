#!/usr/bin/env bash
# Free readable address: https://<project>.pages.dev → our CloudFront. Needs `npx wrangler login` once.
set -euo pipefail
cd "$(dirname "$0")/.."
ORIGIN=$(terraform -chdir=infra output -raw cloudfront_url)
cd infra/pages-proxy
PROJECT=$(grep '^name' wrangler.toml | cut -d'"' -f2)
npx -y wrangler@4 pages project create "$PROJECT" --production-branch main 2>/dev/null || true
printf '%s' "$ORIGIN" | npx -y wrangler@4 pages secret put ORIGIN --project-name "$PROJECT" >/dev/null
npx -y wrangler@4 pages deploy public --project-name "$PROJECT" --branch main --commit-dirty=true
