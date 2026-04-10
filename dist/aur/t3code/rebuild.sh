#!/bin/bash
# T3 Code AUR Rebuild Script
# Auto-rebuilds and reinstalls the package from source

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

echo "🔧 Rebuilding T3 Code from AUR package..."

# Update checksums if sources changed
if command -v updpkgsums &> /dev/null; then
  echo "📊 Updating checksums..."
  updpkgsums
fi

# Build and install
echo "📦 Building package..."
makepkg -si "$@"

echo "✅ T3 Code rebuilt and installed successfully!"
echo ""
echo "Launch with: t3code"
