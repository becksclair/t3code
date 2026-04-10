#!/bin/bash
#
# T3 Code AUR Publish Helper
#
# Publishes the AUR package to the Arch Linux User Repository.
# This script handles the git operations needed to update the AUR package.
#
# Prerequisites:
#   - AUR account with SSH key configured
#   - Package t3code created in AUR (first time setup)
#
# Usage:
#   bun run aur:publish
#   ./scripts/aur-publish.sh [--force] [--dry-run]
#
# Options:
#   --force    Skip confirmation prompts
#   --dry-run  Show what would be done without executing
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
AUR_DIR="${ROOT_DIR}/dist/aur/t3code"
AUR_SSH_URL="ssh://aur@aur.archlinux.org/t3code.git"

# Parse arguments
FORCE=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --force)
      FORCE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--force] [--dry-run]"
      exit 1
      ;;
  esac
done

echo "📤 T3 Code AUR Publisher"
echo "======================="
echo ""

# Check prerequisites
if [[ ! -d "${AUR_DIR}" ]]; then
  echo "❌ AUR package directory not found: ${AUR_DIR}"
  echo "   Run 'bun run dist:desktop:aur' first to generate the package."
  exit 1
fi

# Check for required files
echo "🔍 Checking package files..."
REQUIRED_FILES=("PKGBUILD" ".SRCINFO")
for file in "${REQUIRED_FILES[@]}"; do
  if [[ ! -f "${AUR_DIR}/${file}" ]]; then
    echo "❌ Required file missing: ${file}"
    exit 1
  fi
done
echo "✅ Required files present"

# Show package info
echo ""
echo "📦 Package info:"
cd "${AUR_DIR}"
source PKGBUILD 2>/dev/null || true
echo "   Name:    ${pkgname:-t3code}"
echo "   Version: ${pkgver:-unknown}"
echo "   Release: ${pkgrel:-1}"
echo "   URL:     ${url:-https://github.com/t3tools/t3code}"

# Verify .SRCINFO is up to date
echo ""
echo "📝 Verifying .SRCINFO..."
TEMP_SRCINFO=$(mktemp)
makepkg --printsrcinfo > "${TEMP_SRCINFO}" 2>/dev/null
if ! diff -q "${TEMP_SRCINFO}" .SRCINFO > /dev/null 2>&1; then
  echo "⚠️  .SRCINFO is out of date, regenerating..."
  if [[ $DRY_RUN -eq 0 ]]; then
    cp "${TEMP_SRCINFO}" .SRCINFO
    echo "✅ .SRCINFO updated"
  else
    echo "   (would update .SRCINFO in dry-run mode)"
  fi
else
  echo "✅ .SRCINFO is current"
fi
rm -f "${TEMP_SRCINFO}"

# Check if we're in a git repo or need to init
cd "${AUR_DIR}"
if [[ ! -d ".git" ]]; then
  echo ""
  echo "⚠️  Git repository not initialized"
  echo "   This appears to be a fresh package."
  
  if [[ $FORCE -eq 0 && $DRY_RUN -eq 0 ]]; then
    read -p "   Initialize git repo for AUR? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "❌ Aborted by user"
      exit 1
    fi
  fi
  
  if [[ $DRY_RUN -eq 0 ]]; then
    echo "🆕 Initializing git repository..."
    git init
    git config user.email "aur@t3tools.com"
    git config user.name "T3 Code AUR Bot"
    git remote add aur "${AUR_SSH_URL}" 2>/dev/null || true
    echo "✅ Git repo initialized"
  else
    echo "   (would init git repo in dry-run mode)"
  fi
fi

# Show git status
echo ""
echo "📋 Git status:"
if [[ -d ".git" ]]; then
  git status --short
  
  # Stage all files
  echo ""
  echo "📝 Staging files..."
  if [[ $DRY_RUN -eq 0 ]]; then
    git add -A
    echo "✅ Files staged"
  else
    echo "   (would stage files in dry-run mode)"
  fi
  
  # Show what will be committed
  echo ""
  echo "📦 Changes to be committed:"
  if [[ $DRY_RUN -eq 0 ]]; then
    git diff --cached --stat
  else
    git diff --stat
  fi
  
  # Commit
  COMMIT_MSG="Update to ${pkgver:-vX.Y.Z}"
  if [[ -n "${pkgrel}" && "${pkgrel}" != "1" ]]; then
    COMMIT_MSG="${COMMIT_MSG} (pkgrel ${pkgrel})"
  fi
  
  echo ""
  if [[ $FORCE -eq 0 && $DRY_RUN -eq 0 ]]; then
    read -p "   Commit with message '${COMMIT_MSG}'? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "❌ Aborted by user"
      git reset HEAD > /dev/null 2>&1 || true
      exit 1
    fi
  fi
  
  if [[ $DRY_RUN -eq 0 ]]; then
    git commit -m "${COMMIT_MSG}"
    echo "✅ Committed: ${COMMIT_MSG}"
  else
    echo "   (would commit: ${COMMIT_MSG})"
  fi
  
  # Push to AUR
  echo ""
  echo "📤 Pushing to AUR..."
  
  # Check SSH connectivity first
  if [[ $DRY_RUN -eq 0 ]]; then
    echo "   Testing AUR SSH connection..."
    if ! ssh aur@aur.archlinux.org help > /dev/null 2>&1; then
      echo "⚠️  Could not connect to AUR via SSH"
      echo "   Ensure your SSH key is registered at https://aur.archlinux.org/"
      exit 1
    fi
    
    if [[ $FORCE -eq 0 ]]; then
      read -p "   Push to AUR? [y/N] " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Aborted by user"
        exit 1
      fi
    fi
    
    git push aur master
    echo "✅ Pushed to AUR successfully!"
    echo ""
    echo "🎉 Package published: https://aur.archlinux.org/packages/t3code"
  else
    echo "   (would push to AUR in dry-run mode)"
    echo ""
    echo "   Dry run complete. To publish for real, run without --dry-run"
  fi
else
  echo "   (git not initialized - see steps above)"
fi

echo ""
echo "📖 Next steps:"
echo "   - Check the AUR page: https://aur.archlinux.org/packages/t3code"
echo "   - Verify the build:  makepkg -si (in dist/aur/t3code)"
echo "   - Update AUR helpers will pick up the new version"
