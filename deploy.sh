#!/usr/bin/env bash
# ==============================================================================
# CyberVault Deploy Script (Laragon / Local -> GitHub -> CyberPanel VPS)
#
# Tugas script ini:
# 1. Mengecek TypeScript & mem-build frontend (dist/) + backend (dist/server.cjs)
# 2. (Opsional) Commit & push source code ke branch pengembangan (mis. main)
# 3. Mem-push hasil pre-built siap jalan ke branch "production" di GitHub,
#    sehingga di VPS CyberPanel Anda TIDAK perlu menjalankan npm install atau
#    npm run build lagi — cukup git pull dan jalankan: node dist/server.cjs
#
# Pemakaian di Laragon Terminal (Git Bash / Cmder) atau Linux/macOS:
#   ./deploy.sh "pesan commit"
#   ./deploy.sh "update jadwal" origin production
# ==============================================================================

set -euo pipefail

COMMIT_MSG="${1:-chore: release cybervault $(date '+%Y-%m-%d %H:%M:%S')}"
REMOTE_NAME="${2:-origin}"
DEPLOY_BRANCH="${3:-production}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "=================================================="
echo "  CyberVault Pre-Built GitHub Deploy"
echo "=================================================="

for CMD in git node npm; do
  if ! command -v "$CMD" >/dev/null 2>&1; then
    echo "[ERROR] Perintah '$CMD' tidak ditemukan. Pastikan sudah terpasang di PATH."
    exit 1
  fi
done

if [ ! -d ".git" ]; then
  echo "[ERROR] Folder ini belum menjadi repository Git."
  echo "Jalankan terlebih dahulu:"
  echo "  git init"
  echo "  git branch -M main"
  echo "  git remote add origin https://github.com/USERNAME/REPO_ANDA.git"
  exit 1
fi

REMOTE_URL="$(git remote get-url "$REMOTE_NAME" 2>/dev/null || true)"
if [ -z "$REMOTE_URL" ]; then
  echo "[ERROR] Remote '$REMOTE_NAME' belum dikonfigurasi."
  echo "Tambahkan remote GitHub terlebih dahulu:"
  echo "  git remote add $REMOTE_NAME https://github.com/USERNAME/REPO_ANDA.git"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[1/5] Menginstal dependensi lokal (node_modules belum ada)..."
  npm install
else
  echo "[1/5] node_modules sudah tersedia."
fi

echo "[2/5] Memeriksa tipe TypeScript (npm run lint)..."
npm run lint

echo "[3/5] Mem-build frontend & backend standalone (npm run build:prod)..."
rm -rf dist
npm run build:prod

if [ ! -f "dist/index.html" ] || [ ! -f "dist/server.cjs" ]; then
  echo "[ERROR] Hasil build tidak lengkap (dist/index.html atau dist/server.cjs tidak ditemukan)."
  exit 1
fi

CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"
if [ -z "$CURRENT_BRANCH" ]; then
  echo "[ERROR] Tidak dapat menentukan branch source. Pastikan Anda sedang berada di branch Git, bukan detached HEAD."
  exit 1
fi

if [ "$CURRENT_BRANCH" = "$DEPLOY_BRANCH" ]; then
  echo "[ERROR] Anda sedang berada di branch '$DEPLOY_BRANCH'. Pindah ke branch source (mis. 'main') terlebih dahulu."
  exit 1
fi

echo "[4/5] Menyimpan & mem-push source code ke branch '$CURRENT_BRANCH'..."
git add -A
if ! git diff --cached --quiet; then
  git commit -m "$COMMIT_MSG"
else
  echo "      Tidak ada perubahan source code baru untuk di-commit."
fi
git push -u "$REMOTE_NAME" "$CURRENT_BRANCH"
SOURCE_SHA="$(git rev-parse --short HEAD)"

echo "[5/5] Mengemas & mem-push hasil pre-built ke '$REMOTE_NAME/$DEPLOY_BRANCH'..."
STAGE_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

mkdir -p "$STAGE_DIR"
cp -R dist "$STAGE_DIR/dist"
cp package.json "$STAGE_DIR/package.json"
cp .env.example "$STAGE_DIR/.env.example"
cp README.md "$STAGE_DIR/README.md"
cp metadata.json "$STAGE_DIR/metadata.json"
if [ -d "docs" ]; then
  cp -R docs "$STAGE_DIR/docs"
fi

# .gitignore khusus branch production (dist/ ikut di-commit, data/ dan .env tetap diabaikan)
cat > "$STAGE_DIR/.gitignore" << 'EOF'
node_modules/
.env*
!.env.example
data/
*.log
.DS_Store
EOF

(
  cd "$STAGE_DIR"
  git init -q
  git checkout -q -b "$DEPLOY_BRANCH"

  # Gunakan identitas git dari repo utama jika belum diset secara global
  USER_NAME="$(git -C "$ROOT_DIR" config user.name || echo 'CyberVault Deploy')"
  USER_EMAIL="$(git -C "$ROOT_DIR" config user.email || echo 'datacenter2@smkn1temon.sch.id')"
  git config user.name "$USER_NAME"
  git config user.email "$USER_EMAIL"

  git add -A
  git commit -q -m "build: pre-built cybervault ($SOURCE_SHA) — $COMMIT_MSG"
  git push --force "$REMOTE_URL" "HEAD:refs/heads/$DEPLOY_BRANCH"
)

echo ""
echo "=================================================="
echo "  SELESAI! Deploy ke GitHub berhasil."
echo "=================================================="
echo "  - Source code  : $REMOTE_NAME/$CURRENT_BRANCH ($SOURCE_SHA)"
echo "  - Pre-built    : $REMOTE_NAME/$DEPLOY_BRANCH (siap jalan tanpa npm install)"
echo ""
echo "Di server VPS CyberPanel (cukup sekali clone, selanjutnya git pull):"
echo "  git clone -b $DEPLOY_BRANCH $REMOTE_URL /home/backup.smkn1temon.sch.id/app"
echo "  # Update berikutnya:"
echo "  cd /home/backup.smkn1temon.sch.id/app && git pull && systemctl restart cybervault"
echo "=================================================="
