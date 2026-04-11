export function resolveElectronPackageName(electronVersion: string): string {
  const major = Number.parseInt(electronVersion.split(".")[0] ?? "", 10);
  return Number.isInteger(major) && major > 0 ? `electron${major}` : "electron";
}
