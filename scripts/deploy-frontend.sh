#!/usr/bin/env bash
# Frontend-only deploy (no infrastructure changes): build → S3 → CloudFront invalidation.
set -euo pipefail
cd "$(dirname "$0")/.."
BUCKET=$(terraform -chdir=infra output -raw web_bucket)
DIST=$(terraform -chdir=infra output -raw distribution_id)
(cd frontend && npm run build >/dev/null)
aws s3 sync frontend/dist "s3://$BUCKET" --delete --exclude config.json --exclude index.html \
  --cache-control "public, max-age=31536000, immutable" >/dev/null
aws s3 cp frontend/dist/index.html "s3://$BUCKET/index.html" --cache-control "no-cache" >/dev/null
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/index.html" "/" >/dev/null
echo "✔ frontend deployed: $(terraform -chdir=infra output -raw app_url)"
