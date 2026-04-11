import { createHash } from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import OS from "node:os";
import { dirname, join } from "node:path";

export interface AurLocalSourceOptions {
  rootDir: string;
  outputDir: string;
  runtimeDependencies: Record<string, string>;
  trustedDependencies?: string[];
  verbose?: boolean;
}

export interface AurLocalSourceResult {
  archiveFileName: string;
  archivePath: string;
  sha256: string;
  arch: "x86_64" | "aarch64";
}

function log(message: string, verbose: boolean): void {
  if (verbose) {
    console.log(`[aur-local-source] ${message}`);
  }
}

function resolveAurArch(): "x86_64" | "aarch64" {
  switch (process.arch) {
    case "x64":
      return "x86_64";
    case "arm64":
      return "aarch64";
    default:
      throw new Error(`Unsupported architecture for prebuilt AUR package: ${process.arch}`);
  }
}

function calculateSha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function resolveBunCommand(): string {
  const explicitPath = process.env.BUN?.trim();
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const shellResult = execSync("command -v bun >/dev/null 2>&1 && command -v bun || true", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (shellResult.length > 0) {
    return shellResult;
  }

  const homeDir = OS.homedir();
  const fixedCandidates = [
    "/usr/bin/bun",
    "/usr/local/bin/bun",
    join(homeDir, ".bun/bin/bun"),
    join(homeDir, ".local/share/mise/bin/bun"),
  ];

  for (const candidate of fixedCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const miseInstallsDir = join(homeDir, ".local/share/mise/installs/bun");
  if (existsSync(miseInstallsDir)) {
    const installedVersions = readdirSync(miseInstallsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    for (const version of installedVersions) {
      const candidate = join(miseInstallsDir, version, "bin", "bun");
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  throw new Error("Could not locate a Bun executable for AUR packaging");
}

export function createAurLocalSourceArchive(options: AurLocalSourceOptions): AurLocalSourceResult {
  const verbose = options.verbose ?? false;
  const archiveFileName = "t3code-local-build.tar.gz";
  const archivePath = join(options.outputDir, archiveFileName);
  const buildSrcRoot = join(dirname(options.outputDir), "build-src");
  const sourceRoot = join(buildSrcRoot, "t3code-local");

  log(`Preparing local source tree in ${sourceRoot}`, verbose);
  rmSync(buildSrcRoot, { recursive: true, force: true });
  rmSync(archivePath, { force: true });
  mkdirSync(sourceRoot, { recursive: true });

  const desktopDistPath = join(options.rootDir, "apps/desktop/dist-electron");
  const serverDistPath = join(options.rootDir, "apps/server/dist");
  const webDistPath = join(options.rootDir, "apps/web/dist");

  if (!existsSync(desktopDistPath)) {
    throw new Error(`Desktop dist missing: ${desktopDistPath}`);
  }
  if (!existsSync(serverDistPath)) {
    throw new Error(`Server dist missing: ${serverDistPath}`);
  }

  cpSync(desktopDistPath, join(sourceRoot, "dist-electron"), { recursive: true });
  cpSync(serverDistPath, join(sourceRoot, "server"), { recursive: true });
  if (existsSync(webDistPath)) {
    cpSync(webDistPath, join(sourceRoot, "web"), { recursive: true });
  }

  const packageJson = {
    name: "@t3tools/desktop-aur",
    version: "0.0.0",
    private: true,
    dependencies: options.runtimeDependencies,
    ...(options.trustedDependencies && options.trustedDependencies.length > 0
      ? { trustedDependencies: options.trustedDependencies }
      : {}),
  };
  writeFileSync(join(sourceRoot, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);

  log("Installing production dependencies for packaged runtime", verbose);
  execFileSync(resolveBunCommand(), ["install", "--production", "--no-save"], {
    cwd: sourceRoot,
    stdio: "inherit",
  });

  log(`Creating ${archiveFileName}`, verbose);
  execSync(`tar czf "${archivePath}" "t3code-local"`, {
    cwd: buildSrcRoot,
    stdio: "inherit",
  });

  const result: AurLocalSourceResult = {
    archiveFileName,
    archivePath,
    sha256: calculateSha256(archivePath),
    arch: resolveAurArch(),
  };

  log(`Created ${archiveFileName} (${result.arch}, ${result.sha256.slice(0, 16)}...)`, verbose);
  rmSync(buildSrcRoot, { recursive: true, force: true });

  return result;
}
