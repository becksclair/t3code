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

import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateInstallScript,
  generatePkgbuild,
  generateSrcinfo,
  type PkgbuildOptions,
} from "./lib/pkgbuild-template.ts";
import { createAurLocalSourceArchive, resolveBunCommand } from "./lib/aur-local-source.ts";
import { resolveElectronPackageName } from "./lib/electron-package.ts";

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

interface PackageJsonLike {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  trustedDependencies?: string[];
  workspaces?: {
    catalog?: Record<string, string>;
  };
}

function resolveDependencyVersion(
  packageName: string,
  spec: string,
  rootPackageJson: PackageJsonLike,
): string {
  if (spec === "catalog:") {
    const resolved = rootPackageJson.workspaces?.catalog?.[packageName];
    if (!resolved) {
      throw new Error(`Could not resolve catalog version for ${packageName}`);
    }
    return resolved;
  }
  return spec;
}

function collectRuntimeDependencies(rootDir: string): Record<string, string> {
  const rootPackageJson = readJson<PackageJsonLike>(join(rootDir, "package.json"));
  const desktopPackageJson = readJson<PackageJsonLike>(join(rootDir, "apps/desktop/package.json"));
  const serverPackageJson = readJson<PackageJsonLike>(join(rootDir, "apps/server/package.json"));

  const merged = new Map<string, string>();
  const sourceDependencyMaps = [
    desktopPackageJson.dependencies ?? {},
    serverPackageJson.dependencies ?? {},
  ];

  for (const dependencyMap of sourceDependencyMaps) {
    for (const [packageName, spec] of Object.entries(dependencyMap)) {
      if (packageName === "electron") {
        continue;
      }
      merged.set(packageName, resolveDependencyVersion(packageName, spec, rootPackageJson));
    }
  }

  return Object.fromEntries(
    [...merged.entries()].toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

function getSystemElectronVersion(commandName: string): string | null {
  try {
    const output = execSync(`${commandName} --version`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return output.trim().replace("v", "");
  } catch {
    return null;
  }
}

function main() {
  const options = parseArgs();

  console.log("🔧 T3 Code AUR Package Generator");
  console.log("================================\n");

  // Read package metadata
  const desktopPkg = readJson<PackageJsonLike & { version: string }>(
    join(rootDir, "apps/desktop/package.json"),
  );

  const version = desktopPkg.version;
  const pkgrel = 1;
  const electronVersionSpec = desktopPkg.dependencies?.electron;
  const electronVersion = electronVersionSpec?.trim();

  if (!electronVersion) {
    throw new Error("Could not resolve Electron version from apps/desktop/package.json");
  }

  const electronPackageName = resolveElectronPackageName(electronVersion);

  console.log(`Version: ${version}`);
  console.log(`Output:  ${options.outputDir}\n`);

  // Check system electron
  const systemElectronVersion =
    getSystemElectronVersion(electronPackageName) ||
    (electronPackageName === "electron" ? null : getSystemElectronVersion("electron"));
  if (systemElectronVersion) {
    console.log(`System electron (${electronPackageName}): ${systemElectronVersion}`);
    const systemElectronMajor = Number.parseInt(systemElectronVersion.split(".")[0] ?? "", 10);
    const targetElectronMajor = Number.parseInt(electronVersion.split(".")[0] ?? "", 10);
    if (
      Number.isInteger(systemElectronMajor) &&
      Number.isInteger(targetElectronMajor) &&
      systemElectronMajor !== targetElectronMajor
    ) {
      console.warn(
        `⚠️  Warning: System electron (v${systemElectronMajor}) differs from app target (v${targetElectronMajor})`,
      );
      console.warn("   This may cause compatibility issues.");
    }
  } else {
    console.warn("⚠️  Warning: Could not detect the requested system electron version");
    console.warn(
      `   Ensure ${electronPackageName} is installed: sudo pacman -S ${electronPackageName}`,
    );
  }

  // Step 1: Build desktop app (unless skipped)
  if (!options.skipBuild) {
    console.log("\n📦 Building desktop app...");
    try {
      execFileSync(resolveBunCommand(), ["run", "build:desktop"], {
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

  // Step 3: Copy required resources (must be before PKGBUILD generation)
  console.log("📋 Preparing resource files...");

  const resourcesDir = join(rootDir, "apps/desktop/resources");
  const resourceFiles = ["t3code.desktop", "icon.png", "com.t3tools.t3code.appdata.xml"];
  const localSources: string[] = [];
  const localSha256sums: string[] = [];

  for (const file of resourceFiles) {
    const srcPath = join(resourcesDir, file);
    const destPath = join(options.outputDir, file);

    if (existsSync(srcPath)) {
      copyFileSync(srcPath, destPath);
      // Calculate checksum for local file
      const hashOutput = execSync(`sha256sum "${destPath}"`, { encoding: "utf8" });
      const hash = hashOutput.trim().split(" ")[0]!;
      localSources.push(file);
      localSha256sums.push(hash);
      log(`  ✓ ${file} (${hash!.substring(0, 16)}...)`, options.verbose);
    } else {
      log(`  ⚠ ${file} not found`, options.verbose);
    }
  }

  // Step 4: Create the local build source archive used by PKGBUILD
  const rootPackageJson = readJson<PackageJsonLike>(join(rootDir, "package.json"));
  const runtimeDependencies = collectRuntimeDependencies(rootDir);
  const trustedDependencies = [...new Set(rootPackageJson.trustedDependencies ?? [])].toSorted();

  if (options.verbose) {
    log(`Resolved runtime dependencies: ${JSON.stringify(runtimeDependencies, null, 2)}`, true);
  }

  console.log("📦 Creating local source archive...");
  const localSourceArchive = createAurLocalSourceArchive({
    rootDir,
    outputDir: options.outputDir,
    runtimeDependencies,
    trustedDependencies,
    verbose: options.verbose,
  });

  // Step 5: Create PKGBUILD with local build source
  console.log("📝 Generating PKGBUILD...");

  const pkgbuildOptions: PkgbuildOptions = {
    pkgname: "t3code",
    pkgver: version,
    pkgrel,
    pkgdesc: "Minimal web GUI for coding agents (Codex, Claude)",
    arch: [localSourceArchive.arch],
    url: "https://github.com/t3tools/t3code",
    license: "MIT",
    depends: [electronPackageName, "nodejs", "openssh"],
    makedepends: [], // No build needed - pre-built locally
    provides: ["t3code"],
    conflicts: ["t3code-bin"],
    source: [localSourceArchive.archiveFileName, ...localSources],
    sha256sums: [localSourceArchive.sha256, ...localSha256sums],
    install: "t3code.install",
    electronVersion,
    buildDir: `\${srcdir}/t3code-local`,
  };

  const pkgbuildContent = generatePkgbuild(pkgbuildOptions);
  writeFileSync(join(options.outputDir, "PKGBUILD"), pkgbuildContent);

  // Step 6: Persist runtime dependency manifest for aur-rebuild.sh
  log("Writing runtime dependency manifest...", options.verbose);
  writeFileSync(
    join(options.outputDir, "runtime-dependencies.json"),
    `${JSON.stringify(runtimeDependencies, null, 2)}\n`,
  );

  // Step 7: Generate .SRCINFO
  log("Generating .SRCINFO...", options.verbose);
  const srcinfoContent = generateSrcinfo(pkgbuildOptions);
  writeFileSync(join(options.outputDir, ".SRCINFO"), srcinfoContent);

  // Step 8: Generate install script
  log("Generating install script...", options.verbose);
  const installScript = generateInstallScript();
  writeFileSync(join(options.outputDir, "t3code.install"), installScript);

  // Step 9: Create helper scripts
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
    localSourceArchive.archiveFileName,
    "runtime-dependencies.json",
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
