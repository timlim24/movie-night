#!/usr/bin/env bash
# Builds backend/dist: the app + its dependencies compiled for Lambda (Python 3.13, arm64).
# boto3 is provided by the Lambda runtime and is not bundled.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist
python3 -m pip install --quiet --disable-pip-version-check \
  --platform manylinux2014_aarch64 --implementation cp --python-version 3.13 \
  --only-binary=:all: --target dist -r requirements.txt
cp -r app dist/app
find dist -name '__pycache__' -type d -prune -exec rm -rf {} +
echo "backend/dist ready ($(du -sh dist | cut -f1))"
