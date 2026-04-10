/**
 * PKGBUILD template generation library for T3 Code AUR packaging.
 *
 * Generates Arch Linux PKGBUILD files that build from source using
 * system electron instead of bundled electron.
 */

export interface PkgbuildOptions {
  pkgname: string;
  pkgver: string;
  pkgrel: number;
  pkgdesc: string;
  arch: string[];
  url: string;
  license: string;
  depends: string[];
  makedepends: string[];
  checkdepends?: string[];
  provides: string[];
  conflicts: string[];
  source: string[];
  sha256sums: string[];
  install?: string;
  electronVersion: string;
  buildDir: string;
}

/**
 * Generate a complete PKGBUILD file content
 */
export function generatePkgbuild(options: PkgbuildOptions): string {
  const lines: string[] = [];

  // Header
  lines.push("# Maintainer: T3 Code Team <team@t3tools.com>");
  lines.push("# This file is auto-generated. Do not edit manually.");
  lines.push("");

  // Package metadata
  lines.push(`pkgname=${options.pkgname}`);
  lines.push(`pkgver=${options.pkgver}`);
  lines.push(`pkgrel=${options.pkgrel}`);
  lines.push(`pkgdesc="${options.pkgdesc}"`);
  lines.push(`arch=(${options.arch.map((a) => `"${a}"`).join(" ")})`);
  lines.push(`url="${options.url}"`);
  lines.push(`license=("${options.license}")`);
  lines.push("");

  // Dependencies
  lines.push(`depends=(${options.depends.map((d) => `"${d}"`).join(" ")})`);
  lines.push(`makedepends=(${options.makedepends.map((d) => `"${d}"`).join(" ")})`);
  if (options.checkdepends && options.checkdepends.length > 0) {
    lines.push(`checkdepends=(${options.checkdepends.map((d) => `"${d}"`).join(" ")})`);
  }
  lines.push(`provides=(${options.provides.map((p) => `"${p}"`).join(" ")})`);
  lines.push(`conflicts=(${options.conflicts.map((c) => `"${c}"`).join(" ")})`);
  lines.push("");

  // Sources
  lines.push(`source=(${options.source.map((s) => `"${s}"`).join("\n        ")})`);
  lines.push("");
  lines.push(`sha256sums=(${options.sha256sums.map((s) => `"${s}"`).join("\n            ")})`);
  lines.push("");

  if (options.install) {
    lines.push(`install=${options.install}`);
    lines.push("");
  }

  // prepare() function
  lines.push("prepare() {");
  lines.push(`  cd "${options.buildDir}"`);
  lines.push("");
  lines.push("  # Install dependencies with bun");
  lines.push("  bun install --frozen-lockfile");
  lines.push("}");
  lines.push("");

  // build() function
  lines.push("build() {");
  lines.push(`  cd "${options.buildDir}"`);
  lines.push("");
  lines.push("  # Build desktop app");
  lines.push("  export T3_SYSTEM_ELECTRON_PATH=/usr/lib/electron");
  lines.push("  bun run build:desktop");
  lines.push("}");
  lines.push("");

  // check() function (optional)
  lines.push("check() {");
  lines.push(`  cd "${options.buildDir}"`);
  lines.push("");
  lines.push("  # Run smoke tests if available");
  lines.push("  bun run test:desktop-smoke || true");
  lines.push("}");
  lines.push("");

  // package() function
  lines.push("package() {");
  lines.push(`  cd "${options.buildDir}"`);
  lines.push("");
  lines.push("  # Create installation directories");
  lines.push(`  install -dm755 "\${pkgdir}/usr/lib/${options.pkgname}"`);
  lines.push(`  install -dm755 "\${pkgdir}/usr/bin"`);
  lines.push(`  install -dm755 "\${pkgdir}/usr/share/applications"`);
  lines.push(`  install -dm755 "\${pkgdir}/usr/share/pixmaps"`);
  lines.push(`  install -dm755 "\${pkgdir}/usr/share/metainfo"`);
  lines.push("");
  lines.push("  # Copy application files");
  lines.push(`  cp -r apps/desktop/dist-electron "\${pkgdir}/usr/lib/${options.pkgname}/"`);
  lines.push(`  cp -r apps/server/dist "\${pkgdir}/usr/lib/${options.pkgname}/server"`);
  lines.push(
    `  cp -r apps/web/dist "\${pkgdir}/usr/lib/${options.pkgname}/web" 2>/dev/null || true`,
  );
  lines.push("");
  lines.push("  # Install desktop entry");
  lines.push(`  install -Dm644 apps/desktop/resources/t3code.desktop \\`);
  lines.push(`    "\${pkgdir}/usr/share/applications/${options.pkgname}.desktop"`);
  lines.push("");
  lines.push("  # Install icons");
  lines.push(`  install -Dm644 apps/desktop/resources/icon.png \\`);
  lines.push(`    "\${pkgdir}/usr/share/pixmaps/${options.pkgname}.png"`);
  lines.push("");
  lines.push("  # Install AppStream metadata");
  lines.push(`  install -Dm644 apps/desktop/resources/com.t3tools.t3code.appdata.xml \\`);
  lines.push(`    "\${pkgdir}/usr/share/metainfo/com.t3tools.t3code.appdata.xml"`);
  lines.push("");
  lines.push("  # Create wrapper script that uses system electron");
  lines.push(`  cat > "\${pkgdir}/usr/bin/${options.pkgname}" << 'EOF'`);
  lines.push("#!/bin/bash");
  lines.push("# T3 Code launcher - uses system electron");
  lines.push("");
  lines.push("export T3_SYSTEM_ELECTRON_PATH=/usr/lib/electron");
  lines.push(
    `exec /usr/lib/electron/electron /usr/lib/${options.pkgname}/dist-electron/main.js "\$@"`,
  );
  lines.push("EOF");
  lines.push("");
  lines.push(`  chmod +x "\${pkgdir}/usr/bin/${options.pkgname}"`);
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate .SRCINFO content for the AUR
 */
export function generateSrcinfo(options: PkgbuildOptions): string {
  const lines: string[] = [];

  lines.push("pkgbase = t3code");
  lines.push("\tpkgdesc = " + options.pkgdesc);
  lines.push("\tpkgver = " + options.pkgver);
  lines.push("\tpkgrel = " + options.pkgrel);
  lines.push("\turl = " + options.url);
  lines.push("\tinstall = " + (options.install || "t3code.install"));
  lines.push("\tarch = " + options.arch.join(" "));
  lines.push("\tlicense = " + options.license);

  for (const dep of options.depends) {
    lines.push("\tdepends = " + dep);
  }

  for (const mdep of options.makedepends) {
    lines.push("\tmakedepends = " + mdep);
  }

  for (const prov of options.provides) {
    lines.push("\tprovides = " + prov);
  }

  for (const conf of options.conflicts) {
    lines.push("\tconflicts = " + conf);
  }

  for (const src of options.source) {
    lines.push("\tsource = " + src);
  }

  for (const sha of options.sha256sums) {
    lines.push("\tsha256sums = " + sha);
  }

  lines.push("pkgname = t3code");
  lines.push("");

  return lines.join("\n");
}

/**
 * Generate install script for the package
 */
export function generateInstallScript(): string {
  return `#!/bin/bash
# T3 Code install script

post_install() {
  echo "T3 Code has been installed."
  echo ""
  echo "To launch: run 't3code' from your terminal or use the desktop entry."
  echo ""
  echo "Note: This package uses system electron. If you encounter issues,"
  echo "ensure your system electron version is compatible."
}

post_upgrade() {
  post_install
}

pre_remove() {
  # Clean up any running instances
  pkill -f "t3code" 2>/dev/null || true
}

post_remove() {
  echo "T3 Code has been removed."
}
`;
}
