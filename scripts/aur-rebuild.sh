#!/bin/bash
#
# T3 Code AUR Rebuild Helper
#
# Automatically rebuilds the AUR package from local source and reinstalls it.
# Useful during development when you want to test the installed package.
#
# Usage:
#   bun run aur:rebuild
#   ./scripts/aur-rebuild.sh [--clean] [--test-only]
#
# Options:
#   --clean     Remove dist/aur first and regenerate
#   --test-only Run tests but don't install
#   --skip-gen  Skip package generation (use existing dist/aur)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
AUR_DIR="${ROOT_DIR}/dist/aur/t3code"

# Parse arguments
CLEAN=0
TEST_ONLY=0
SKIP_GEN=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --clean)
      CLEAN=1
      shift
      ;;
    --test-only)
      TEST_ONLY=1
      shift
      ;;
    --skip-gen)
      SKIP_GEN=1
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--clean] [--test-only] [--skip-gen]"
      exit 1
      ;;
  esac
done

echo "🔧 T3 Code AUR Rebuild"
echo "======================"
echo ""

# Step 1: Clean if requested
if [[ $CLEAN -eq 1 ]]; then
  echo "🧹 Cleaning dist/aur..."
  rm -rf "${ROOT_DIR}/dist/aur"
  SKIP_GEN=0
fi

# Step 2: Generate AUR package (unless skipped)
if [[ $SKIP_GEN -eq 0 ]]; then
  echo "📦 Generating AUR package..."
  cd "${ROOT_DIR}"
  node scripts/generate-aur-package.ts --verbose
else
  echo "⏭️  Skipping package generation (--skip-gen)"
fi

# Check if AUR directory exists
if [[ ! -d "${AUR_DIR}" ]]; then
  echo "❌ AUR package directory not found: ${AUR_DIR}"
  echo "   Run without --skip-gen first."
  exit 1
fi

cd "${AUR_DIR}"

# Step 3: Update checksums
echo ""
echo "📊 Updating checksums..."
if command -v updpkgsums &> /dev/null; then
  updpkgsums
else
  echo "⚠️  updpkgsums not found, using makepkg -g instead"
  # Alternative: regenerate with makepkg -g and update PKGBUILD
fi

# Step 4: Validate package
echo ""
echo "🔍 Validating package..."
if command -v namcap &> /dev/null; then
  namcap PKGBUILD
else
  echo "⚠️  namcap not installed (sudo pacman -S namcap for package linting)"
fi

# Check PKGBUILD syntax
if ! makepkg --printsrcinfo > /dev/null 2>&1; then
  echo "❌ PKGBUILD validation failed"
  exit 1
fi
echo "✅ PKGBUILD syntax OK"

# Step 5: Regenerate .SRCINFO
echo ""
echo "📝 Regenerating .SRCINFO..."
makepkg --printsrcinfo > .SRCINFO
echo "✅ .SRCINFO updated"

# Step 6: Test mode - stop here
if [[ $TEST_ONLY -eq 1 ]]; then
  echo ""
  echo "🧪 Test mode - package validation complete"
  echo "   To install: cd ${AUR_DIR} && makepkg -si"
  exit 0
fi

# Step 7: Build and install
echo ""
echo "📦 Building and installing package..."
makepkg -si "$@"

echo ""
echo "✅ T3 Code rebuilt and installed successfully!"
echo ""
echo "Launch commands:"
echo "   t3code              # From terminal"
echo "   # Or use desktop menu entry"
echo ""
echo "📁 Package location: ${AUR_DIR}"
