# AUR Packaging Plan for T3 Code Desktop

## Objective

Create scripts to generate and maintain a proper Arch Linux AUR package for the T3 Code desktop app that:

- Builds from source using system electron (not bundled)
- Provides automatic rebuild/update capability
- Follows Arch packaging conventions

## Background Analysis

**Current State:**

- Desktop app uses `electron-builder` via `scripts/build-desktop-artifact.ts`
- Linux releases only produce AppImage (`t3code-bin` AUR package likely repackages this)
- `electron-builder` natively supports `pacman` target
- System electron fallback was just implemented in `electron-launcher.mjs`
- The repo uses Bun as package manager and build tool

**Key Insight:** A proper AUR package (`t3code` not `-bin`) should:

1. Build from source using system electron
2. Not bundle electron (use `/usr/lib/electron`)
3. Declare proper dependencies (bun, node, system electron)
4. Support clean rebuilds

## Implementation Plan

### Phase 1: Build System Enhancement

- [ ] Task 1. Add `--target pacman` support to `build-desktop-artifact.ts`
  - Rationale: The script already supports `--target AppImage|dmg|nsis`, adding `pacman` enables native .pkg.tar.zst generation
  - Modify `scripts/build-desktop-artifact.ts` around line 505-517 to add `pacman` target configuration
  - Set `target: ["pacman"]` in linux config when platform is linux and target is pacman

- [ ] Task 2. Add `--use-system-electron` flag to `build-desktop-artifact.ts`
  - Rationale: AUR packages must use system electron, not bundled electron
  - When flag is set, modify the staged `package.json` to exclude `electron` from dependencies
  - Set `ELECTRON_OVERRIDE_DIST_PATH` or our new `T3_SYSTEM_ELECTRON_PATH` in build environment
  - May need to skip electron-builder for this case and create PKGBUILD manually instead

- [ ] Task 3. Create `scripts/generate-pkgbuild.ts` - PKGBUILD generator script
  - Rationale: PKGBUILD for system-electron build needs custom logic, not just electron-builder
  - Parse version from `apps/desktop/package.json`
  - Generate `PKGBUILD` template with:
    - `depends=(electron nodejs)` - system electron, not bundled
    - `makedepends=(bun git)`
    - Build function that runs `bun install` and `bun run build:desktop`
    - Package function that installs to `/usr/lib/t3code/` with `.desktop` file
    - Wrapper script that launches with system electron

### Phase 2: AUR Package Scripts

- [ ] Task 4. Add `dist:desktop:aur` script to root `package.json`
  - Rationale: Convenience command for AUR package generation
  - Command: `node scripts/generate-aur-package.ts`
  - Generates complete AUR package structure in `dist/aur/`

- [ ] Task 5. Create `scripts/generate-aur-package.ts` - Main AUR orchestrator
  - Rationale: Coordinates all steps to produce installable AUR package
  - Steps:
    1. Run `bun run build:desktop` to ensure fresh build
    2. Copy built artifacts to staging area
    3. Generate PKGBUILD with proper checksums
    4. Create `.desktop` entry file
    5. Create wrapper script `t3code` that launches with system electron
    6. Output to `dist/aur/t3code/` ready for `makepkg`

- [ ] Task 6. Create `scripts/aur-rebuild.sh` - Rebuild and update script
  - Rationale: Automates local rebuilds for development/testing
  - Actions:
    - Bump `pkgver` in PKGBUILD (if version changed)
    - Update checksums with `updpkgsums`
    - Run `makepkg -si` to build and install
    - Option to push to AUR (if maintainer)

- [ ] Task 7. Create `scripts/aur-publish.sh` - Publish to AUR helper
  - Rationale: Streamlines publishing updates to AUR
  - Uses `aurpublish` or manual git push to AUR
  - Updates .SRCINFO with `makepkg --printsrcinfo > .SRCINFO`

### Phase 3: Supporting Files

- [ ] Task 8. Create `.desktop` entry template in `apps/desktop/resources/`
  - Rationale: Required for desktop integration in AUR packages
  - File: `t3code.desktop`
  - Contents: Name, Exec, Icon, Categories, MIME types

- [ ] Task 9. Create AppStream metadata template
  - Rationale: Modern Arch packages should include AppStream data
  - File: `com.t3tools.t3code.appdata.xml`
  - Include in PKGBUILD install

- [ ] Task 10. Add AUR documentation section to `CONTRIBUTING.md`
  - Rationale: Document the AUR packaging process for maintainers
  - How to generate, test, and publish the AUR package

## Verification Criteria

- [ ] Running `bun run dist:desktop:aur` produces a valid `dist/aur/t3code/` directory
- [ ] `cd dist/aur/t3code && makepkg -si` successfully builds and installs the package
- [ ] Installed app launches from desktop menu using system electron
- [ ] `bun run aur:rebuild` (or similar) regenerates and reinstalls cleanly
- [ ] Package depends on system `electron` package, not bundled electron
- [ ] Package size is significantly smaller than AppImage (no bundled electron)

## Potential Risks and Mitigations

1. **System Electron Version Mismatch**
   - Risk: System electron (v39) may differ from app's target (v40.6.0)
   - Mitigation: Update `depends` in PKGBUILD dynamically based on electron version in package.json; warn if major version differs

2. **Bun Availability in Build Environment**
   - Risk: AUR build environments may not have Bun installed
   - Mitigation: PKGBUILD must declare `bun` as makedepend; provide fallback to use system node/npm if bun unavailable

3. **Native Module Compilation**
   - Risk: `node-pty` and other native deps may fail in clean chroot
   - Mitigation: Ensure all build dependencies (python, gcc, etc.) are declared in makedepends

4. **Update Mechanism Conflict**
   - Risk: `electron-updater` may conflict with pacman updates
   - Mitigation: Disable auto-updater in AUR builds via compile-time flag or env var

## Alternative Approaches

1. **electron-builder pacman target (simpler, less ideal)**
   - Use: `npx electron-builder --linux pacman`
   - Pros: One command, produces .pkg.tar.zst
   - Cons: Bundles electron, larger package, violates AUR best practices

2. **Manual PKGBUILD (recommended, implemented above)**
   - Custom PKGBUILD that builds from source
   - Pros: Uses system electron, proper Arch conventions, smaller package
   - Cons: More complex, requires maintenance

3. **Hybrid: bin package + source package**
   - Keep `t3code-bin` (AppImage wrapper) for quick installs
   - Add `t3code` (source build) for Arch purists
   - Pros: Covers both use cases
   - Cons: Double maintenance burden

## Script Commands to Add to package.json

```json
{
  "dist:desktop:aur": "node scripts/generate-aur-package.ts",
  "aur:rebuild": "bash scripts/aur-rebuild.sh",
  "aur:publish": "bash scripts/aur-publish.sh"
}
```

## File Structure to Create

```
scripts/
  generate-aur-package.ts    # Main orchestrator
  aur-rebuild.sh             # Local rebuild helper
  aur-publish.sh             # AUR publish helper
  lib/
    pkgbuild-template.sh     # PKGBUILD template strings

apps/desktop/resources/
  t3code.desktop             # Desktop entry
  com.t3tools.t3code.appdata.xml  # AppStream metadata

dist/aur/t3code/             # Generated (gitignored)
  PKGBUILD
  .SRCINFO
  t3code.desktop
  ...
```
