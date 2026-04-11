#!/bin/bash
#
# T3 Code AUR Rebuild Helper
#
# Builds locally first, then packages for AUR distribution.
# This approach avoids build issues inside makepkg (native modules, compiler issues).
#
# Usage:
#   bun run aur:rebuild
#   ./scripts/aur-rebuild.sh [--clean] [--test-only] [--skip-build]
#
# Options:
#   --clean       Remove dist/aur first and regenerate
#   --test-only   Run tests but don't install
#   --skip-build  Skip the local build (use existing dist)
#   --skip-gen    Skip package generation (use existing dist/aur)
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
AUR_DIR="${ROOT_DIR}/dist/aur/t3code"

# Parse arguments
CLEAN=0
TEST_ONLY=0
SKIP_BUILD=0
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
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --skip-gen)
      SKIP_GEN=1
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--clean] [--test-only] [--skip-build] [--skip-gen]"
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
  SKIP_BUILD=0
  SKIP_GEN=0
fi

# Step 2: Local build (unless skipped)
if [[ $SKIP_BUILD -eq 0 ]]; then
  echo "🔨 Building desktop app locally..."
  cd "${ROOT_DIR}"
  bun run build:desktop
  echo "✅ Local build complete"
  echo ""
else
  echo "⏭️  Skipping local build (--skip-build)"
fi

# Step 3: Generate AUR package (unless skipped)
if [[ $SKIP_GEN -eq 0 ]]; then
  echo "📦 Generating AUR package from local build..."
  cd "${ROOT_DIR}"
  GENERATOR_ARGS=(--verbose)
  if [[ $SKIP_BUILD -eq 1 ]]; then
    GENERATOR_ARGS=(--skip-build --verbose)
  fi
  node scripts/generate-aur-package.ts "${GENERATOR_ARGS[@]}"
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

# The generator now owns local source archive creation and checksum updates.

# Ensure system paths are first (avoid Homebrew Python issues)
export PATH="/usr/bin:$PATH"

# Step 4: Update other checksums
echo ""
echo "📊 Updating checksums..."
if command -v updpkgsums &> /dev/null; then
  updpkgsums 2>/dev/null || true
fi

# Step 5: Validate package
echo ""
echo "🔍 Validating package..."
if [[ -x /usr/bin/namcap ]]; then
  /usr/bin/namcap PKGBUILD || true
else
  echo "⚠️  namcap not installed (sudo pacman -S namcap for package linting)"
fi

# Check PKGBUILD syntax
if ! makepkg --printsrcinfo > /dev/null 2>&1; then
  echo "❌ PKGBUILD validation failed"
  exit 1
fi
echo "✅ PKGBUILD syntax OK"

# Step 6: Regenerate .SRCINFO
echo ""
echo "📝 Regenerating .SRCINFO..."
makepkg --printsrcinfo > .SRCINFO
echo "✅ .SRCINFO updated"

# Step 7: Test mode - stop here
if [[ $TEST_ONLY -eq 1 ]]; then
  echo ""
  echo "🧪 Test mode - package validation complete"
  echo "   To install: cd ${AUR_DIR} && makepkg -si"
  exit 0
fi

# Step 8: Build and install
echo ""
echo "📦 Building and installing package..."
echo "   (Skipping dependency checks - assuming bun is installed via mise/native)"
makepkg -si --nodeps "$@"

echo ""
echo "✅ T3 Code rebuilt and installed successfully!"
echo ""
echo "Launch commands:"
echo "   t3code              # From terminal"
echo "   # Or use desktop menu entry"
echo ""
echo "📁 Package location: ${AUR_DIR}"
