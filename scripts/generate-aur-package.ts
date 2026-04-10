#!/usr/bin/env node
/**
 * AUR Package Generator for T3 Code Desktop
 *
 * Generates a complete Arch Linux AUR package structure that:
 * - Builds from source using system electron
 * - Follows Arch packaging conventions
 * - Produces a ready-to-build package in dist/aur/t3code/
 *
 * Usage:
 *   node scripts/generate-aur-package.ts
 *   node scripts/generate-aur-package.ts --skip-build
 *   node scripts/generate-aur-package.ts --output /custom/path
 */

import { execSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateInstallScript,
  generatePkgbuild,
  generateSrcinfo,
  type PkgbuildOptions,
} from "./lib/pkgbuild-template.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

interface GenerateOptions {
  skipBuild: boolean;
  outputDir: string;
  verbose: boolean;
}

function parseArgs(): GenerateOptions {
  const args = process.argv.slice(2);
  return {
    skipBuild: args.includes("--skip-build"),
    outputDir: getArgValue(args, "--output") || join(rootDir, "dist", "aur", "t3code"),
    verbose: args.includes("--verbose"),
  };
}

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

function log(message: string, verbose: boolean) {
  if (verbose) {
    console.log(`[aur-package] ${message}`);
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function getSystemElectronVersion(): string | null {
  try {
    const output = execSync("electron --version", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return output.trim().replace("v", "");
  } catch {
    return null;
  }
}

function getSourceTarballUrl(): string {
  // Try to get from origin remote
  try {
    const remoteUrl = execSync("git remote get-url origin", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();

    // Convert GitHub SSH URL to HTTPS tarball URL
    if (remoteUrl.includes("github.com")) {
      const match = remoteUrl.match(/github\.com[:/](.+?)\.git?$/);
      if (match) {
        const repoPath = match[1];
        const version = readJson<{ version: string }>(
          join(rootDir, "apps/desktop/package.json"),
        ).version;
        return `https://github.com/${repoPath}/archive/v${version}.tar.gz`;
      }
    }
  } catch {
    // Fall through to placeholder
  }

  // Fallback to upstream placeholder
  return "https://github.com/pingdotgg/t3code/archive/v${pkgver}.tar.gz";
}

function calculateSha256(url: string): string {
  try {
    log(`Calculating SHA256 for ${url}...`, true);
    // For git HEAD, calculate from local source
    const output = execSync("git archive HEAD | sha256sum", {
      encoding: "utf8",
      cwd: rootDir,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const hash = output.trim().split(" ")[0];
    return hash || "SKIP";
  } catch {
    return "SKIP";
  }
}

function main() {
  const options = parseArgs();

  console.log("🔧 T3 Code AUR Package Generator");
  console.log("================================\n");

  // Read package metadata
  const desktopPkg = readJson<{ version: string; productName: string }>(
    join(rootDir, "apps/desktop/package.json"),
  );

  const version = desktopPkg.version;
  const pkgrel = 1;

  console.log(`Version: ${version}`);
  console.log(`Output:  ${options.outputDir}\n`);

  // Check system electron
  const systemElectronVersion = getSystemElectronVersion();
  if (systemElectronVersion) {
    console.log(`System electron: ${systemElectronVersion}`);
    // Warn if major version differs
    const appElectronMajor = 40; // From apps/desktop/package.json
    const systemElectronMajor = Number.parseInt(systemElectronVersion?.split(".")[0] ?? "0", 10);
    if (systemElectronMajor !== appElectronMajor) {
      console.warn(
        `⚠️  Warning: System electron (v${systemElectronMajor}) differs from app target (v${appElectronMajor})`,
      );
      console.warn("   This may cause compatibility issues.");
    }
  } else {
    console.warn("⚠️  Warning: Could not detect system electron version");
    console.warn("   Ensure electron is installed: sudo pacman -S electron");
  }

  // Step 1: Build desktop app (unless skipped)
  if (!options.skipBuild) {
    console.log("\n📦 Building desktop app...");
    try {
      execSync("bun run build:desktop", {
        cwd: rootDir,
        stdio: "inherit",
      });
      console.log("✅ Build complete");
    } catch (error) {
      console.error("❌ Build failed:", error);
      process.exit(1);
    }
  } else {
    console.log("\n⏭️  Skipping build (--skip-build)");
  }

  // Step 2: Prepare output directory
  console.log("\n📁 Preparing package directory...");
  if (existsSync(options.outputDir)) {
    rmSync(options.outputDir, { recursive: true });
  }
  mkdirSync(options.outputDir, { recursive: true });

  // Step 3: Generate source tarball info
  const sourceUrl = getSourceTarballUrl();
  const sha256 = calculateSha256(sourceUrl);

  // Step 4: Create PKGBUILD
  console.log("📝 Generating PKGBUILD...");

  const pkgbuildOptions: PkgbuildOptions = {
    pkgname: "t3code",
    pkgver: version,
    pkgrel,
    pkgdesc: "Minimal web GUI for coding agents (Codex, Claude)",
    arch: ["x86_64", "aarch64"],
    url: "https://github.com/t3tools/t3code",
    license: "MIT",
    depends: ["electron", "nodejs", "openssh"],
    makedepends: [
      "bun",
      "git",
      "python", // For node-gyp native builds
      "gcc",
      "make",
    ],
    provides: ["t3code"],
    conflicts: ["t3code-bin"],
    source: [sourceUrl],
    sha256sums: [sha256],
    install: "t3code.install",
    electronVersion: systemElectronVersion || "39",
    buildDir: `\${srcdir}/t3code-\${pkgver}`,
  };

  const pkgbuildContent = generatePkgbuild(pkgbuildOptions);
  writeFileSync(join(options.outputDir, "PKGBUILD"), pkgbuildContent);

  // Step 5: Generate .SRCINFO
  log("Generating .SRCINFO...", options.verbose);
  const srcinfoContent = generateSrcinfo(pkgbuildOptions);
  writeFileSync(join(options.outputDir, ".SRCINFO"), srcinfoContent);

  // Step 6: Generate install script
  log("Generating install script...", options.verbose);
  const installScript = generateInstallScript();
  writeFileSync(join(options.outputDir, "t3code.install"), installScript);

  // Step 7: Copy required resources
  console.log("📋 Copying resources...");

  const resourcesDir = join(rootDir, "apps/desktop/resources");
  const requiredFiles = ["t3code.desktop", "icon.png", "com.t3tools.t3code.appdata.xml"];

  for (const file of requiredFiles) {
    const srcPath = join(resourcesDir, file);
    const destPath = join(options.outputDir, file);

    if (existsSync(srcPath)) {
      copyFileSync(srcPath, destPath);
      log(`  ✓ ${file}`, options.verbose);
    } else {
      log(`  ⚠ ${file} not found (will be created separately)`, options.verbose);
    }
  }

  // Step 8: Create helper scripts
  console.log("🛠️  Creating helper scripts...");

  // Create rebuild script
  const rebuildScript = `#!/bin/bash
# T3 Code AUR Rebuild Script
# Auto-rebuilds and reinstalls the package from source

set -e

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
cd "\${SCRIPT_DIR}"

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
`;
  writeFileSync(join(options.outputDir, "rebuild.sh"), rebuildScript);
  execSync(`chmod +x "${join(options.outputDir, "rebuild.sh")}"`);

  // Create test script
  const testScript = `#!/bin/bash
# Quick test of the generated PKGBUILD

set -e

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
cd "\${SCRIPT_DIR}"

echo "🧪 Testing PKGBUILD..."

# Validate PKGBUILD syntax
if command -v namcap &> /dev/null; then
  echo "🔍 Running namcap on PKGBUILD..."
  namcap PKGBUILD
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
`;
  writeFileSync(join(options.outputDir, "test.sh"), testScript);
  execSync(`chmod +x "${join(options.outputDir, "test.sh")}"`);

  // Step 9: Summary
  console.log("\n✅ AUR package generated successfully!");
  console.log("\n📁 Package location:");
  console.log(`   ${options.outputDir}`);
  console.log("\n📋 Generated files:");
  const generatedFiles = [
    "PKGBUILD",
    ".SRCINFO",
    "t3code.install",
    "t3code.desktop",
    "icon.png",
    "com.t3tools.t3code.appdata.xml",
    "rebuild.sh",
    "test.sh",
  ];
  for (const file of generatedFiles) {
    const filePath = join(options.outputDir, file);
    if (existsSync(filePath)) {
      console.log(`   ✓ ${file}`);
    } else {
      console.log(`   ⚠ ${file} (missing)`);
    }
  }

  console.log("\n🚀 Next steps:");
  console.log("   cd dist/aur/t3code");
  console.log("   makepkg -si           # Build and install");
  console.log("   ./rebuild.sh          # Rebuild after changes");
  console.log("   ./test.sh             # Validate package");
  console.log("\n📖 For AUR publishing:");
  console.log("   makepkg --printsrcinfo > .SRCINFO");
  console.log("   git init && git add .");
  console.log("   git remote add aur ssh://aur@aur.archlinux.org/t3code.git");
  console.log("   git push aur master");
}

main();
