#!/bin/bash
# Quick test of the generated PKGBUILD

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "🧪 Testing PKGBUILD..."

# Validate PKGBUILD syntax
if [[ -x /usr/bin/namcap ]]; then
  echo "🔍 Running namcap on PKGBUILD..."
  /usr/bin/namcap PKGBUILD
else
  echo "⚠️  namcap not installed (sudo pacman -S namcap)"
fi

# Check makepkg syntax
echo "📋 Checking makepkg syntax..."
makepkg --printsrcinfo > /dev/null && echo "✅ PKGBUILD syntax OK"

# Show package info
echo ""
echo "📦 Package info:"
makepkg --printsrcinfo | head -20

echo ""
echo "✅ Tests complete. Ready to build with: makepkg -si"
