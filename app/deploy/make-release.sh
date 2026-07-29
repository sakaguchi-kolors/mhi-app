#!/usr/bin/env bash
# 先方サーバーへ納品する ZIP を作成する（GitHub 非利用のデプロイ向け）
# 使い方: cd app/deploy && ./make-release.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="${1:-$REPO_ROOT/dist-release}"
STAMP="$(date +%Y%m%d)"
VERSION="${RELEASE_VERSION:-$STAMP}"
ARCHIVE="$OUT_DIR/mhi-app-release-$VERSION.zip"
STAGING="$OUT_DIR/staging-mhi-app"

rm -rf "$STAGING"
mkdir -p "$OUT_DIR" "$STAGING"

echo "==> Staging release (version: $VERSION)"

rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'frontend/dist' \
  --exclude 'backend/dist' \
  --exclude '.env' \
  --exclude 'backend/.env' \
  --exclude 'data' \
  --exclude 'logs' \
  --exclude 'dist-release' \
  --exclude '.DS_Store' \
  "$REPO_ROOT/" "$STAGING/"

{
  echo "version=$VERSION"
  echo "built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if command -v git >/dev/null 2>&1 && git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "git_commit=$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
    echo "git_branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
  fi
} > "$STAGING/RELEASE.txt"

rm -f "$ARCHIVE"
(cd "$OUT_DIR" && zip -r "$(basename "$ARCHIVE")" "$(basename "$STAGING")")
rm -rf "$STAGING"

echo "==> Created: $ARCHIVE"
echo "    先方サーバーで展開 → C:\\apps\\mhi-app\\ として配置 → app\\deploy\\deploy.ps1"
