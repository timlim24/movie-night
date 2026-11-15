#!/usr/bin/env bash
# One-time: private, versioned S3 bucket for Terraform state. Put the printed name into infra/versions.tf.
set -euo pipefail
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="movie-night-tfstate-$ACCOUNT"
REGION="${AWS_REGION:-us-east-1}"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then echo "exists: $BUCKET"; exit 0; fi
aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
echo "created: $BUCKET"
