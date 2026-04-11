import { resolveElectronPackageName } from "./electron-package.ts";

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
  provides: string[];
  conflicts: string[];
  source: string[];
  sha256sums: string[];
  install?: string;
  electronVersion: string;
  buildDir: string;
}

function formatInlineArray(values: string[]): string {
  return `(${values.map((value) => `"${value}"`).join(" ")})`;
}

function formatIndentedArray(values: string[], indent: string): string {
  if (values.length === 0) {
    return "()";
  }

  return `(${values
    .map((value, index) => `${index === 0 ? "" : `\n${indent}`}${JSON.stringify(value)}`)
    .join("")})`;
}

function buildLauncherScript(electronVersion: string): string {
  const electronPackageName = resolveElectronPackageName(electronVersion);

  return [
    "#!/bin/bash",
    "set -euo pipefail",
    "",
    "# T3 Code launcher - uses system Electron managed by pacman",
    "# Note: Auto-updates are disabled because pacman manages updates.",
    "",
    "export T3_SKIP_AUTO_UPDATE=1",
    "export T3CODE_APP_ROOT=/usr/lib/t3code",
    "",
    'electron_bin=""',
    `for candidate in /usr/bin/${electronPackageName} /usr/sbin/${electronPackageName}; do`,
    '  if [[ -x "$candidate" ]]; then',
    '    electron_bin="$candidate"',
    "    break",
    "  fi",
    "done",
    "",
    `if [[ -z "$electron_bin" ]] && command -v ${electronPackageName} >/dev/null 2>&1; then`,
    `  electron_bin="$(command -v ${electronPackageName})"`,
    "fi",
    "",
    'if [[ -z "$electron_bin" ]]; then',
    `  printf '%s\\n' "t3code: ${electronPackageName} is required but was not found" >&2`,
    "  exit 1",
    "fi",
    "",
    'export T3_SYSTEM_ELECTRON_PATH="$electron_bin"',
    "",
    'display_backend=""',
    'if [[ "${XDG_SESSION_TYPE:-}" == "wayland" || -n "${WAYLAND_DISPLAY:-}" ]]; then',
    '  display_backend="wayland"',
    'elif [[ "${XDG_SESSION_TYPE:-}" == "x11" || -n "${DISPLAY:-}" ]]; then',
    '  display_backend="x11"',
    "fi",
    "",
    "has_explicit_ozone_platform=0",
    'if [[ -n "${T3CODE_ELECTRON_FLAGS:-}" ]]; then',
    '  read -r -a parsed_flag_tokens <<< "${T3CODE_ELECTRON_FLAGS}"',
    '  for token in "${parsed_flag_tokens[@]}"; do',
    '    if [[ "$token" == --ozone-platform || "$token" == --ozone-platform=* ]]; then',
    "      has_explicit_ozone_platform=1",
    "      break",
    "    fi",
    "  done",
    "fi",
    "",
    'if [[ "$display_backend" == "wayland" && $has_explicit_ozone_platform -eq 0 ]]; then',
    "  has_nvidia_signal=0",
    '  if [[ "${__NV_PRIME_RENDER_OFFLOAD:-}" == "1" || "${DRI_PRIME:-}" == "1" ]]; then',
    "    has_nvidia_signal=1",
    '  elif [[ -n "${NVIDIA_VISIBLE_DEVICES:-}" && "${NVIDIA_VISIBLE_DEVICES}" != "none" ]]; then',
    "    has_nvidia_signal=1",
    "  elif [[ -e /proc/driver/nvidia/version || -e /sys/module/nvidia/version ]]; then",
    "    has_nvidia_signal=1",
    "  fi",
    "",
    "  has_external_connected=0",
    "  if [[ $has_nvidia_signal -eq 1 ]]; then",
    "    for status_path in /sys/class/drm/card*-*/status; do",
    '      [[ -e "$status_path" ]] || continue',
    '      status="$(<"$status_path")"',
    '      status="${status,,}"',
    "      status=\"${status//$'\\n'/}\"",
    '      [[ "$status" == "connected" ]] || continue',
    '      connector="${status_path%/status}"',
    '      connector="${connector##*/}"',
    '      connector="${connector,,}"',
    '      if [[ "$connector" != *edp* && "$connector" != *lvds* && "$connector" != *dsi* ]]; then',
    "        has_external_connected=1",
    "        break",
    "      fi",
    "    done",
    "  fi",
    "",
    "  if [[ $has_external_connected -eq 1 ]]; then",
    '    display_backend="x11"',
    "  fi",
    "fi",
    "",
    "electron_args=()",
    'case "$display_backend" in',
    "  wayland)",
    "    electron_args+=(--ozone-platform=wayland --enable-features=WaylandWindowDecorations --disable-features=Vulkan)",
    "    ;;",
    "  x11)",
    "    electron_args+=(--ozone-platform=x11)",
    "    ;;",
    "esac",
    "",
    'if [[ -n "${T3CODE_ELECTRON_FLAGS:-}" ]]; then',
    '  read -r -a extra_electron_args <<< "${T3CODE_ELECTRON_FLAGS}"',
    '  electron_args+=("${extra_electron_args[@]}")',
    "fi",
    "",
    "cd /usr/lib/t3code",
    'exec "$electron_bin" "${electron_args[@]}" /usr/lib/t3code/apps/desktop/dist-electron/main.js "$@"',
  ].join("\n");
}

export function generatePkgbuild(options: PkgbuildOptions): string {
  const lines: string[] = [];
  const launcherScript = buildLauncherScript(options.electronVersion).split("\n");

  lines.push("# Maintainer: T3 Code Team <team@t3tools.com>");
  lines.push("# This file is auto-generated. Do not edit manually.");
  lines.push("");
  lines.push(`pkgname=${options.pkgname}`);
  lines.push(`pkgver=${options.pkgver}`);
  lines.push(`pkgrel=${options.pkgrel}`);
  lines.push(`pkgdesc=${JSON.stringify(options.pkgdesc)}`);
  lines.push(`arch=${formatInlineArray(options.arch)}`);
  lines.push(`url=${JSON.stringify(options.url)}`);
  lines.push(`license=${formatInlineArray([options.license])}`);
  lines.push("");
  lines.push(`depends=${formatInlineArray(options.depends)}`);
  lines.push(`makedepends=${formatInlineArray(options.makedepends)}`);
  lines.push(`provides=${formatInlineArray(options.provides)}`);
  lines.push(`conflicts=${formatInlineArray(options.conflicts)}`);
  lines.push("");
  lines.push(`source=${formatIndentedArray(options.source, "        ")}`);
  lines.push("");
  lines.push(`sha256sums=${formatIndentedArray(options.sha256sums, "            ")}`);
  lines.push("");

  if (options.install) {
    lines.push(`install=${options.install}`);
    lines.push("");
  }

  lines.push("prepare() {");
  lines.push(`  cd "${options.buildDir}"`);
  lines.push("");
  lines.push("  # Source is pre-built, no preparation needed");
  lines.push("  :");
  lines.push("}");
  lines.push("");

  lines.push("build() {");
  lines.push(`  cd "${options.buildDir}"`);
  lines.push("");
  lines.push("  # Source is pre-built, no build needed");
  lines.push("  :");
  lines.push("}");
  lines.push("");

  lines.push("check() {");
  lines.push(`  cd "${options.buildDir}"`);
  lines.push("");
  lines.push("  # No package-time smoke test is defined yet.");
  lines.push("  :");
  lines.push("}");
  lines.push("");

  lines.push("package() {");
  lines.push(`  cd "${options.buildDir}"`);
  lines.push("");
  lines.push("  # Create installation directories");
  lines.push('  install -dm755 "${pkgdir}/usr/lib/t3code"');
  lines.push('  install -dm755 "${pkgdir}/usr/lib/t3code/apps/desktop"');
  lines.push('  install -dm755 "${pkgdir}/usr/lib/t3code/apps/server"');
  lines.push('  install -dm755 "${pkgdir}/usr/lib/t3code/apps/server/dist"');
  lines.push('  install -dm755 "${pkgdir}/usr/lib/t3code/apps/web"');
  lines.push('  install -dm755 "${pkgdir}/usr/lib/t3code/apps/web/dist"');
  lines.push('  install -dm755 "${pkgdir}/usr/bin"');
  lines.push('  install -dm755 "${pkgdir}/usr/share/applications"');
  lines.push('  install -dm755 "${pkgdir}/usr/share/pixmaps"');
  lines.push('  install -dm755 "${pkgdir}/usr/share/metainfo"');
  lines.push("");
  lines.push("  # Copy application files");
  lines.push(
    '  cp -r ${srcdir}/t3code-local/dist-electron "${pkgdir}/usr/lib/t3code/apps/desktop/"',
  );
  lines.push('  cp -r ${srcdir}/t3code-local/node_modules "${pkgdir}/usr/lib/t3code/"');
  lines.push(
    '  cp -r ${srcdir}/t3code-local/server/. "${pkgdir}/usr/lib/t3code/apps/server/dist/"',
  );
  lines.push(
    '  cp -r ${srcdir}/t3code-local/web/. "${pkgdir}/usr/lib/t3code/apps/web/dist/" 2>/dev/null || true',
  );
  lines.push("  # Remove any broken symlinks from node_modules (bun may create them)");
  lines.push(
    '  find "${pkgdir}/usr/lib/t3code/node_modules" -type l \\! -exec test -e {} \\; -print -delete 2>/dev/null || true',
  );
  lines.push("");
  lines.push("  # Install desktop entry");
  lines.push("  install -Dm644 ${srcdir}/t3code.desktop \\");
  lines.push('    "${pkgdir}/usr/share/applications/t3code.desktop"');
  lines.push("");
  lines.push("  # Install icons");
  lines.push("  install -Dm644 ${srcdir}/icon.png \\");
  lines.push('    "${pkgdir}/usr/share/pixmaps/t3code.png"');
  lines.push("");
  lines.push("  # Install AppStream metadata");
  lines.push("  install -Dm644 ${srcdir}/com.t3tools.t3code.appdata.xml \\");
  lines.push('    "${pkgdir}/usr/share/metainfo/com.t3tools.t3code.appdata.xml"');
  lines.push("");
  lines.push("  # Disable auto-updater for AUR builds (pacman manages updates)");
  lines.push(
    "  sed -i 's|await electron_updater.autoUpdater.checkForUpdates()|/* auto-updater disabled */ { accepted: false }|g' \"${pkgdir}/usr/lib/t3code/apps/desktop/dist-electron/main.js\"",
  );
  lines.push("");
  lines.push("  cat > \"${pkgdir}/usr/bin/t3code\" << 'EOF'");
  lines.push(...launcherScript);
  lines.push("EOF");
  lines.push("");
  lines.push('  chmod +x "${pkgdir}/usr/bin/t3code"');
  lines.push("}");

  return `${lines.join("\n")}\n`;
}

export function generateSrcinfo(options: PkgbuildOptions): string {
  const lines: string[] = [];

  lines.push(`pkgbase = ${options.pkgname}`);
  lines.push(`\tpkgdesc = ${options.pkgdesc}`);
  lines.push(`\tpkgver = ${options.pkgver}`);
  lines.push(`\tpkgrel = ${options.pkgrel}`);
  lines.push(`\turl = ${options.url}`);
  if (options.install) {
    lines.push(`\tinstall = ${options.install}`);
  }
  for (const arch of options.arch) {
    lines.push(`\tarch = ${arch}`);
  }
  lines.push(`\tlicense = ${options.license}`);
  for (const depends of options.depends) {
    lines.push(`\tdepends = ${depends}`);
  }
  for (const makedepends of options.makedepends) {
    lines.push(`\tmakedepends = ${makedepends}`);
  }
  for (const provides of options.provides) {
    lines.push(`\tprovides = ${provides}`);
  }
  for (const conflicts of options.conflicts) {
    lines.push(`\tconflicts = ${conflicts}`);
  }
  for (const source of options.source) {
    lines.push(`\tsource = ${source}`);
  }
  for (const sha256sum of options.sha256sums) {
    lines.push(`\tsha256sums = ${sha256sum}`);
  }
  lines.push("");
  lines.push(`pkgname = ${options.pkgname}`);

  return `${lines.join("\n")}\n`;
}

export function generateInstallScript(): string {
  return `post_install() {
  cat <<'MSG'
T3 Code installed successfully.

Launch with:
  t3code

Note: this package uses system Electron and disables built-in auto-updates.
Updates are managed through pacman/AUR.
MSG
}

post_upgrade() {
  post_install
}
`;
}
